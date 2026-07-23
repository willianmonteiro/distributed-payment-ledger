import { useState } from 'react';
import { shortId } from '../lib/format';
import type { TrackedAccount } from '../types';

interface TransferFormProps {
  payerAccounts: TrackedAccount[];
  payeeAccounts: TrackedAccount[];
  onSubmit: (payerId: string, payeeId: string, amountDollars: string) => void | Promise<void>;
}

/** Purely presentational — amount parsing and validation live in the caller. */
export function TransferForm({ payerAccounts, payeeAccounts, onSubmit }: TransferFormProps) {
  const [payerId, setPayerId] = useState('');
  const [payeeId, setPayeeId] = useState('');
  const [amountDollars, setAmountDollars] = useState('10.00');

  return (
    <div className="create-form">
      <select value={payerId} onChange={(e) => setPayerId(e.target.value)}>
        <option value="">Payer (Bank A)…</option>
        {payerAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.ownerName} — {shortId(a.id)}
          </option>
        ))}
      </select>
      <select value={payeeId} onChange={(e) => setPayeeId(e.target.value)}>
        <option value="">Payee (Bank B)…</option>
        {payeeAccounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.ownerName} — {shortId(a.id)}
          </option>
        ))}
      </select>
      <input
        className="amount-input"
        value={amountDollars}
        onChange={(e) => setAmountDollars(e.target.value)}
      />
      <button onClick={() => void onSubmit(payerId, payeeId, amountDollars)}>Send transfer</button>
    </div>
  );
}
