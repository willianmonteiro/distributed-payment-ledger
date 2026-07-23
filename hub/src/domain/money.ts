import { InvalidAmountError } from './errors';

/**
 * Monetary value in integer cents. Signed: reserve debits are negative,
 * credits positive. Floats are never allowed anywhere near money.
 */
export class Money {
  private constructor(public readonly cents: number) {}

  static fromCents(cents: number): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new InvalidAmountError(cents);
    }
    return new Money(cents);
  }

  static zero(): Money {
    return new Money(0);
  }

  negated(): Money {
    return Money.fromCents(-this.cents);
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }
}
