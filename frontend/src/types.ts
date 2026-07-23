import type { SagaStatus } from './api';

/** View-model types for what the UI tracks locally — distinct from the API's wire types. */

export interface TrackedAccount {
  id: string;
  ownerName: string;
  balanceCents: number | null;
}

export interface TrackedTransfer {
  transferId: string;
  payerAccountId: string;
  payeeAccountRef: string;
  amountCents: number;
  status: SagaStatus;
}
