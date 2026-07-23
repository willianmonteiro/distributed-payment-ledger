-- The Hub's directory of participants. id is the routing id every settlement
-- message addresses (the equivalent of an ISPB code in Pix) — banks register
-- themselves via POST /banks, not a migration, so onboarding a new bank is
-- an operational action, not a code change.
CREATE TABLE banks (
  id         TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64),
  name       TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  base_url   TEXT NOT NULL CHECK (length(base_url) BETWEEN 1 AND 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
