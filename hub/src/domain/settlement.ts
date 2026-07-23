import { Money } from './money';
import { ReserveEntry } from './reserve-entry';
import { InvalidAmountError, SameBankSettlementError } from './errors';

/**
 * A settlement moves reserves between two banks atomically, immediately on
 * request — there is no affordability check the way a customer account has
 * one. A real RTGS hub enforces intraday credit limits/collateral against
 * a bank's reserve; that policy layer is out of scope here, where the point
 * is the routing topology, not central-bank credit risk.
 */
export class Settlement {
  private constructor(
    public readonly id: string,
    public readonly payerBankId: string,
    public readonly payeeBankId: string,
    public readonly payeeAccountRef: string,
    public readonly amount: Money,
  ) {}

  static create(params: {
    id: string;
    payerBankId: string;
    payeeBankId: string;
    payeeAccountRef: string;
    amount: Money;
  }): Settlement {
    if (!params.amount.isPositive()) {
      throw new InvalidAmountError(params.amount.cents);
    }
    if (params.payerBankId === params.payeeBankId) {
      throw new SameBankSettlementError();
    }
    return new Settlement(
      params.id,
      params.payerBankId,
      params.payeeBankId,
      params.payeeAccountRef,
      params.amount,
    );
  }

  /** The reserve movement for this settlement. Always sums to zero. */
  entries(): [ReserveEntry, ReserveEntry] {
    return [
      { settlementId: this.id, bankId: this.payerBankId, amount: this.amount.negated() },
      { settlementId: this.id, bankId: this.payeeBankId, amount: this.amount },
    ];
  }

  /** The reversal for a settlement the payee bank couldn't honor locally. Same id, opposite entries. */
  reversalEntries(): [ReserveEntry, ReserveEntry] {
    return [
      { settlementId: this.id, bankId: this.payerBankId, amount: this.amount },
      { settlementId: this.id, bankId: this.payeeBankId, amount: this.amount.negated() },
    ];
  }
}
