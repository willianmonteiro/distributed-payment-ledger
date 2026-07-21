import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import {
  AccountNotFoundError,
  IdempotencyConflictError,
  Money,
  Transfer,
  TransferNotFoundError,
} from '../domain';
import { AccountRepository } from '../accounts/account.repository';
import { PG_POOL } from '../infra/database/database.module';
import { LedgerRepository } from '../ledger/ledger.repository';
import { TransferRecord, TransferRepository } from './transfer.repository';

export interface TransferParams {
  payerAccountId: string;
  payeeAccountId: string;
  amount: Money;
}

@Injectable()
export class TransfersService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly transfers: TransferRepository,
    private readonly accounts: AccountRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  async execute(idempotencyKey: string, params: TransferParams): Promise<TransferRecord> {
    const transfer = Transfer.create({ id: randomUUID(), ...params });

    const existing = await this.transfers.findByIdempotencyKey(idempotencyKey);
    if (existing) return replay(existing, transfer);

    const client = await this.pool.connect();
    let record: TransferRecord | null = null;
    try {
      await client.query('BEGIN');
      await this.lockAccounts(transfer, client);

      record = await this.transfers.insert(transfer, idempotencyKey, client);
      if (record) {
        // The payer row lock serializes this read with every concurrent writer,
        // so the balance cannot change between the check and the append.
        transfer.assertPayerCanAfford(await this.ledger.balanceOf(transfer.payerAccountId, client));
        await this.ledger.append(transfer.entries(), client);
        await client.query('COMMIT');
      } else {
        await client.query('ROLLBACK');
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (record) return record;

    // Lost the race on the key: the winning insert is committed by now
    // (ON CONFLICT only skips after the competing transaction commits).
    const winner = await this.transfers.findByIdempotencyKey(idempotencyKey);
    if (!winner) throw new Error(`Transfer with idempotency key ${idempotencyKey} vanished.`);
    return replay(winner, transfer);
  }

  async getTransfer(id: string): Promise<TransferRecord> {
    const record = await this.transfers.findById(id);
    if (!record) throw new TransferNotFoundError(id);
    return record;
  }

  /** Locks both accounts in a deterministic order so opposing transfers cannot deadlock. */
  private async lockAccounts(transfer: Transfer, client: PoolClient): Promise<void> {
    const ids = [transfer.payerAccountId, transfer.payeeAccountId].sort();
    for (const id of ids) {
      const found = await this.accounts.lockById(id, client);
      if (!found) throw new AccountNotFoundError(id);
    }
  }
}

/** A replayed request must match the original exactly; otherwise the key is being misused. */
function replay(existing: TransferRecord, attempted: Transfer): TransferRecord {
  const matches =
    existing.payerAccountId === attempted.payerAccountId &&
    existing.payeeAccountId === attempted.payeeAccountId &&
    existing.amount.equals(attempted.amount);
  if (!matches) throw new IdempotencyConflictError();
  return existing;
}
