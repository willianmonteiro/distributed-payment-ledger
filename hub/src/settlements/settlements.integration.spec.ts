import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as amqplib from 'amqplib';
import { Pool } from 'pg';
import { BankRepository } from '../banks/bank.repository';
import { BanksModule } from '../banks/banks.module';
import { DatabaseModule, PG_POOL } from '../infra/database/database.module';
import { RabbitMqModule } from '../infra/messaging/rabbitmq.module';
import { AMQP_CONNECTION } from '../infra/messaging/tokens';
import { LedgerRepository } from '../ledger/ledger.repository';
import { SettlementRepository } from './settlement.repository';
import { SettlementsModule } from './settlements.module';
import { SettlementsService } from './settlements.service';

/**
 * Exercises SettlementsService directly against the real Postgres/RabbitMQ
 * from docker-compose — the consumer that wraps these calls in an AMQP
 * message handler is thin and was verified live by hand; this proves the
 * settlement logic itself (reserve movement, idempotency, rejection,
 * reversal) under real concurrency.
 */
describe('SettlementsService (integration)', () => {
  let pool: Pool;
  let banks: BankRepository;
  let ledger: LedgerRepository;
  let settlementRepo: SettlementRepository;
  let settlements: SettlementsService;
  let amqpConnection: amqplib.ChannelModel;

  let payerBankId: string;
  let payeeBankId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, RabbitMqModule, BanksModule, SettlementsModule],
    }).compile();

    pool = moduleRef.get(PG_POOL);
    banks = moduleRef.get(BankRepository);
    ledger = moduleRef.get(LedgerRepository);
    settlementRepo = moduleRef.get(SettlementRepository);
    settlements = moduleRef.get(SettlementsService);
    amqpConnection = moduleRef.get(AMQP_CONNECTION);
  });

  afterAll(async () => {
    await amqpConnection.close();
    await pool.end();
  });

  beforeEach(async () => {
    payerBankId = `bank-${randomUUID()}`;
    payeeBankId = `bank-${randomUUID()}`;
    await banks.create(payerBankId, 'Payer Bank', 'http://localhost:9001');
    await banks.create(payeeBankId, 'Payee Bank', 'http://localhost:9002');
  });

  it('moves reserves and notifies the payee bank on request', async () => {
    const settlementId = randomUUID();
    await settlements.handleRequested({
      settlementId,
      payerBankId,
      payeeBankId,
      payeeAccountRef: 'acct-1',
      amountCents: 3_000,
    });

    const record = await settlementRepo.findById(settlementId);
    expect(record?.status).toBe('PENDING');
    expect((await ledger.reserveBalanceOf(payerBankId)).cents).toBe(-3_000);
    expect((await ledger.reserveBalanceOf(payeeBankId)).cents).toBe(3_000);

    const outboxRow = await pool.query(
      `SELECT routing_key, payload FROM outbox_events WHERE aggregate_id = $1`,
      [settlementId],
    );
    expect(outboxRow.rows).toHaveLength(1);
    expect(outboxRow.rows[0].routing_key).toBe(`settlement.notify.${payeeBankId}`);
    expect(outboxRow.rows[0].payload.amountCents).toBe(3_000);
  });

  it('rejects outright when the payee bank is unknown, moving no reserves', async () => {
    const settlementId = randomUUID();
    const unknownBankId = `bank-${randomUUID()}`;

    await settlements.handleRequested({
      settlementId,
      payerBankId,
      payeeBankId: unknownBankId,
      payeeAccountRef: 'acct-1',
      amountCents: 1_000,
    });

    const record = await settlementRepo.findById(settlementId);
    expect(record?.status).toBe('REJECTED');
    expect(record?.rejectReason).toBe('UNKNOWN_PAYEE_BANK');
    expect((await ledger.reserveBalanceOf(payerBankId)).cents).toBe(0);

    const { rows } = await pool.query('SELECT COUNT(*) FROM hub_ledger_entries WHERE settlement_id = $1', [
      settlementId,
    ]);
    expect(Number(rows[0].count)).toBe(0);
  });

  it('confirms a settlement and leaves reserves moved', async () => {
    const settlementId = randomUUID();
    await settlements.handleRequested({
      settlementId,
      payerBankId,
      payeeBankId,
      payeeAccountRef: 'acct-1',
      amountCents: 2_000,
    });

    await settlements.handleReply({ settlementId, outcome: 'CONFIRMED' });

    expect((await settlementRepo.findById(settlementId))?.status).toBe('CONFIRMED');
    expect((await ledger.reserveBalanceOf(payerBankId)).cents).toBe(-2_000);
    expect((await ledger.reserveBalanceOf(payeeBankId)).cents).toBe(2_000);
  });

  it('reverses a settlement the payee bank rejects, restoring both reserves exactly', async () => {
    const settlementId = randomUUID();
    await settlements.handleRequested({
      settlementId,
      payerBankId,
      payeeBankId,
      payeeAccountRef: 'acct-1',
      amountCents: 4_000,
    });

    await settlements.handleReply({
      settlementId,
      outcome: 'REVERSED',
      reason: 'ACCOUNT_NOT_FOUND',
    });

    const record = await settlementRepo.findById(settlementId);
    expect(record?.status).toBe('REVERSED');
    expect(record?.rejectReason).toBe('ACCOUNT_NOT_FOUND');
    expect((await ledger.reserveBalanceOf(payerBankId)).cents).toBe(0);
    expect((await ledger.reserveBalanceOf(payeeBankId)).cents).toBe(0);
  });

  it('is idempotent under concurrent redelivery of the same request', async () => {
    const settlementId = randomUUID();
    const event = {
      settlementId,
      payerBankId,
      payeeBankId,
      payeeAccountRef: 'acct-1',
      amountCents: 1_500,
    };

    await Promise.all([
      settlements.handleRequested(event),
      settlements.handleRequested(event),
      settlements.handleRequested(event),
      settlements.handleRequested(event),
      settlements.handleRequested(event),
    ]);

    expect((await ledger.reserveBalanceOf(payerBankId)).cents).toBe(-1_500);
    expect((await ledger.reserveBalanceOf(payeeBankId)).cents).toBe(1_500);
  });

  it('is a no-op when a reply is redelivered after the settlement already settled', async () => {
    const settlementId = randomUUID();
    await settlements.handleRequested({
      settlementId,
      payerBankId,
      payeeBankId,
      payeeAccountRef: 'acct-1',
      amountCents: 900,
    });
    await settlements.handleReply({ settlementId, outcome: 'CONFIRMED' });

    // A late/duplicate REVERSED reply must not un-confirm an already-settled settlement.
    await settlements.handleReply({ settlementId, outcome: 'REVERSED', reason: 'TOO_LATE' });

    expect((await settlementRepo.findById(settlementId))?.status).toBe('CONFIRMED');
    expect((await ledger.reserveBalanceOf(payerBankId)).cents).toBe(-900);
  });
});
