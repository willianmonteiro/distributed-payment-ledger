-- Process-tracking table for the interbank leg, mirroring the role
-- interbank_transfers plays on the bank side: deliberately mutable, because
-- it tracks saga state, not money-of-record. The money itself is final in
-- hub_ledger_entries the instant a settlement moves to PENDING.
--
-- id is the same UUID as the payer bank's own local transfer id — the one
-- dedupe key that threads through the whole saga, same convention as the
-- bilateral design.
-- payee_bank_id has no FK: a REJECTED settlement (unknown destination bank)
-- has to be able to store exactly the id that failed to resolve, the same
-- reasoning bank-b/incoming_transfers uses for an unverified payee ref.
CREATE TABLE settlements (
  id                 UUID PRIMARY KEY,
  payer_bank_id      TEXT NOT NULL REFERENCES banks(id),
  payee_bank_id      TEXT NOT NULL CHECK (length(payee_bank_id) BETWEEN 1 AND 64),
  payee_account_ref  TEXT NOT NULL CHECK (length(payee_account_ref) BETWEEN 1 AND 255),
  amount             BIGINT NOT NULL CHECK (amount > 0),
  status             TEXT NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'REVERSED', 'REJECTED')),
  reject_reason      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (payer_bank_id <> payee_bank_id),
  CHECK ((status IN ('REJECTED', 'REVERSED')) = (reject_reason IS NOT NULL))
);

CREATE INDEX settlements_status_idx ON settlements (status);
