export interface BankAAccount {
  id: string;
  ownerName: string;
  createdAt: string;
}

export interface BankABalance {
  accountId: string;
  balanceCents: number;
}

export type SagaStatus = 'DEBITED' | 'CONFIRMED' | 'COMPENSATED';

export interface InterbankTransfer {
  transferId: string;
  payerAccountId: string;
  payeeAccountRef: string;
  amountCents: number;
  status: SagaStatus;
  createdAt: string;
}

export interface BankBAccount {
  id: string;
  owner_name: string;
  created_at: string;
}

export interface BankBBalance {
  account_id: string;
  balance_cents: number;
}
