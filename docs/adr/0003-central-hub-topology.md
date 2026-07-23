# 3. Central hub topology

Status: Proposed

## Context

ADR-0002's bilateral topology doesn't extend past two banks without changing Bank A and Bank B's code for every new participant — an N² integration problem, the same one real correspondent banking / SWIFT relationships have. Real domestic instant-payment systems (Brazil's SPI/Pix, Fedwire, TARGET2) solve it with a central hub instead of bilateral links.

## Decision

Introduce a Hub service holding a reserve account per participant bank. Every bank talks only to the Hub through one stable protocol: publish to a generic `settlement.requested` queue with the destination bank id in the payload, not in the routing key. The Hub routes to `settlement.<bank_id>` and relays replies back the same way. The Hub's own reserve-to-reserve transfer is a single atomic Postgres transaction — the same easy case as ADR-0001.

## Consequences

- Onboarding a new bank means a row in the Hub's `banks` table and a queue binding — zero changes to any existing bank's code.
- The outbox, idempotency-key, suspense-account, compensation, and reconciliation mechanisms from ADR-0002 carry over unchanged; only the routing topology changes.
- Open question: whether the Hub moves reserve balances immediately on request (direct extension of ADR-0002's settle-then-compensate model) or only after the destination bank confirms it can accept (closer to real settlement systems, avoids reversing already-settled central-bank money, costs an extra handshake step).
- Not yet implemented.
