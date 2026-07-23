import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as amqplib from 'amqplib';
import { Pool } from 'pg';
import { Money } from '../domain';
import { AccountRepository } from '../accounts/account.repository';
import { DatabaseModule, PG_POOL } from '../infra/database/database.module';
import { RabbitMqModule } from '../infra/messaging/rabbitmq.module';
import { AMQP_CONNECTION } from '../infra/messaging/tokens';
import { LedgerRepository } from '../ledger/ledger.repository';
import { InterbankReplyService } from './interbank-reply.service';
import { InterbankTransferRepository } from './interbank-transfer.repository';
import { InterbankTransfersModule } from './interbank-transfers.module';
import { InterbankTransfersService } from './interbank-transfers.service';

/**
 * Exercises the reply consumer's business logic directly (bypassing the real
 * AMQP wire) against the real Postgres — the live saga run (Bank A + Hub +
 * Bank B together) is what proved the wire format matches; this proves the
 * state machine and compensation are correct under redelivery and races.
 */
describe('InterbankReplyService (integration)', () => {
  let pool: Pool;
  let accounts: AccountRepository;
  let ledger: LedgerRepository;
  let interbankTransfers: InterbankTransfersService;
  let interbankTransferRepo: InterbankTransferRepository;
  let replyService: InterbankReplyService;
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
    interbankTransferRepo = moduleRef.get(InterbankTransferRepository);
    replyService = moduleRef.get(InterbankReplyService);
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

  it('marks the transfer CONFIRMED on a confirmed outcome, without touching the ledger', async () => {
    const payer = await openWithBalance(5_000);
    const { transfer } = await interbankTransfers.execute(`reply-accept-${payer}`, {
      payerAccountId: payer,
      payeeBankId: 'bank-b',
      payeeAccountRef: 'bank-b-ref',
      amount: Money.fromCents(1_000),
    });

    await replyService.handle({ settlementId: transfer.id, outcome: 'CONFIRMED' });

    expect((await interbankTransferRepo.findById(transfer.id))?.status).toBe('CONFIRMED');
    expect((await ledger.balanceOf(payer)).cents).toBe(4_000);
  });

  it('compensates the payer in full on a reversed outcome', async () => {
    const payer = await openWithBalance(5_000);
    const { transfer } = await interbankTransfers.execute(`reply-reject-${payer}`, {
      payerAccountId: payer,
      payeeBankId: 'bank-b',
      payeeAccountRef: 'bank-b-ref',
      amount: Money.fromCents(1_500),
    });
    expect((await ledger.balanceOf(payer)).cents).toBe(3_500);

    await replyService.handle({
      settlementId: transfer.id,
      outcome: 'REVERSED',
      reason: 'ACCOUNT_NOT_FOUND',
    });

    expect((await interbankTransferRepo.findById(transfer.id))?.status).toBe('COMPENSATED');
    expect((await ledger.balanceOf(payer)).cents).toBe(5_000);

    const { rows } = await pool.query<{ amount: string }>(
      'SELECT amount FROM transfers WHERE idempotency_key = $1',
      [`compensation-${transfer.id}`],
    );
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(1_500);
  });

  it('compensates the payer on a rejected outcome (Hub never recognized the payee bank)', async () => {
    const payer = await openWithBalance(5_000);
    const { transfer } = await interbankTransfers.execute(`reply-unknown-bank-${payer}`, {
      payerAccountId: payer,
      payeeBankId: 'bank-zzz',
      payeeAccountRef: 'whatever',
      amount: Money.fromCents(800),
    });

    await replyService.handle({
      settlementId: transfer.id,
      outcome: 'REJECTED',
      reason: 'UNKNOWN_PAYEE_BANK',
    });

    expect((await interbankTransferRepo.findById(transfer.id))?.status).toBe('COMPENSATED');
    expect((await ledger.balanceOf(payer)).cents).toBe(5_000);
  });

  it('is idempotent under a redelivered confirmed outcome', async () => {
    const payer = await openWithBalance(5_000);
    const { transfer } = await interbankTransfers.execute(`reply-accept-redelivery-${payer}`, {
      payerAccountId: payer,
      payeeBankId: 'bank-b',
      payeeAccountRef: 'bank-b-ref',
      amount: Money.fromCents(1_000),
    });
    const event = { settlementId: transfer.id, outcome: 'CONFIRMED' as const };

    await replyService.handle(event);
    await replyService.handle(event);

    expect((await interbankTransferRepo.findById(transfer.id))?.status).toBe('CONFIRMED');
  });

  it('compensates exactly once under concurrent redelivery of a reversed outcome', async () => {
    const payer = await openWithBalance(5_000);
    const { transfer } = await interbankTransfers.execute(`reply-reject-redelivery-${payer}`, {
      payerAccountId: payer,
      payeeBankId: 'bank-b',
      payeeAccountRef: 'bank-b-ref',
      amount: Money.fromCents(1_000),
    });
    const event = {
      settlementId: transfer.id,
      outcome: 'REVERSED' as const,
      reason: 'ACCOUNT_NOT_FOUND',
    };

    await Promise.all([replyService.handle(event), replyService.handle(event)]);

    expect((await interbankTransferRepo.findById(transfer.id))?.status).toBe('COMPENSATED');
    expect((await ledger.balanceOf(payer)).cents).toBe(5_000);

    const { rows } = await pool.query('SELECT id FROM transfers WHERE idempotency_key = $1', [
      `compensation-${transfer.id}`,
    ]);
    expect(rows).toHaveLength(1);
  });

  it('throws when the outcome references a transfer this bank has no record of', async () => {
    await expect(
      replyService.handle({
        settlementId: '00000000-0000-0000-0000-000000000099',
        outcome: 'CONFIRMED',
      }),
    ).rejects.toThrow();
  });
});
