import * as http from 'node:http';
import { AddressInfo } from 'node:net';
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
import { InterbankTransferRepository } from './interbank-transfer.repository';
import { InterbankTransfersModule } from './interbank-transfers.module';
import { InterbankTransfersService } from './interbank-transfers.service';
import { ReconciliationService } from './reconciliation.service';

/**
 * Stands in for Bank B's GET /internal/transfers/:id so the test controls
 * exactly what "the truth at Bank B" is, without needing Bank B running.
 * Points BANK_B_URL at itself — ReconciliationService reads that env var
 * fresh on every call, so this works without touching app wiring.
 */
function startFakeBankB(): {
  server: http.Server;
  responses: Map<string, { status: number; body?: unknown }>;
  close: () => Promise<void>;
} {
  const responses = new Map<string, { status: number; body?: unknown }>();
  const server = http.createServer((req, res) => {
    const id = (req.url ?? '').replace('/internal/transfers/', '');
    const canned = responses.get(id);
    if (!canned) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(canned.status, { 'Content-Type': 'application/json' });
    res.end(canned.body ? JSON.stringify(canned.body) : undefined);
  });
  return {
    server,
    responses,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

describe('ReconciliationService (integration)', () => {
  let pool: Pool;
  let accounts: AccountRepository;
  let ledger: LedgerRepository;
  let interbankTransfers: InterbankTransfersService;
  let interbankTransferRepo: InterbankTransferRepository;
  let reconciliation: ReconciliationService;
  let amqpConnection: amqplib.ChannelModel;
  let fakeBankB: ReturnType<typeof startFakeBankB>;

  beforeAll(async () => {
    fakeBankB = startFakeBankB();
    await new Promise<void>((resolve) => fakeBankB.server.listen(0, resolve));
    const { port } = fakeBankB.server.address() as AddressInfo;
    process.env.BANK_B_URL = `http://localhost:${port}`;

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
    reconciliation = moduleRef.get(ReconciliationService);
    amqpConnection = moduleRef.get(AMQP_CONNECTION);
  });

  afterAll(async () => {
    await fakeBankB.close();
    await amqpConnection.close();
    await pool.end();
  });

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

  /** Creates a real DEBITED interbank transfer, then backdates it past the staleness threshold. */
  async function makeStaleDebitedTransfer(payer: string, idempotencyKey: string, amountCents: number): Promise<string> {
    const { transfer } = await interbankTransfers.execute(idempotencyKey, {
      payerAccountId: payer,
      payeeAccountRef: 'bank-b-ref',
      amount: Money.fromCents(amountCents),
    });
    await pool.query(
      `UPDATE interbank_transfers SET updated_at = now() - interval '1 hour' WHERE transfer_id = $1`,
      [transfer.id],
    );
    return transfer.id;
  }

  it('compensates when Bank B has no record of the transfer', async () => {
    const payer = await openWithBalance(5_000);
    const transferId = await makeStaleDebitedTransfer(payer, `recon-missing-${payer}`, 1_000);
    // No canned response registered for this id -> the fake server 404s.

    expect(await reconciliation.reconcileOne(transferId)).toBe(true);
    expect((await interbankTransferRepo.findById(transferId))?.status).toBe('COMPENSATED');
    expect((await ledger.balanceOf(payer)).cents).toBe(5_000);
  });

  it('confirms when Bank B already credited it (an accepted reply was lost)', async () => {
    const payer = await openWithBalance(5_000);
    const transferId = await makeStaleDebitedTransfer(payer, `recon-credited-${payer}`, 1_000);
    fakeBankB.responses.set(transferId, {
      status: 200,
      body: { status: 'CREDITED', reject_reason: null },
    });

    expect(await reconciliation.reconcileOne(transferId)).toBe(true);
    expect((await interbankTransferRepo.findById(transferId))?.status).toBe('CONFIRMED');
    expect((await ledger.balanceOf(payer)).cents).toBe(4_000); // only the reply was lost, not the money
  });

  it('compensates when Bank B already rejected it (a rejected reply was lost)', async () => {
    const payer = await openWithBalance(5_000);
    const transferId = await makeStaleDebitedTransfer(payer, `recon-rejected-${payer}`, 1_000);
    fakeBankB.responses.set(transferId, {
      status: 200,
      body: { status: 'REJECTED', reject_reason: 'ACCOUNT_NOT_FOUND' },
    });

    expect(await reconciliation.reconcileOne(transferId)).toBe(true);
    expect((await interbankTransferRepo.findById(transferId))?.status).toBe('COMPENSATED');
    expect((await ledger.balanceOf(payer)).cents).toBe(5_000);
  });

  it('a sweep leaves fresh transfers alone and only touches stale ones', async () => {
    const payer = await openWithBalance(5_000);
    const { transfer: fresh } = await interbankTransfers.execute(`recon-fresh-${payer}`, {
      payerAccountId: payer,
      payeeAccountRef: 'bank-b-ref',
      amount: Money.fromCents(500),
    });
    const staleId = await makeStaleDebitedTransfer(payer, `recon-sweep-stale-${payer}`, 500);

    const { reconciled } = await reconciliation.sweep();

    expect(reconciled).toBeGreaterThanOrEqual(1);
    expect((await interbankTransferRepo.findById(fresh.id))?.status).toBe('DEBITED');
    expect((await interbankTransferRepo.findById(staleId))?.status).toBe('COMPENSATED');
  });
});
