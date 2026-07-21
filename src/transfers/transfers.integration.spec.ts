import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { IdempotencyConflictError, InsufficientFundsError, Money } from '../domain';
import { AccountRepository } from '../accounts/account.repository';
import { AccountsModule } from '../accounts/accounts.module';
import { DatabaseModule, PG_POOL } from '../infra/database/database.module';
import { LedgerModule } from '../ledger/ledger.module';
import { LedgerRepository } from '../ledger/ledger.repository';
import { TransfersModule } from './transfers.module';
import { TransfersService } from './transfers.service';

/**
 * Exercises the real Postgres locking and constraints from migrations 001-003.
 * Requires `docker compose up -d` + `npm run migrate` to have been run first.
 */
describe('TransfersService (integration)', () => {
  let pool: Pool;
  let accounts: AccountRepository;
  let ledger: LedgerRepository;
  let transfers: TransfersService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        DatabaseModule,
        AccountsModule,
        LedgerModule,
        TransfersModule,
      ],
    }).compile();

    pool = moduleRef.get(PG_POOL);
    accounts = moduleRef.get(AccountRepository);
    ledger = moduleRef.get(LedgerRepository);
    transfers = moduleRef.get(TransfersService);
  });

  afterAll(async () => {
    await pool.end();
  });

  /** Funds an account outside the API, bypassing the payer-affordability check. */
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

  it('never lets concurrent transfers overdraft the payer', async () => {
    const payer = await openWithBalance(7_000);
    const payee = (await accounts.create('payee')).id;

    const attempts = Array.from({ length: 10 }, (_, i) =>
      transfers
        .execute(`concurrent-${payer}-${i}`, { payerAccountId: payer, payeeAccountId: payee, amount: Money.fromCents(1_000) })
        .then(() => 'ok' as const)
        .catch((error) => {
          if (error instanceof InsufficientFundsError) return 'rejected' as const;
          throw error;
        }),
    );

    const outcomes = await Promise.all(attempts);
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(7);
    expect(outcomes.filter((o) => o === 'rejected')).toHaveLength(3);

    const balance = await ledger.balanceOf(payer);
    expect(balance.cents).toBe(0);
  });

  it('replays a retried request with the same idempotency key instead of moving money twice', async () => {
    const payer = await openWithBalance(5_000);
    const payee = (await accounts.create('payee')).id;
    const key = `retry-${payer}`;
    const params = { payerAccountId: payer, payeeAccountId: payee, amount: Money.fromCents(2_000) };

    const first = await transfers.execute(key, params);
    const second = await transfers.execute(key, params);

    expect(second.id).toBe(first.id);
    expect((await ledger.balanceOf(payer)).cents).toBe(3_000);
  });

  it('rejects a reused idempotency key with different parameters', async () => {
    const payer = await openWithBalance(5_000);
    const payee = (await accounts.create('payee')).id;
    const key = `conflict-${payer}`;

    await transfers.execute(key, { payerAccountId: payer, payeeAccountId: payee, amount: Money.fromCents(1_000) });

    await expect(
      transfers.execute(key, { payerAccountId: payer, payeeAccountId: payee, amount: Money.fromCents(2_000) }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });
});