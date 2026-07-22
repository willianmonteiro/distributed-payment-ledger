import pytest

from app.domain.errors import InvalidAmountError
from app.domain.money import Money


def test_holds_integer_cents() -> None:
    assert Money.from_cents(1050).cents == 1050


@pytest.mark.parametrize("value", [10.5, "100", None, True, False])
def test_rejects_non_integer_amounts(value: object) -> None:
    with pytest.raises(InvalidAmountError):
        Money.from_cents(value)  # type: ignore[arg-type]


def test_adds_and_negates_without_mutating() -> None:
    hundred = Money.from_cents(100)
    assert hundred.plus(Money.from_cents(50)).cents == 150
    assert hundred.negated().cents == -100
    assert hundred.cents == 100


def test_compares_and_checks_sign() -> None:
    assert Money.from_cents(100) == Money.from_cents(100)
    assert Money.from_cents(100) != Money.from_cents(99)
    assert Money.zero().is_positive() is False
    assert Money.from_cents(1).is_positive() is True
