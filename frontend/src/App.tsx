import { useState } from 'react';
import './App.css';
import { bankA, bankB } from './api';
import { BankPanel } from './components/BankPanel';
import { ErrorBanner } from './components/ErrorBanner';
import { Header } from './components/Header';
import { SeedButton } from './components/SeedButton';
import { TransferPanel } from './components/TransferPanel';
import { useTransferPolling } from './hooks/useTransferPolling';
import type { TrackedAccount, TrackedTransfer } from './types';

function App() {
  const [bankAAccounts, setBankAAccounts] = useState<TrackedAccount[]>([]);
  const [bankBAccounts, setBankBAccounts] = useState<TrackedAccount[]>([]);
  const [transfers, setTransfers] = useState<TrackedTransfer[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function createBankAAccount(ownerName: string): Promise<void> {
    setError(null);
    try {
      const account = await bankA.createAccount(ownerName);
      setBankAAccounts((prev) => [
        ...prev,
        { id: account.id, ownerName: account.ownerName, balanceCents: 0 },
      ]);
    } catch (err) {
      setError(String(err));
    }
  }

  async function createBankBAccount(ownerName: string): Promise<void> {
    setError(null);
    try {
      const account = await bankB.createAccount(ownerName);
      setBankBAccounts((prev) => [
        ...prev,
        { id: account.id, ownerName: account.owner_name, balanceCents: 0 },
      ]);
    } catch (err) {
      setError(String(err));
    }
  }

  async function seed(accountId: string): Promise<void> {
    setError(null);
    try {
      const { balanceCents } = await bankA.devSeed(accountId, 10000);
      setBankAAccounts((prev) => prev.map((a) => (a.id === accountId ? { ...a, balanceCents } : a)));
    } catch (err) {
      setError(String(err));
    }
  }

  async function refreshBalances(payerAccountId: string, payeeAccountId: string): Promise<void> {
    const [payerBalance, payeeBalance] = await Promise.all([
      bankA.getBalance(payerAccountId),
      bankB.getBalance(payeeAccountId),
    ]);
    setBankAAccounts((prev) =>
      prev.map((a) => (a.id === payerAccountId ? { ...a, balanceCents: payerBalance.balanceCents } : a)),
    );
    setBankBAccounts((prev) =>
      prev.map((a) => (a.id === payeeAccountId ? { ...a, balanceCents: payeeBalance.balance_cents } : a)),
    );
  }

  async function sendTransfer(payerId: string, payeeId: string, amountDollars: string): Promise<void> {
    setError(null);
    const amountCents = Math.round(Number(amountDollars) * 100);
    if (!payerId || !payeeId || !Number.isFinite(amountCents) || amountCents <= 0) {
      setError('Pick a payer, a payee, and a positive amount.');
      return;
    }
    try {
      const idempotencyKey = crypto.randomUUID();
      const transfer = await bankA.createInterbankTransfer(idempotencyKey, payerId, payeeId, amountCents);
      setTransfers((prev) => [
        {
          transferId: transfer.transferId,
          payerAccountId: transfer.payerAccountId,
          payeeAccountRef: transfer.payeeAccountRef,
          amountCents: transfer.amountCents,
          status: transfer.status,
        },
        ...prev,
      ]);
      await refreshBalances(payerId, payeeId);
    } catch (err) {
      setError(String(err));
    }
  }

  useTransferPolling(transfers, (fresh) => {
    setTransfers((prev) =>
      prev.map((p) => (p.transferId === fresh.transferId ? { ...p, status: fresh.status } : p)),
    );
    void refreshBalances(fresh.payerAccountId, fresh.payeeAccountRef);
  });

  return (
    <div className="app">
      <Header />
      <ErrorBanner message={error} />

      <div className="banks">
        <BankPanel
          title="Bank A"
          className="bank-a"
          accounts={bankAAccounts}
          onCreateAccount={createBankAAccount}
          renderAccountAction={(a) => <SeedButton onSeed={() => seed(a.id)} />}
        />
        <BankPanel
          title="Bank B"
          className="bank-b"
          accounts={bankBAccounts}
          onCreateAccount={createBankBAccount}
        />
      </div>

      <TransferPanel
        payerAccounts={bankAAccounts}
        payeeAccounts={bankBAccounts}
        transfers={transfers}
        onSubmit={sendTransfer}
      />
    </div>
  );
}

export default App;
