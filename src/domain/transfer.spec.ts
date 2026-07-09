import { InsufficientFundsError, InvalidAmountError, SelfTransferError } from './errors';
import { Money } from './money';
import { Transfer } from './transfer';

const base = {
  id: 'tr-1',
  payerAccountId: 'acc-payer',
  payeeAccountId: 'acc-payee',
};

describe('Transfer', () => {
  it('rejects non-positive amounts', () => {
    expect(() => Transfer.create({ ...base, amount: Money.zero() })).toThrow(InvalidAmountError);
    expect(() => Transfer.create({ ...base, amount: Money.fromCents(-1) })).toThrow(
      InvalidAmountError,
    );
  });

  it('rejects transfers to the same account', () => {
    expect(() =>
      Transfer.create({ ...base, payeeAccountId: base.payerAccountId, amount: Money.fromCents(1) }),
    ).toThrow(SelfTransferError);
  });

  it('produces a double entry that sums to zero', () => {
    const transfer = Transfer.create({ ...base, amount: Money.fromCents(100) });
    const [debit, credit] = transfer.entries();

    expect(debit.accountId).toBe(base.payerAccountId);
    expect(debit.amount.cents).toBe(-100);
    expect(credit.accountId).toBe(base.payeeAccountId);
    expect(credit.amount.cents).toBe(100);
    expect(debit.amount.plus(credit.amount).equals(Money.zero())).toBe(true);
    expect(debit.transferId).toBe(credit.transferId);
  });

  it('enforces sufficient payer balance', () => {
    const transfer = Transfer.create({ ...base, amount: Money.fromCents(100) });

    expect(() => transfer.assertPayerCanAfford(Money.fromCents(99))).toThrow(
      InsufficientFundsError,
    );
    expect(() => transfer.assertPayerCanAfford(Money.fromCents(100))).not.toThrow();
  });
});
