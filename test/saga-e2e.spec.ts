import { randomUUID } from 'node:crypto';
import { ChildProcess, spawn } from 'node:child_process';
import { join } from 'node:path';
import { Pool } from 'pg';

/**
 * Spawns the real Bank A and Bank B processes (not TestingModules) against
 * the real Postgres/RabbitMQ from docker-compose, and drives the saga
 * through the real HTTP APIs — the strongest proof available that the wire
 * formats, env wiring, and process boundaries actually agree with each
 * other, not just that each service's own integration suite passes in
 * isolation.
 *
 * Prerequisites (same as manual dev testing): `docker compose up -d`,
 * migrations applied on both banks, `poetry install` done in bank-b/, ports
 * 3000 and 8001 free.
 */
const REPO_ROOT = join(__dirname, '..');
const BANK_B_DIR = join(REPO_ROOT, 'bank-b');
const BANK_A_URL = 'http://localhost:3000';
const BANK_B_URL = 'http://localhost:8001';
const SUSPENSE_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

jest.setTimeout(60_000);

let bankA: ChildProcess;
let bankB: ChildProcess;
let bankAPool: Pool;

function spawnService(command: string, args: string[], cwd: string, label: string): ChildProcess {
  const child = spawn(command, args, { cwd, stdio: 'pipe' });
  const tail: string[] = [];
  const capture = (data: Buffer): void => {
    tail.push(data.toString());
    if (tail.length > 200) tail.shift();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`${label} exited with code ${code}. Last output:\n${tail.join('')}`);
    }
  });
  return child;
}

async function waitForHealthy(url: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch {
      // Not accepting connections yet.
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`${url} did not become healthy within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function pollInterbankStatus(transferId: string, expected: string, timeoutMs = 15_000): Promise<string> {
  const start = Date.now();
  for (;;) {
    const response = await fetch(`${BANK_A_URL}/interbank-transfers/${transferId}`);
    const body = (await response.json()) as { status: string };
    if (body.status === expected || Date.now() - start > timeoutMs) return body.status;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function createBankAAccount(ownerName: string): Promise<string> {
  const response = await fetch(`${BANK_A_URL}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerName }),
  });
  const body = (await response.json()) as { id: string };
  return body.id;
}

async function createBankBAccount(ownerName: string): Promise<string> {
  const response = await fetch(`${BANK_B_URL}/accounts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner_name: ownerName }),
  });
  const body = (await response.json()) as { id: string };
  return body.id;
}

/** Seeds a balance the same way the API would: a real transfer from the suspense account. */
async function seedBankABalance(accountId: string, cents: number): Promise<void> {
  const client = await bankAPool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO transfers (id, idempotency_key, payer_account_id, payee_account_id, amount)
       VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id`,
      [`e2e-seed-${accountId}`, SUSPENSE_ACCOUNT_ID, accountId, cents],
    );
    await client.query(
      `INSERT INTO ledger_entries (transfer_id, account_id, amount) VALUES ($1, $2, $3), ($1, $4, $5)`,
      [rows[0].id, SUSPENSE_ACCOUNT_ID, -cents, accountId, cents],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getBankABalanceCents(accountId: string): Promise<number> {
  const response = await fetch(`${BANK_A_URL}/accounts/${accountId}/balance`);
  const body = (await response.json()) as { balanceCents: number };
  return body.balanceCents;
}

async function getBankBBalanceCents(accountId: string): Promise<number> {
  const response = await fetch(`${BANK_B_URL}/accounts/${accountId}/balance`);
  const body = (await response.json()) as { balance_cents: number };
  return body.balance_cents;
}

async function createInterbankTransfer(
  idempotencyKey: string,
  payerAccountId: string,
  payeeAccountRef: string,
  amountCents: number,
): Promise<string> {
  const response = await fetch(`${BANK_A_URL}/interbank-transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ payerAccountId, payeeAccountRef, amountCents }),
  });
  const body = (await response.json()) as { transferId: string };
  return body.transferId;
}

describe('Interbank saga end-to-end (real Bank A + real Bank B + real broker)', () => {
  beforeAll(async () => {
    // Runs the compiled artifact (same as `npm run start`), not source via
    // tsx: esbuild's decorator-metadata emission is unreliable enough that
    // NestJS's constructor-based DI silently receives undefined providers.
    bankA = spawnService('node', ['dist/main.js'], REPO_ROOT, 'Bank A');
    bankB = spawnService(
      'poetry',
      ['run', 'uvicorn', 'app.main:app', '--port', '8001'],
      BANK_B_DIR,
      'Bank B',
    );

    await Promise.all([waitForHealthy(BANK_A_URL), waitForHealthy(BANK_B_URL)]);

    bankAPool = new Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://ledger:ledger@localhost:5433/ledger',
    });
  });

  afterAll(async () => {
    bankA.kill();
    bankB.kill();
    await bankAPool.end();
  });

  it('moves money from a real payer at Bank A to a real payee at Bank B', async () => {
    const payer = await createBankAAccount('E2E Payer');
    await seedBankABalance(payer, 10_000);
    const payee = await createBankBAccount('E2E Payee');

    const transferId = await createInterbankTransfer(`e2e-accept-${payer}`, payer, payee, 4_000);
    const finalStatus = await pollInterbankStatus(transferId, 'CONFIRMED');

    expect(finalStatus).toBe('CONFIRMED');
    expect(await getBankABalanceCents(payer)).toBe(6_000);
    expect(await getBankBBalanceCents(payee)).toBe(4_000);
  });

  it('compensates the payer in full when the payee account does not exist at Bank B', async () => {
    const payer = await createBankAAccount('E2E Payer Reject');
    await seedBankABalance(payer, 10_000);

    const transferId = await createInterbankTransfer(`e2e-reject-${payer}`, payer, randomUUID(), 3_000);
    const finalStatus = await pollInterbankStatus(transferId, 'COMPENSATED');

    expect(finalStatus).toBe('COMPENSATED');
    expect(await getBankABalanceCents(payer)).toBe(10_000);
  });

  it('does not move money twice when a settled request is retried', async () => {
    const payer = await createBankAAccount('E2E Payer Retry');
    await seedBankABalance(payer, 10_000);
    const payee = await createBankBAccount('E2E Payee Retry');
    const idempotencyKey = `e2e-retry-${payer}`;

    const transferId = await createInterbankTransfer(idempotencyKey, payer, payee, 1_000);
    await pollInterbankStatus(transferId, 'CONFIRMED');

    const retryTransferId = await createInterbankTransfer(idempotencyKey, payer, payee, 1_000);

    expect(retryTransferId).toBe(transferId);
    expect(await getBankABalanceCents(payer)).toBe(9_000);
    expect(await getBankBBalanceCents(payee)).toBe(1_000);
  });
});
