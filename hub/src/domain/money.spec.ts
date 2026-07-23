import { InvalidAmountError } from './errors';
import { Money } from './money';

describe('Money', () => {
  it('holds integer cents', () => {
    expect(Money.fromCents(1050).cents).toBe(1050);
  });

  it.each([10.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects non-safe-integer amounts (%p)',
    (value) => {
      expect(() => Money.fromCents(value)).toThrow(InvalidAmountError);
    },
  );

  it('negates without mutating', () => {
    const hundred = Money.fromCents(100);
    expect(hundred.negated().cents).toBe(-100);
    expect(hundred.cents).toBe(100);
  });

  it('compares and checks sign', () => {
    expect(Money.fromCents(100).equals(Money.fromCents(100))).toBe(true);
    expect(Money.fromCents(100).equals(Money.fromCents(99))).toBe(false);
    expect(Money.zero().isPositive()).toBe(false);
    expect(Money.fromCents(1).isPositive()).toBe(true);
  });
});
