from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends

from app.accounts.repository import AccountRepository
from app.accounts.schemas import (
    AccountResponse,
    BalanceResponse,
    CreateAccountRequest,
    StatementLine,
    StatementResponse,
)
from app.db import get_pool
from app.domain import AccountNotFoundError
from app.ledger.repository import LedgerRepository

router = APIRouter(prefix="/accounts", tags=["accounts"])


def get_account_repository(pool: asyncpg.Pool = Depends(get_pool)) -> AccountRepository:
    return AccountRepository(pool)


def get_ledger_repository(pool: asyncpg.Pool = Depends(get_pool)) -> LedgerRepository:
    return LedgerRepository(pool)


@router.post("", response_model=AccountResponse, status_code=201)
async def create_account(
    body: CreateAccountRequest,
    accounts: AccountRepository = Depends(get_account_repository),
) -> AccountResponse:
    account = await accounts.create(body.owner_name)
    return AccountResponse.from_domain(account)


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: UUID,
    accounts: AccountRepository = Depends(get_account_repository),
) -> AccountResponse:
    account = await accounts.find_by_id(str(account_id))
    if account is None:
        raise AccountNotFoundError(str(account_id))
    return AccountResponse.from_domain(account)


@router.get("/{account_id}/balance", response_model=BalanceResponse)
async def get_balance(
    account_id: UUID,
    accounts: AccountRepository = Depends(get_account_repository),
    ledger: LedgerRepository = Depends(get_ledger_repository),
) -> BalanceResponse:
    if await accounts.find_by_id(str(account_id)) is None:
        raise AccountNotFoundError(str(account_id))
    balance = await ledger.balance_of(str(account_id))
    return BalanceResponse(account_id=str(account_id), balance_cents=balance.cents)


@router.get("/{account_id}/statement", response_model=StatementResponse)
async def get_statement(
    account_id: UUID,
    accounts: AccountRepository = Depends(get_account_repository),
    ledger: LedgerRepository = Depends(get_ledger_repository),
) -> StatementResponse:
    if await accounts.find_by_id(str(account_id)) is None:
        raise AccountNotFoundError(str(account_id))
    lines = await ledger.statement_of(str(account_id))
    entries = [
        StatementLine(
            transfer_id=line.transfer_id,
            amount_cents=line.amount.cents,
            created_at=line.created_at,
        )
        for line in lines
    ]
    return StatementResponse(account_id=str(account_id), entries=entries)
