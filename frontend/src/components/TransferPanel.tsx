import type { TrackedAccount, TrackedTransfer } from '../types';
import { TransferForm } from './TransferForm';
import { TransferList } from './TransferList';

interface TransferPanelProps {
  payerAccounts: TrackedAccount[];
  payeeAccounts: TrackedAccount[];
  transfers: TrackedTransfer[];
  onSubmit: (payerId: string, payeeId: string, amountDollars: string) => void | Promise<void>;
}

export function TransferPanel({
  payerAccounts,
  payeeAccounts,
  transfers,
  onSubmit,
}: TransferPanelProps) {
  return (
    <section className="transfer">
      <h2>Send an interbank transfer</h2>
      <TransferForm payerAccounts={payerAccounts} payeeAccounts={payeeAccounts} onSubmit={onSubmit} />
      <TransferList transfers={transfers} />
    </section>
  );
}
