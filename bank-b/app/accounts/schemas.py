from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.domain.account import Account


class CreateAccountRequest(BaseModel):
    owner_name: str = Field(min_length=1, max_length=120)


class AccountResponse(BaseModel):
    id: str
    owner_name: str
    created_at: datetime

    @classmethod
    def from_domain(cls, account: Account) -> AccountResponse:
        return cls(id=account.id, owner_name=account.owner_name, created_at=account.created_at)


class BalanceResponse(BaseModel):
    account_id: str
    balance_cents: int


class StatementLine(BaseModel):
    transfer_id: str
    amount_cents: int
    created_at: datetime


class StatementResponse(BaseModel):
    account_id: str
    entries: list[StatementLine]
