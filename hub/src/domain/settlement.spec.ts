import { InvalidAmountError, SameBankSettlementError } from './errors';
import { Money } from './money';
import { Settlement } from './settlement';

const base = {
  id: 'settlement-1',
  payerBankId: 'bank-a',
  payeeBankId: 'bank-b',
  payeeAccountRef: 'acct-ref',
};

describe('Settlement', () => {
  it('rejects non-positive amounts', () => {
    expect(() => Settlement.create({ ...base, amount: Money.zero() })).toThrow(InvalidAmountError);
    expect(() => Settlement.create({ ...base, amount: Money.fromCents(-1) })).toThrow(
      InvalidAmountError,
    );
  });

  it('rejects settling a bank against itself', () => {
    expect(() =>
      Settlement.create({ ...base, payeeBankId: base.payerBankId, amount: Money.fromCents(1) }),
    ).toThrow(SameBankSettlementError);
  });

  it('produces a reserve movement that sums to zero', () => {
    const settlement = Settlement.create({ ...base, amount: Money.fromCents(500) });
    const [debit, credit] = settlement.entries();

    expect(debit.bankId).toBe(base.payerBankId);
    expect(debit.amount.cents).toBe(-500);
    expect(credit.bankId).toBe(base.payeeBankId);
    expect(credit.amount.cents).toBe(500);
    expect(debit.settlementId).toBe(settlement.id);
    expect(credit.settlementId).toBe(settlement.id);
  });

  it('reverses with the opposite entries, same settlement id', () => {
    const settlement = Settlement.create({ ...base, amount: Money.fromCents(500) });
    const [reversedDebit, reversedCredit] = settlement.reversalEntries();

    expect(reversedDebit.bankId).toBe(base.payerBankId);
    expect(reversedDebit.amount.cents).toBe(500);
    expect(reversedCredit.bankId).toBe(base.payeeBankId);
    expect(reversedCredit.amount.cents).toBe(-500);
    expect(reversedDebit.settlementId).toBe(settlement.id);
  });
});
