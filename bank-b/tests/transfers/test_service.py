from __future__ import annotations

import asyncio
import os
import uuid
from collections.abc import AsyncIterator

import asyncpg
import pytest
from dotenv import load_dotenv

from app.accounts.repository import AccountRepository
from app.domain.suspense_account import SUSPENSE_ACCOUNT_ID
from app.ledger.repository import LedgerRepository
from app.transfers.repository import IncomingTransferRepository
from app.transfers.service import (
    ACCOUNT_NOT_FOUND,
    InboundTransfersService,
    TransferInitiatedEvent,
)

load_dotenv()


@pytest.fixture
async def pool() -> AsyncIterator[asyncpg.Pool]:
    """Runs against the real Bank B Postgres from docker-compose, not a mock."""
    created = await asyncpg.create_pool(dsn=os.environ["DATABASE_URL"])
    yield created
    await created.close()


@pytest.fixture
def service(pool: asyncpg.Pool) -> InboundTransfersService:
    return InboundTransfersService(
        pool,
        IncomingTransferRepository(pool),
        AccountRepository(pool),
        LedgerRepository(pool),
    )


async def _create_account(pool: asyncpg.Pool, owner_name: str) -> str:
    row = await pool.fetchrow(
        "INSERT INTO accounts (owner_name) VALUES ($1) RETURNING id", owner_name
    )
    assert row is not None
    return str(row["id"])


async def test_credits_the_payee_and_debits_suspense(
    pool: asyncpg.Pool, service: InboundTransfersService
) -> None:
    payee = await _create_account(pool, "payee")
    ledger = LedgerRepository(pool)
    suspense_before = await ledger.balance_of(SUSPENSE_ACCOUNT_ID)

    reply = await service.handle(
        TransferInitiatedEvent(
            transfer_id=str(uuid.uuid4()), payee_account_id=payee, amount_cents=1_500
        )
    )

    assert reply.event_type == "transfer.accepted"
    assert reply.reason is None
    assert (await ledger.balance_of(payee)).cents == 1_500

    suspense_after = await ledger.balance_of(SUSPENSE_ACCOUNT_ID)
    assert suspense_after.cents - suspense_before.cents == -1_500


async def test_rejects_when_the_payee_account_does_not_exist(
    service: InboundTransfersService,
) -> None:
    reply = await service.handle(
        TransferInitiatedEvent(
            transfer_id=str(uuid.uuid4()), payee_account_id=str(uuid.uuid4()), amount_cents=500
        )
    )

    assert reply.event_type == "transfer.rejected"
    assert reply.reason == ACCOUNT_NOT_FOUND


async def test_redelivery_of_the_same_transfer_id_does_not_credit_twice(
    pool: asyncpg.Pool, service: InboundTransfersService
) -> None:
    payee = await _create_account(pool, "payee")
    ledger = LedgerRepository(pool)
    event = TransferInitiatedEvent(
        transfer_id=str(uuid.uuid4()), payee_account_id=payee, amount_cents=1_000
    )

    first = await service.handle(event)
    second = await service.handle(event)

    assert first.event_type == second.event_type == "transfer.accepted"
    assert (await ledger.balance_of(payee)).cents == 1_000


async def test_concurrent_delivery_of_the_same_transfer_id_credits_exactly_once(
    pool: asyncpg.Pool, service: InboundTransfersService
) -> None:
    payee = await _create_account(pool, "payee")
    ledger = LedgerRepository(pool)
    event = TransferInitiatedEvent(
        transfer_id=str(uuid.uuid4()), payee_account_id=payee, amount_cents=2_000
    )

    replies = await asyncio.gather(*(service.handle(event) for _ in range(5)))

    assert all(reply.event_type == "transfer.accepted" for reply in replies)
    assert (await ledger.balance_of(payee)).cents == 2_000
