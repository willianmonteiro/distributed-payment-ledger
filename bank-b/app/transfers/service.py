from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

import asyncpg

from app.accounts.repository import AccountRepository
from app.domain.ledger_entry import LedgerEntry
from app.domain.money import Money
from app.domain.suspense_account import SUSPENSE_ACCOUNT_ID
from app.ledger.repository import LedgerRepository
from app.transfers.repository import IncomingTransferRecord, IncomingTransferRepository

ACCOUNT_NOT_FOUND = "ACCOUNT_NOT_FOUND"


@dataclass(frozen=True)
class TransferInitiatedEvent:
    transfer_id: str
    payee_account_id: str
    amount_cents: int


@dataclass(frozen=True)
class ReplyEvent:
    event_type: str  # "transfer.accepted" | "transfer.rejected"
    transfer_id: str
    reason: str | None
    occurred_at: str


class InboundTransfersService:
    """Credits a payee for a transfer initiated by Bank A, idempotently."""

    def __init__(
        self,
        pool: asyncpg.Pool,
        incoming_transfers: IncomingTransferRepository,
        accounts: AccountRepository,
        ledger: LedgerRepository,
    ) -> None:
        self._pool = pool
        self._incoming_transfers = incoming_transfers
        self._accounts = accounts
        self._ledger = ledger

    async def handle(self, event: TransferInitiatedEvent) -> ReplyEvent:
        existing = await self._incoming_transfers.find_by_id(event.transfer_id)
        if existing is not None:
            return _reply_for(existing)

        record: IncomingTransferRecord | None
        async with self._pool.acquire() as connection, connection.transaction():
            # payee_account_id is opaque to Bank A — it never validates the
            # format, so a malformed id has to be treated as "no such
            # account" here rather than reaching the database as the wrong type.
            account = (
                await self._accounts.find_by_id(event.payee_account_id)
                if _is_valid_uuid(event.payee_account_id)
                else None
            )
            if account is None:
                # The incoming_transfers row is the record of "someone asked for this
                # transfer_id"; it must be written before any ledger entry, or a lost
                # idempotency race (see below) could credit twice while this table
                # still shows only one row.
                record = await self._incoming_transfers.try_insert(
                    connection,
                    transfer_id=event.transfer_id,
                    payee_account_id=event.payee_account_id,
                    amount_cents=event.amount_cents,
                    status="REJECTED",
                    reject_reason=ACCOUNT_NOT_FOUND,
                )
            else:
                record = await self._incoming_transfers.try_insert(
                    connection,
                    transfer_id=event.transfer_id,
                    payee_account_id=event.payee_account_id,
                    amount_cents=event.amount_cents,
                    status="CREDITED",
                    reject_reason=None,
                )
                if record is not None:
                    amount = Money.from_cents(event.amount_cents)
                    entries = [
                        LedgerEntry(
                            transfer_id=event.transfer_id,
                            account_id=SUSPENSE_ACCOUNT_ID,
                            amount=amount.negated(),
                        ),
                        LedgerEntry(
                            transfer_id=event.transfer_id,
                            account_id=event.payee_account_id,
                            amount=amount,
                        ),
                    ]
                    await self._ledger.append(entries, connection)

        if record is not None:
            return _reply_for(record)

        # Lost the race on transfer_id: a concurrent delivery of the same
        # message already committed by now (ON CONFLICT only skips after the
        # competing transaction commits).
        winner = await self._incoming_transfers.find_by_id(event.transfer_id)
        if winner is None:
            raise RuntimeError(f"incoming_transfers row for {event.transfer_id} vanished.")
        return _reply_for(winner)


def _reply_for(record: IncomingTransferRecord) -> ReplyEvent:
    if record.status == "CREDITED":
        return ReplyEvent(
            event_type="transfer.accepted",
            transfer_id=record.transfer_id,
            reason=None,
            occurred_at=_now(),
        )
    return ReplyEvent(
        event_type="transfer.rejected",
        transfer_id=record.transfer_id,
        reason=record.reject_reason,
        occurred_at=_now(),
    )


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _is_valid_uuid(value: str) -> bool:
    try:
        uuid.UUID(value)
        return True
    except ValueError:
        return False
