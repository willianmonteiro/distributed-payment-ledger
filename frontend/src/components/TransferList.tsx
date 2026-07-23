import { formatCents, shortId } from '../lib/format';
import type { TrackedTransfer } from '../types';

const STATUS_LABEL: Record<TrackedTransfer['status'], string> = {
  DEBITED: 'in flight…',
  CONFIRMED: 'confirmed',
  COMPENSATED: 'compensated (refunded)',
};

interface TransferListProps {
  transfers: TrackedTransfer[];
}

export function TransferList({ transfers }: TransferListProps) {
  if (transfers.length === 0) {
    return (
      <ul className="transfers">
        <li className="empty">No transfers sent yet.</li>
      </ul>
    );
  }

  return (
    <ul className="transfers">
      {transfers.map((t) => (
        <li key={t.transferId} className={`status-${t.status.toLowerCase()}`}>
          <span className="transfer-id" title={t.transferId}>
            {shortId(t.transferId)}
          </span>
          <span className="transfer-route">
            {shortId(t.payerAccountId)} → {shortId(t.payeeAccountRef)}
          </span>
          <span className="transfer-amount">{formatCents(t.amountCents)}</span>
          <span className={`badge badge-${t.status.toLowerCase()}`}>{STATUS_LABEL[t.status]}</span>
        </li>
      ))}
    </ul>
  );
}
