import { InsufficientFundsError, InvalidAmountError, SelfTransferError } from './errors';
import { LedgerEntry } from './ledger-entry';
import { Money } from './money';

export class Transfer {
  private constructor(
    public readonly id: string,
    public readonly payerAccountId: string,
    public readonly payeeAccountId: string,
    public readonly amount: Money,
  ) {}

  static create(params: {
    id: string;
    payerAccountId: string;
    payeeAccountId: string;
    amount: Money;
  }): Transfer {
    if (!params.amount.isPositive()) {
      throw new InvalidAmountError(params.amount.cents);
    }
    if (params.payerAccountId === params.payeeAccountId) {
      throw new SelfTransferError();
    }
    return new Transfer(params.id, params.payerAccountId, params.payeeAccountId, params.amount);
  }

  /** The double entry for this transfer. Always sums to zero. */
  entries(): [LedgerEntry, LedgerEntry] {
    return [
      { transferId: this.id, accountId: this.payerAccountId, amount: this.amount.negated() },
      { transferId: this.id, accountId: this.payeeAccountId, amount: this.amount },
    ];
  }

  assertPayerCanAfford(payerBalance: Money): void {
    if (payerBalance.lessThan(this.amount)) {
      throw new InsufficientFundsError(this.payerAccountId);
    }
  }
}
