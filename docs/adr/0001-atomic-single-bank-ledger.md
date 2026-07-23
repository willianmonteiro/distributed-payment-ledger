# 1. Atomic single-bank ledger

Status: Accepted

## Context

A payment ledger has to guarantee money is never created, destroyed, or moved incorrectly under concurrent access, before any distributed-systems concerns enter the picture.

## Decision

Build the ledger as a single NestJS service backed by one Postgres database. A transfer is one ACID transaction: row-level locks on both accounts (sorted by id to avoid deadlock), a balance check, and two append-only ledger entries that sum to zero, committed together.

## Consequences

- Atomicity and consistency are enforced by Postgres directly — no outbox, no idempotent messaging, no compensation logic needed yet.
- Doesn't model how real interbank transfers work: two independent banks can't share a Postgres transaction. See ADR-0002.
