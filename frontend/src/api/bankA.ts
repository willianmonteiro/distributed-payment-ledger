import { jsonFetch, jsonHeaders } from './http';
import type { BankAAccount, BankABalance, InterbankTransfer } from './types';

const BANK_A_URL = import.meta.env.VITE_BANK_A_URL ?? 'http://localhost:3000';

export const bankA = {
  createAccount: (ownerName: string): Promise<BankAAccount> =>
    jsonFetch(`${BANK_A_URL}/accounts`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ ownerName }),
    }),

  getBalance: (accountId: string): Promise<BankABalance> =>
    jsonFetch(`${BANK_A_URL}/accounts/${accountId}/balance`),

  /** Demo/dev tooling only — funds an account from the well-known dev treasury. */
  devSeed: (accountId: string, amountCents: number): Promise<BankABalance> =>
    jsonFetch(`${BANK_A_URL}/accounts/${accountId}/dev-seed`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ amountCents }),
    }),

  createInterbankTransfer: (
    idempotencyKey: string,
    payerAccountId: string,
    payeeAccountRef: string,
    amountCents: number,
  ): Promise<InterbankTransfer> =>
    jsonFetch(`${BANK_A_URL}/interbank-transfers`, {
      method: 'POST',
      headers: { ...jsonHeaders, 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ payerAccountId, payeeAccountRef, amountCents }),
    }),

  getInterbankTransfer: (transferId: string): Promise<InterbankTransfer> =>
    jsonFetch(`${BANK_A_URL}/interbank-transfers/${transferId}`),
};
