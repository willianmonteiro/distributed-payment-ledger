-- Bank B's own transit account, symmetric to Bank A's: crediting a payee for
-- money arriving from Bank A is booked as a local transfer from this account,
-- keeping this ledger's double-entry invariant intact. Same well-known id
-- convention as Bank A (app/domain/suspense_account.py).
INSERT INTO accounts (id, owner_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'suspense (interbank transfers in transit)');

-- One row per transfer.initiated event received from Bank A. transfer_id is
-- the id Bank A generated for its own local transfer (payer -> its suspense)
-- and is the dedupe key for the whole saga: RabbitMQ redelivers at least
-- once, so a second delivery of the same transfer_id must be a no-op instead
-- of crediting the payee twice.
CREATE TABLE incoming_transfers (
  transfer_id       UUID PRIMARY KEY,
  payee_account_id  UUID NOT NULL,
  amount            BIGINT NOT NULL CHECK (amount > 0),
  status            TEXT NOT NULL CHECK (status IN ('CREDITED', 'REJECTED')),
  reject_reason     TEXT,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'REJECTED') = (reject_reason IS NOT NULL))
);

-- No FK on payee_account_id: a REJECTED row for "account doesn't exist" has
-- to be able to store exactly the id that failed to resolve.
