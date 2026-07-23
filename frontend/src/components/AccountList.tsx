import type { ReactNode } from 'react';
import { formatCents, shortId } from '../lib/format';
import type { TrackedAccount } from '../types';

interface AccountListProps {
  accounts: TrackedAccount[];
  renderAction?: (account: TrackedAccount) => ReactNode;
}

export function AccountList({ accounts, renderAction }: AccountListProps) {
  if (accounts.length === 0) {
    return (
      <ul className="accounts">
        <li className="empty">No accounts yet.</li>
      </ul>
    );
  }

  return (
    <ul className="accounts">
      {accounts.map((a) => (
        <li key={a.id}>
          <div className="account-info">
            <span className="owner-name">{a.ownerName}</span>
            <span className="account-id" title={a.id}>
              {shortId(a.id)}
            </span>
          </div>
          <span className="balance">{formatCents(a.balanceCents)}</span>
          {renderAction?.(a)}
        </li>
      ))}
    </ul>
  );
}
