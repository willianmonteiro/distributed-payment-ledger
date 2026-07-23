import { jsonFetch, jsonHeaders } from './http';
import type { BankBAccount, BankBBalance } from './types';

const BANK_B_URL = import.meta.env.VITE_BANK_B_URL ?? 'http://localhost:8001';

export const bankB = {
  createAccount: (ownerName: string): Promise<BankBAccount> =>
    jsonFetch(`${BANK_B_URL}/accounts`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ owner_name: ownerName }),
    }),

  getBalance: (accountId: string): Promise<BankBBalance> =>
    jsonFetch(`${BANK_B_URL}/accounts/${accountId}/balance`),
};
