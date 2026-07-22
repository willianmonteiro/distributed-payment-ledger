from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import asyncpg


@dataclass(frozen=True)
class IncomingTransferRecord:
    transfer_id: str
    payee_account_id: str
    amount_cents: int
    status: str
    reject_reason: str | None
    received_at: datetime


class IncomingTransferRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def find_by_id(self, transfer_id: str) -> IncomingTransferRecord | None:
        row = await self._pool.fetchrow(
            """SELECT transfer_id, payee_account_id, amount, status, reject_reason, received_at
                 FROM incoming_transfers WHERE transfer_id = $1""",
            transfer_id,
        )
        return _to_record(row) if row is not None else None

    async def try_insert(
        self,
        connection: asyncpg.Connection,
        *,
        transfer_id: str,
        payee_account_id: str,
        amount_cents: int,
        status: str,
        reject_reason: str | None,
    ) -> IncomingTransferRecord | None:
        """None when transfer_id already exists — a redelivery lost the race, not an error."""
        row = await connection.fetchrow(
            """INSERT INTO incoming_transfers
                 (transfer_id, payee_account_id, amount, status, reject_reason)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (transfer_id) DO NOTHING
               RETURNING
                 transfer_id, payee_account_id, amount, status, reject_reason, received_at""",
            transfer_id,
            payee_account_id,
            amount_cents,
            status,
            reject_reason,
        )
        return _to_record(row) if row is not None else None


def _to_record(row: asyncpg.Record) -> IncomingTransferRecord:
    return IncomingTransferRecord(
        transfer_id=str(row["transfer_id"]),
        payee_account_id=str(row["payee_account_id"]),
        amount_cents=row["amount"],
        status=row["status"],
        reject_reason=row["reject_reason"],
        received_at=row["received_at"],
    )
