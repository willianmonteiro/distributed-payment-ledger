import type { ReactNode } from 'react';
import type { TrackedAccount } from '../types';
import { AccountList } from './AccountList';
import { CreateAccountForm } from './CreateAccountForm';

interface BankPanelProps {
  title: string;
  className: string;
  accounts: TrackedAccount[];
  onCreateAccount: (ownerName: string) => void | Promise<void>;
  renderAccountAction?: (account: TrackedAccount) => ReactNode;
}

export function BankPanel({
  title,
  className,
  accounts,
  onCreateAccount,
  renderAccountAction,
}: BankPanelProps) {
  return (
    <section className={`bank ${className}`}>
      <h2>{title}</h2>
      <CreateAccountForm onCreate={onCreateAccount} />
      <AccountList accounts={accounts} renderAction={renderAccountAction} />
    </section>
  );
}
