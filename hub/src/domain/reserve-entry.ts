import { Money } from './money';

export interface ReserveEntry {
  readonly settlementId: string;
  readonly bankId: string;
  readonly amount: Money;
}
