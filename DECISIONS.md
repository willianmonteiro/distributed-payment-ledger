# Architecture decisions

Short log of *why* the architecture is what it is at each stage — not a changelog of *what* changed (git history already has that).

## v1 — single bank, single database (2026-07-08 → 2026-07-21)

- One NestJS service, one Postgres. A transfer is one ACID transaction — atomicity is free.
- **Why:** prove the money-safety primitives first, where the hard distributed-systems problems don't exist yet: double-entry ledger, integer-cents money, idempotency keys, concurrent-transfer row locking.

## v2 — bilateral two-bank saga (2026-07-21 → 2026-07-23)

- Added Bank B (FastAPI, its own Postgres). Bank A and Bank B talk to each other directly: fixed routing keys (`transfer.initiated.bank-b`, `transfer.reply.bank-a`), one suspense account per side, one reconciliation URL (`BANK_B_URL`) hardcoded in Bank A.
- **Why:** demonstrate the actual hard problem — moving money across two databases that can't share a transaction — via transactional outbox, idempotent messaging, compensation, and reconciliation.
- **Limitation found (2026-07-23):** this topology doesn't extend past two banks without modifying Bank A and Bank B's code for every new participant — routing keys, queue names, and the reconciliation URL are all compile-time constants naming a specific counterparty. Adding Bank C means changing existing code to support it, not extending around it (an OCP violation). This mirrors real bilateral correspondent banking / SWIFT relationships, which have the same N² integration problem.

## v3 — central hub / settlement authority (planned, not yet implemented)

- Introduce a Hub service modeling a central-bank settlement system (cf. Brazil's SPI/Pix, Fedwire, TARGET2). Every bank talks only to the Hub through one stable protocol; the Hub owns a reserve account per bank and routes by `bank_id` carried in the message payload instead of in the routing key.
- **Why:** real interbank systems solve the N-bank problem this way — every participant implements one standardized contract against a hub, not N bespoke bilateral ones. Fixes the v2 OCP violation: onboarding Bank C means a new row in the Hub's `banks` table and a new queue binding, with zero changes to Bank A or Bank B.
- **Reused unchanged from v2:** the outbox pattern, idempotency-key handling (`ON CONFLICT DO NOTHING`), the ledger/suspense-account mechanism, the reply-consumer + compensation logic, and the reconciliation pattern. Only the topology changes — "talk to bank X" becomes "talk to the Hub, addressed to bank X" — the failure-handling mechanisms generalize as-is.
- **Open design question:** whether the Hub moves reserve balances immediately on request (simpler, direct extension of v2's settle-then-compensate model) or only after the destination bank confirms it can accept (closer to how real settlement systems avoid reversing already-settled central-bank money, at the cost of an extra handshake step). Leaning toward the former first, since it reuses v2's state machine directly, with the latter as a later refinement.
