CREATE TABLE accounts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_name TEXT NOT NULL CHECK (length(owner_name) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
