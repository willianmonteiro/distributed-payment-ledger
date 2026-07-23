# 3. Central hub topology

Status: Proposed

## Context

ADR-0002's bilateral topology doesn't extend past two banks without changing Bank A and Bank B's code for every new participant — an N² integration problem, the same one real correspondent banking / SWIFT relationships have. Real domestic instant-payment systems (Brazil's SPI/Pix, Fedwire, TARGET2) solve it with a central hub instead of bilateral links.

## Decision

Introduce a Hub service holding a reserve account per participant bank. Every bank talks only to the Hub through one stable protocol: publish to a generic `settlement.requested` queue with the destination bank id in the payload, not in the routing key. The Hub routes to `settlement.<bank_id>` and relays replies back the same way. The Hub's own reserve-to-reserve transfer is a single atomic Postgres transaction — the same easy case as ADR-0001.

## Concepts

- **Open/Closed Principle** — the concrete problem this ADR fixes: ADR-0002's code has to be modified to add a bank instead of extended around. [Robert C. Martin: The Open-Closed Principle](https://blog.cleancoder.com/uncle-bob/2014/05/12/TheOpenClosedPrinciple.html)
- **Message broker / hub-and-spoke topology** — a central component every participant talks to, instead of a point-to-point link per pair, turning an N² integration problem into N. [Enterprise Integration Patterns: Message Broker](https://www.enterpriseintegrationpatterns.com/patterns/messaging/MessageBroker.html)
- **Real-time gross settlement (RTGS)** — settling each transfer individually and immediately against a central ledger of reserve balances, rather than netting transfers in batches. What Pix's SPI, Fedwire, and TARGET2 all are. [BIS CPMI: Real-time gross settlement systems](https://www.bis.org/cpmi/publ/d22.htm)
- **ISO 20022** — the standardized message format real payment hubs use, so any bank can integrate against one schema instead of a bespoke one per counterparty. [ISO 20022: About](https://www.iso20022.org/about-iso-20022)
- **Pix / SPI (Brazil)** — the real-world reference implementation this ADR is modeled after: Banco Central do Brasil as the hub, a reserve account per participating institution. [Banco Central do Brasil: Pix](https://www.bcb.gov.br/en/financialstability/pix_en)

## Consequences

- Onboarding a new bank means a row in the Hub's `banks` table and a queue binding — zero changes to any existing bank's code.
- The outbox, idempotency-key, suspense-account, compensation, and reconciliation mechanisms from ADR-0002 carry over unchanged; only the routing topology changes.
- Open question: whether the Hub moves reserve balances immediately on request (direct extension of ADR-0002's settle-then-compensate model) or only after the destination bank confirms it can accept (closer to real settlement systems, avoids reversing already-settled central-bank money, costs an extra handshake step).
- Not yet implemented.
