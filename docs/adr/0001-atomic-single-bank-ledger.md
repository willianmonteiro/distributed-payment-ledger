# 1. Atomic single-bank ledger

Status: Accepted

## Context

A payment ledger has to guarantee money is never created, destroyed, or moved incorrectly under concurrent access, before any distributed-systems concerns enter the picture.

## Decision

Build the ledger as a single NestJS service backed by one Postgres database. A transfer is one ACID transaction: row-level locks on both accounts (sorted by id to avoid deadlock), a balance check, and two append-only ledger entries that sum to zero, committed together.

## Concepts

- **Double-entry bookkeeping** — every transfer is two entries (a debit and a credit) that sum to zero; a balance is derived by summing history, never stored. [Accounting for Computer Scientists — Martin Kleppmann](https://martin.kleppmann.com/2011/03/07/accounting-for-computer-scientists.html)
- **Row-level locking (`SELECT ... FOR UPDATE`), locked in a consistent order** — both accounts are locked sorted by id, so two transfers in opposite directions can never deadlock. [PostgreSQL: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- **Money as integer cents** — never a float, avoiding rounding errors by construction.
- **Idempotency keys** — a client-supplied key with a unique constraint makes a retried request replay the original result instead of moving money twice. [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- **Append-only ledger** — rows are never updated or deleted; a correction is a new row, so the audit trail is the data structure, not a side effect of it.

## Consequences

- Atomicity and consistency are enforced by Postgres directly — no outbox, no idempotent messaging, no compensation logic needed yet.
- Doesn't model how real interbank transfers work: two independent banks can't share a Postgres transaction. See ADR-0002.
