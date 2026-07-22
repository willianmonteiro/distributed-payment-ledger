from __future__ import annotations

from app.domain.errors import InvalidAmountError


class Money:
    """Monetary value in integer cents. Signed: ledger debits are negative, credits positive."""

    __slots__ = ("_cents",)

    def __init__(self, cents: int) -> None:
        if not isinstance(cents, int) or isinstance(cents, bool):
            raise InvalidAmountError(cents)
        self._cents = cents

    @classmethod
    def from_cents(cls, cents: int) -> Money:
        return cls(cents)

    @classmethod
    def zero(cls) -> Money:
        return cls(0)

    @property
    def cents(self) -> int:
        return self._cents

    def plus(self, other: Money) -> Money:
        return Money(self._cents + other._cents)

    def negated(self) -> Money:
        return Money(-self._cents)

    def is_positive(self) -> bool:
        return self._cents > 0

    def __eq__(self, other: object) -> bool:
        return isinstance(other, Money) and self._cents == other._cents

    def __hash__(self) -> int:
        return hash(self._cents)

    def __repr__(self) -> str:
        return f"Money(cents={self._cents})"
