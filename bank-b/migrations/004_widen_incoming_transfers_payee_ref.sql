-- payee_account_id is Bank A's opaque payeeAccountRef, not guaranteed to be a
-- well-formed UUID — that's exactly what makes "no such account" a real,
-- storable outcome instead of an error the database itself rejects.
ALTER TABLE incoming_transfers ALTER COLUMN payee_account_id TYPE TEXT;
