from __future__ import annotations

import asyncpg

from app.domain.account import Account


class AccountRepository:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create(self, owner_name: str) -> Account:
        row = await self._pool.fetchrow(
            "INSERT INTO accounts (owner_name) VALUES ($1) RETURNING id, owner_name, created_at",
            owner_name,
        )
        assert row is not None
        return _to_account(row)

    async def find_by_id(self, account_id: str) -> Account | None:
        row = await self._pool.fetchrow(
            "SELECT id, owner_name, created_at FROM accounts WHERE id = $1", account_id
        )
        return _to_account(row) if row is not None else None

    async def lock_by_id(self, account_id: str, connection: asyncpg.Connection) -> bool:
        """Row-locks the account until the transaction ends. False when it doesn't exist."""
        row = await connection.fetchrow(
            "SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE", account_id
        )
        return row is not None


def _to_account(row: asyncpg.Record) -> Account:
    return Account(id=str(row["id"]), owner_name=row["owner_name"], created_at=row["created_at"])
