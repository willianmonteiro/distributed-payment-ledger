# 2. Bilateral two-bank saga

Status: Accepted

## Context

Real interbank transfers move money across two databases that can't share a transaction. Two-phase commit is impractical for this: a crashed coordinator leaves every participant blocked holding locks indefinitely. Extends ADR-0001's single-bank baseline.

## Decision

Add Bank B (FastAPI, its own Postgres). Bank A and Bank B communicate directly over RabbitMQ with fixed routing keys (`transfer.initiated.bank-b`, `transfer.reply.bank-a`). Each side keeps a suspense/transit account to stay double-entry-balanced while money is in flight. A transactional outbox avoids the dual-write problem, idempotency keys make every step safe under at-least-once delivery, a compensating transfer handles rejection, and a reconciliation sweep handles a reply that never arrives.

## Concepts

- **Two-phase commit and its blocking problem** — why a distributed transaction across two banks' databases isn't used: a coordinator that crashes after participants vote leaves every one of them holding locks indefinitely.
- **Transactional outbox** — writing the "notify the other side" event in the same local transaction as the business change, so publishing can never be skipped or duplicated relative to the commit. [microservices.io: Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html)
- **`FOR UPDATE SKIP LOCKED`** — lets multiple outbox-relay instances run concurrently without two of them claiming the same row. [PostgreSQL: Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html)
- **Saga pattern (choreography)** — a business transaction as a sequence of local transactions coordinated by events, each with a compensating action instead of a shared rollback. [microservices.io: Saga](https://microservices.io/patterns/data/saga.html)
- **Idempotent consumer** — a redelivered message (RabbitMQ is at-least-once, not exactly-once) produces the same effect as the first delivery, via a unique constraint on the message's own id. [microservices.io: Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html)
- **Dead-letter exchange** — a message that can't be processed after retrying is routed aside instead of redelivering forever. [RabbitMQ: Dead Letter Exchanges](https://www.rabbitmq.com/docs/dlx)
- **Suspense/transit account (correspondent banking)** — the same mechanism real correspondent banks use to keep their own double-entry ledger balanced while money is "in flight" to another institution, via nostro/vostro accounting.

## Consequences

- Correctly handles the concurrency, redelivery, and partial-failure problems a two-bank transfer introduces.
- Bank A and Bank B's code names each other directly: routing keys, queue names, and the reconciliation URL are all constants naming one specific counterparty. Adding a third bank means modifying this code, not extending around it. See ADR-0003.
