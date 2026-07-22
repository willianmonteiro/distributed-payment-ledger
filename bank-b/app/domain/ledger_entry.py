from __future__ import annotations

from dataclasses import dataclass

from app.domain.money import Money


@dataclass(frozen=True)
class LedgerEntry:
    transfer_id: str
    account_id: str
    amount: Money
