-- Bank A's side of a correspondent-banking relationship: a transfer to Bank B
-- is booked locally as an ordinary transfer to this suspense/transit account,
-- the same way real correspondent banks keep the local double-entry ledger
-- balanced while money is in flight to another institution. The well-known id
-- lets application code reference it without a lookup.
INSERT INTO accounts (id, owner_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'suspense (interbank transfers in transit)');

-- A thin companion to a normal `transfers` row (payer -> suspense): it adds
-- the saga bookkeeping a purely local transfer doesn't need. Unlike
-- transfers/ledger_entries, this table is deliberately mutable — it tracks
-- in-flight process state, not money-of-record. The money itself is already
-- final and immutable in ledger_entries the moment this row is inserted;
-- a later compensation is a new transfer, never a rewrite of this status.
CREATE TABLE interbank_transfers (
  transfer_id       UUID PRIMARY KEY REFERENCES transfers(id),
  payee_account_ref TEXT NOT NULL CHECK (length(payee_account_ref) BETWEEN 1 AND 255),
  status            TEXT NOT NULL CHECK (status IN ('DEBITED', 'CONFIRMED', 'COMPENSATED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The reconciliation job (a later phase) scans for stale DEBITED rows.
CREATE INDEX interbank_transfers_status_idx ON interbank_transfers (status);
