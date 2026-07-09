import { Money } from './money';

export interface LedgerEntry {
  readonly transferId: string;
  readonly accountId: string;
  readonly amount: Money;
}
