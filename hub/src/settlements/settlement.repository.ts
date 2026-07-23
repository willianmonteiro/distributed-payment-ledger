import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../infra/database/database.module';

export type SettlementStatus = 'PENDING' | 'CONFIRMED' | 'REVERSED' | 'REJECTED';

export interface SettlementRecord {
  id: string;
  payerBankId: string;
  payeeBankId: string;
  payeeAccountRef: string;
  amountCents: number;
  status: SettlementStatus;
  rejectReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SettlementRow {
  id: string;
  payer_bank_id: string;
  payee_bank_id: string;
  payee_account_ref: string;
  amount: string;
  status: SettlementStatus;
  reject_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS =
  'id, payer_bank_id, payee_bank_id, payee_account_ref, amount, status, reject_reason, created_at, updated_at';

@Injectable()
export class SettlementRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Inserted once, atomically with the reserve entries it accompanies (PENDING) or alone
   * (REJECTED). Returns null when `id` already exists — a redelivery of settlement.requested
   * lost the race, not an error; the winning delivery already did (or is doing) the work.
   */
  async insert(
    client: PoolClient,
    params: {
      id: string;
      payerBankId: string;
      payeeBankId: string;
      payeeAccountRef: string;
      amountCents: number;
      status: 'PENDING' | 'REJECTED';
      rejectReason: string | null;
    },
  ): Promise<SettlementRecord | null> {
    const { rows } = await client.query<SettlementRow>(
      `INSERT INTO settlements (id, payer_bank_id, payee_bank_id, payee_account_ref, amount, status, reject_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING
       RETURNING ${COLUMNS}`,
      [
        params.id,
        params.payerBankId,
        params.payeeBankId,
        params.payeeAccountRef,
        params.amountCents,
        params.status,
        params.rejectReason,
      ],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async findById(id: string, executor: Pool | PoolClient = this.pool): Promise<SettlementRecord | null> {
    const { rows } = await executor.query<SettlementRow>(
      `SELECT ${COLUMNS} FROM settlements WHERE id = $1`,
      [id],
    );
    return rows[0] ? toRecord(rows[0]) : null;
  }

  /** Guards on the row currently being PENDING, so redelivery of a reply is a no-op. */
  async markConfirmed(id: string, executor: Pool | PoolClient = this.pool): Promise<void> {
    await executor.query(
      `UPDATE settlements SET status = 'CONFIRMED', updated_at = now()
        WHERE id = $1 AND status = 'PENDING'`,
      [id],
    );
  }

  async markReversed(
    id: string,
    rejectReason: string,
    executor: Pool | PoolClient = this.pool,
  ): Promise<void> {
    await executor.query(
      `UPDATE settlements SET status = 'REVERSED', reject_reason = $2, updated_at = now()
        WHERE id = $1 AND status = 'PENDING'`,
      [id, rejectReason],
    );
  }

  async findStalePending(olderThan: Date): Promise<SettlementRecord[]> {
    const { rows } = await this.pool.query<SettlementRow>(
      `SELECT ${COLUMNS} FROM settlements WHERE status = 'PENDING' AND updated_at < $1 ORDER BY updated_at`,
      [olderThan],
    );
    return rows.map(toRecord);
  }
}

function toRecord(row: SettlementRow): SettlementRecord {
  return {
    id: row.id,
    payerBankId: row.payer_bank_id,
    payeeBankId: row.payee_bank_id,
    payeeAccountRef: row.payee_account_ref,
    amountCents: Number(row.amount),
    status: row.status,
    rejectReason: row.reject_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
