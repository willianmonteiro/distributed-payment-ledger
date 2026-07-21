CREATE TABLE transfers (
  id               UUID PRIMARY KEY,
  idempotency_key  TEXT NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 255),
  payer_account_id UUID NOT NULL REFERENCES accounts(id),
  payee_account_id UUID NOT NULL REFERENCES accounts(id),
  amount           BIGINT NOT NULL CHECK (amount > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (payer_account_id <> payee_account_id)
);

-- Same rule as the ledger: transfers are facts, corrections are new transfers.
CREATE FUNCTION forbid_transfer_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transfers are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transfers_immutable
  BEFORE UPDATE OR DELETE ON transfers
  FOR EACH ROW EXECUTE FUNCTION forbid_transfer_mutation();

-- Every ledger entry now belongs to a recorded transfer.
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_transfer_id_fkey
  FOREIGN KEY (transfer_id) REFERENCES transfers(id);
