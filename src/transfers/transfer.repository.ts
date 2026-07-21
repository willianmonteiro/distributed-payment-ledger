import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { Money, Transfer } from '../domain';
import { PG_POOL } from '../infra/database/database.module';

interface TransferRow {
  id: string;
  payer_account_id: string;
  payee_account_id: string;
  amount: string;
  created_at: Date;
}

export interface TransferRecord {
  id: string;
  payerAccountId: string;
  payeeAccountId: string;
  amount: Money;
  createdAt: Date;
}

@Injectable()
export class TransferRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Returns null when the idempotency key is already taken (a previous or concurrent request won). */
  async insert(
    transfer: Transfer,
    idempotencyKey: string,
    client: PoolClient,
  ): Promise<TransferRecord | null> {
    const { rows } = await client.query<TransferRow>(
      `INSERT INTO transfers (id, idempotency_key, payer_account_id, payee_account_id, amount)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, payer_account_id, payee_account_id, amount, created_at`,
      [
        transfer.id,
        idempotencyKey,
        transfer.payerAccountId,
        transfer.payeeAccountId,
        transfer.amount.cents,
      ],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<TransferRecord | null> {
    const { rows } = await this.pool.query<TransferRow>(
      `SELECT id, payer_account_id, payee_account_id, amount, created_at
         FROM transfers WHERE idempotency_key = $1`,
      [idempotencyKey],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findById(id: string): Promise<TransferRecord | null> {
    const { rows } = await this.pool.query<TransferRow>(
      `SELECT id, payer_account_id, payee_account_id, amount, created_at
         FROM transfers WHERE id = $1`,
      [id],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }
}

function toRecord(row: TransferRow): TransferRecord {
  return {
    id: row.id,
    payerAccountId: row.payer_account_id,
    payeeAccountId: row.payee_account_id,
    amount: Money.fromCents(Number(row.amount)),
    createdAt: row.created_at,
  };
}
