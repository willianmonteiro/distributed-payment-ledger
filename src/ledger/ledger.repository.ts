import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { LedgerEntry, Money } from '../domain';
import { PG_POOL } from '../infra/database/database.module';

export interface StatementLine {
  transferId: string;
  amount: Money;
  createdAt: Date;
}

/** Queries accept an optional client so they can join a caller-managed transaction. */
@Injectable()
export class LedgerRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async balanceOf(accountId: string, executor: Pool | PoolClient = this.pool): Promise<Money> {
    const { rows } = await executor.query<{ balance: string }>(
      'SELECT COALESCE(SUM(amount), 0) AS balance FROM ledger_entries WHERE account_id = $1',
      [accountId],
    );
    return Money.fromCents(Number(rows[0].balance));
  }

  async append(entries: readonly LedgerEntry[], client: PoolClient): Promise<void> {
    for (const entry of entries) {
      await client.query(
        'INSERT INTO ledger_entries (transfer_id, account_id, amount) VALUES ($1, $2, $3)',
        [entry.transferId, entry.accountId, entry.amount.cents],
      );
    }
  }

  async statementOf(accountId: string, limit = 50): Promise<StatementLine[]> {
    const { rows } = await this.pool.query<{
      transfer_id: string;
      amount: string;
      created_at: Date;
    }>(
      `SELECT transfer_id, amount, created_at
         FROM ledger_entries
        WHERE account_id = $1
        ORDER BY id DESC
        LIMIT $2`,
      [accountId, limit],
    );
    return rows.map((row) => ({
      transferId: row.transfer_id,
      amount: Money.fromCents(Number(row.amount)),
      createdAt: row.created_at,
    }));
  }
}
