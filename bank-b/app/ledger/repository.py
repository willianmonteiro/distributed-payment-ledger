from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

import asyncpg

from app.domain.ledger_entry import LedgerEntry
from app.domain.money import Money

type Executor = asyncpg.Pool | asyncpg.Connection


@dataclass(frozen=True)
class StatementLine:
    transfer_id: str
    amount: Money
    created_at: datetime


class LedgerRepository:
    """Queries accept an optional executor so they can join a caller-managed transaction."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def balance_of(self, account_id: str, executor: Executor | None = None) -> Money:
        conn: Executor = executor if executor is not None else self._pool
        row = await conn.fetchrow(
            "SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_entries WHERE account_id = $1",
            account_id,
        )
        assert row is not None
        return Money.from_cents(int(row["balance"]))

    async def append(self, entries: list[LedgerEntry], connection: asyncpg.Connection) -> None:
        for entry in entries:
            await connection.execute(
                "INSERT INTO ledger_entries (transfer_id, account_id, amount) VALUES ($1, $2, $3)",
                entry.transfer_id,
                entry.account_id,
                entry.amount.cents,
            )

    async def statement_of(self, account_id: str, limit: int = 50) -> list[StatementLine]:
        rows = await self._pool.fetch(
            """SELECT transfer_id, amount, created_at
                 FROM ledger_entries WHERE account_id = $1
                ORDER BY id DESC LIMIT $2""",
            account_id,
            limit,
        )
        return [
            StatementLine(
                transfer_id=str(row["transfer_id"]),
                amount=Money.from_cents(row["amount"]),
                created_at=row["created_at"],
            )
            for row in rows
        ]
