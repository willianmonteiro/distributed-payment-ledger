# 2. Bilateral two-bank saga

Status: Accepted

## Context

Real interbank transfers move money across two databases that can't share a transaction. Two-phase commit is impractical for this: a crashed coordinator leaves every participant blocked holding locks indefinitely. Extends ADR-0001's single-bank baseline.

## Decision

Add Bank B (FastAPI, its own Postgres). Bank A and Bank B communicate directly over RabbitMQ with fixed routing keys (`transfer.initiated.bank-b`, `transfer.reply.bank-a`). Each side keeps a suspense/transit account to stay double-entry-balanced while money is in flight. A transactional outbox avoids the dual-write problem, idempotency keys make every step safe under at-least-once delivery, a compensating transfer handles rejection, and a reconciliation sweep handles a reply that never arrives.

## Consequences

- Correctly handles the concurrency, redelivery, and partial-failure problems a two-bank transfer introduces.
- Bank A and Bank B's code names each other directly: routing keys, queue names, and the reconciliation URL are all constants naming one specific counterparty. Adding a third bank means modifying this code, not extending around it. See ADR-0003.
