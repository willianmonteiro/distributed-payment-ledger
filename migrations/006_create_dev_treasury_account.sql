-- Dev/demo-only account used to fund a fresh payer for the frontend demo
-- walkthrough (see POST /accounts/:id/dev-seed). Separate from the interbank
-- suspense account (00...001) so a demo seed never shows up mixed into the
-- interbank-transfer-in-transit accounting. Money created here still goes
-- through an ordinary double-entry transfer, never a direct balance write —
-- even "fake" demo money respects the same ledger invariant as everything else.
INSERT INTO accounts (id, owner_name)
VALUES ('00000000-0000-0000-0000-000000000099', 'dev treasury (demo seeding only, not part of the public API)');
