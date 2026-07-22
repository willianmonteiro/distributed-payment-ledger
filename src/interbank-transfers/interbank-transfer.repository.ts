import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../infra/database/database.module';

export type InterbankTransferStatus = 'DEBITED' | 'CONFIRMED' | 'COMPENSATED';

export interface InterbankTransferRecord {
  transferId: string;
  payeeAccountRef: string;
  status: InterbankTransferStatus;
  createdAt: Date;
  updatedAt: Date;
}

interface InterbankTransferRow {
  transfer_id: string;
  payee_account_ref: string;
  status: InterbankTransferStatus;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class InterbankTransferRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Inserted once, atomically with the local transfer it accompanies — always starts DEBITED. */
  async insert(
    client: PoolClient,
    params: { transferId: string; payeeAccountRef: string },
  ): Promise<InterbankTransferRecord> {
    const { rows } = await client.query<InterbankTransferRow>(
      `INSERT INTO interbank_transfers (transfer_id, payee_account_ref, status)
       VALUES ($1, $2, 'DEBITED')
       RETURNING transfer_id, payee_account_ref, status, created_at, updated_at`,
      [params.transferId, params.payeeAccountRef],
    );
    return toRecord(rows[0]);
  }

  async findById(transferId: string): Promise<InterbankTransferRecord | null> {
    const { rows } = await this.pool.query<InterbankTransferRow>(
      `SELECT transfer_id, payee_account_ref, status, created_at, updated_at
         FROM interbank_transfers WHERE transfer_id = $1`,
      [transferId],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /**
   * Both transitions guard on the current status being DEBITED, so they're
   * idempotent under redelivery and can't clobber a state that's already
   * terminal (e.g. a late duplicate "accepted" arriving after compensation).
   */
  async markConfirmed(transferId: string, executor: Pool | PoolClient = this.pool): Promise<void> {
    await executor.query(
      `UPDATE interbank_transfers SET status = 'CONFIRMED', updated_at = now()
        WHERE transfer_id = $1 AND status = 'DEBITED'`,
      [transferId],
    );
  }

  async markCompensated(transferId: string, executor: Pool | PoolClient = this.pool): Promise<void> {
    await executor.query(
      `UPDATE interbank_transfers SET status = 'COMPENSATED', updated_at = now()
        WHERE transfer_id = $1 AND status = 'DEBITED'`,
      [transferId],
    );
  }

  /** Transfers still DEBITED after the reply should have arrived — candidates for reconciliation. */
  async findStaleDebited(olderThan: Date): Promise<InterbankTransferRecord[]> {
    const { rows } = await this.pool.query<InterbankTransferRow>(
      `SELECT transfer_id, payee_account_ref, status, created_at, updated_at
         FROM interbank_transfers
        WHERE status = 'DEBITED' AND updated_at < $1
        ORDER BY updated_at`,
      [olderThan],
    );
    return rows.map(toRecord);
  }
}

function toRecord(row: InterbankTransferRow): InterbankTransferRecord {
  return {
    transferId: row.transfer_id,
    payeeAccountRef: row.payee_account_ref,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
