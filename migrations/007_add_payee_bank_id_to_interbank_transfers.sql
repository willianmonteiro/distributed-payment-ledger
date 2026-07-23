-- Bank A now routes through the Hub instead of always addressing Bank B
-- directly, so a transfer has to say which bank it's going to. Existing
-- rows predate multi-bank routing and were always addressed to Bank B.
ALTER TABLE interbank_transfers ADD COLUMN payee_bank_id TEXT NOT NULL DEFAULT 'bank-b';
ALTER TABLE interbank_transfers ALTER COLUMN payee_bank_id DROP DEFAULT;
