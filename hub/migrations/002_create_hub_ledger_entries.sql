-- A bank's reserve balance is derived by summing its entries, same as every
-- other ledger in this system — never a stored column. Append-only: a
-- reversal is new entries, never a rewrite of the original settlement.
CREATE TABLE hub_ledger_entries (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  settlement_id UUID NOT NULL,
  bank_id       TEXT NOT NULL REFERENCES banks(id),
  amount        BIGINT NOT NULL CHECK (amount <> 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX hub_ledger_entries_bank_id_idx ON hub_ledger_entries (bank_id, id DESC);
CREATE INDEX hub_ledger_entries_settlement_id_idx ON hub_ledger_entries (settlement_id);

CREATE FUNCTION forbid_hub_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'hub_ledger_entries is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hub_ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON hub_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_hub_ledger_mutation();
