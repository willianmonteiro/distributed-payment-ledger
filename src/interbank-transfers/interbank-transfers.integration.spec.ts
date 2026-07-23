import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as amqplib from 'amqplib';
import { Pool } from 'pg';
import { IdempotencyConflictError, InsufficientFundsError, Money, SUSPENSE_ACCOUNT_ID } from '../domain';
import { AccountRepository } from '../accounts/account.repository';
import { DatabaseModule, PG_POOL } from '../infra/database/database.module';
import { RabbitMqModule } from '../infra/messaging/rabbitmq.module';
import { AMQP_CONNECTION } from '../infra/messaging/tokens';
import { LedgerRepository } from '../ledger/ledger.repository';
import { OutboxRelayService } from '../outbox/outbox-relay.service';
import { InterbankTransfersModule } from './interbank-transfers.module';
import { InterbankTransfersService } from './interbank-transfers.service';

interface OutboxRow {
  event_type: string;
  routing_key: string;
  payload: {
    settlementId: string;
    payerBankId: string;
    payeeBankId: string;
    payeeAccountRef: string;
    amountCents: number;
  };
  published_at: Date | null;
}

/**
 * Exercises the real Postgres locking/constraints and confirms the local leg
 * of an interbank transfer (payer -> suspense) writes an outbox event
 * atomically, the same mechanism proven in outbox-relay.integration.spec.ts.
 */
describe('InterbankTransfersService (integration)', () => {
  let pool: Pool;
  let accounts: AccountRepository;
  let ledger: LedgerRepository;
  let interbankTransfers: InterbankTransfersService;
  let relay: OutboxRelayService;
  let amqpConnection: amqplib.ChannelModel;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        RabbitMqModule,
        InterbankTransfersModule,
      ],
    }).compile();

    pool = moduleRef.get(PG_POOL);
    accounts = moduleRef.get(AccountRepository);
    ledger = moduleRef.get(LedgerRepository);
    interbankTransfers = moduleRef.get(InterbankTransfersService);
    relay = moduleRef.get(OutboxRelayService);
    amqpConnection = moduleRef.get(AMQP_CONNECTION);
  });

  afterAll(async () => {
    await amqpConnection.close();
    await pool.end();
  });

  /** Funds an account from a fresh per-test treasury, outside the API, bypassing the payer check. */
  async function openWithBalance(cents: number): Promise<string> {
    const treasury = await accounts.create('treasury');
    const account = await accounts.create('test-account');
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO transfers (id, idempotency_key, payer_account_id, payee_account_id, amount)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       RETURNING id`,
      [`seed-${account.id}`, treasury.id, account.id, cents],
    );
    const transferId = rows[0].id;
    await pool.query(
      `INSERT INTO ledger_entries (transfer_id, account_id, amount) VALUES ($1, $2, $3), ($1, $4, $5)`,
      [transferId, treasury.id, -cents, account.id, cents],
    );
    return account.id;
  }

  async function outboxRowFor(transferId: string): Promise<OutboxRow | null> {
    const { rows } = await pool.query<OutboxRow>(
      'SELECT event_type, routing_key, payload, published_at FROM outbox_events WHERE aggregate_id = $1',
      [transferId],
    );
    return rows[0] ?? null;
  }

  async function waitUntilPublished(transferId: string, timeoutMs = 5000): Promise<void> {
    const start = Date.now();
    for (;;) {
      await relay.tick();
      const row = await outboxRowFor(transferId);
      if (row?.published_at) return;
      if (Date.now() - start > timeoutMs) throw new Error(`Outbox row for ${transferId} was never published`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  it('debits the payer, credits suspense, and writes a publishable outbox event', async () => {
    const payer = await openWithBalance(5_000);
    const suspenseBefore = await ledger.balanceOf(SUSPENSE_ACCOUNT_ID);

    const result = await interbankTransfers.execute(`ib-happy-${payer}`, {
      payerAccountId: payer,
      payeeBankId: 'bank-b',
      payeeAccountRef: 'bank-b-account-ref-1',
      amount: Money.fromCents(2_000),
    });

    expect(result.interbank.status).toBe('DEBITED');
    expect((await ledger.balanceOf(payer)).cents).toBe(3_000);

    const suspenseAfter = await ledger.balanceOf(SUSPENSE_ACCOUNT_ID);
    expect(suspenseAfter.cents - suspenseBefore.cents).toBe(2_000);

    const outboxRow = await outboxRowFor(result.transfer.id);
    expect(outboxRow).not.toBeNull();
    expect(outboxRow?.event_type).toBe('settlement.requested');
    expect(outboxRow?.routing_key).toBe('settlement.requested');
    expect(outboxRow?.payload.payerBankId).toBe('bank-a');
    expect(outboxRow?.payload.payeeBankId).toBe('bank-b');
    expect(outboxRow?.payload.payeeAccountRef).toBe('bank-b-account-ref-1');
    expect(outboxRow?.payload.amountCents).toBe(2_000);
    expect(outboxRow?.published_at).toBeNull();

    await waitUntilPublished(result.transfer.id);
  });

  it('replays a retried request with the same idempotency key instead of debiting twice', async () => {
    const payer = await openWithBalance(5_000);
    const key = `ib-retry-${payer}`;
    const params = {
      payerAccountId: payer,
      payeeBankId: 'bank-b',
      payeeAccountRef: 'bank-b-account-ref-2',
      amount: Money.fromCents(1_500),
    };

    const first = await interbankTransfers.execute(key, params);
    const second = await interbankTransfers.execute(key, params);

    expect(second.transfer.id).toBe(first.transfer.id);
    expect((await ledger.balanceOf(payer)).cents).toBe(3_500);
  });

  it('rejects a reused idempotency key pointed at a different counterparty', async () => {
    const payer = await openWithBalance(5_000);
    const key = `ib-conflict-${payer}`;

    await interbankTransfers.execute(key, {
      payerAccountId: payer,
      payeeBankId: 'bank-b',
      payeeAccountRef: 'bank-b-account-ref-3',
      amount: Money.fromCents(1_000),
    });

    await expect(
      interbankTransfers.execute(key, {
        payerAccountId: payer,
        payeeBankId: 'bank-b',
        payeeAccountRef: 'a-different-remote-account',
        amount: Money.fromCents(1_000),
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('never lets concurrent interbank transfers overdraft the payer', async () => {
    const payer = await openWithBalance(7_000);

    const attempts = Array.from({ length: 10 }, (_, i) =>
      interbankTransfers
        .execute(`ib-concurrent-${payer}-${i}`, {
          payerAccountId: payer,
          payeeBankId: 'bank-b',
          payeeAccountRef: 'bank-b-account-ref-concurrent',
          amount: Money.fromCents(1_000),
        })
        .then(() => 'ok' as const)
        .catch((error) => {
          if (error instanceof InsufficientFundsError) return 'rejected' as const;
          throw error;
        }),
    );

    const outcomes = await Promise.all(attempts);
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(7);
    expect(outcomes.filter((o) => o === 'rejected')).toHaveLength(3);
    expect((await ledger.balanceOf(payer)).cents).toBe(0);
  });
});
