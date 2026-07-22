CREATE TABLE ledger_entries (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transfer_id UUID NOT NULL,
  account_id  UUID NOT NULL REFERENCES accounts(id),
  amount      BIGINT NOT NULL CHECK (amount <> 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ledger_entries_account_id_idx ON ledger_entries (account_id, id DESC);

-- Balances are derived from entries; history is the source of truth.
-- Corrections happen via new (reversal) entries, never by rewriting rows.
CREATE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
