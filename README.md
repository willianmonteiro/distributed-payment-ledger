# distributed-payment-ledger

A double-entry payment ledger built with NestJS and PostgreSQL, evolving into a distributed instant-payment clearing system.

## Roadmap

- [x] Service scaffold: NestJS, PostgreSQL, SQL migrations, health check
- [x] Domain model: money as integer cents, accounts, transfer invariants
- [ ] Append-only double-entry ledger with derived balances
- [ ] Atomic transfers: per-account locking + idempotency keys
- [ ] Integration test suite: concurrency and retry guarantees
- [ ] Full documentation with architecture diagrams
- [ ] Outbox pattern + message broker
- [ ] Second bank service + transfer saga with compensation
- [ ] Reconciliation job

## Running

```sh
nvm use
npm install
docker compose up -d
npm run migrate
npm run start:dev
```

Health check: `curl http://localhost:3000/health`
