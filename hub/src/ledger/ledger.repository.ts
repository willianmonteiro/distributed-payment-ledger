import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { Money, ReserveEntry } from '../domain';
import { PG_POOL } from '../infra/database/database.module';

/** Queries accept an optional client so they can join a caller-managed transaction. */
@Injectable()
export class LedgerRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async reserveBalanceOf(bankId: string, executor: Pool | PoolClient = this.pool): Promise<Money> {
    const { rows } = await executor.query<{ balance: string }>(
      'SELECT COALESCE(SUM(amount), 0) AS balance FROM hub_ledger_entries WHERE bank_id = $1',
      [bankId],
    );
    return Money.fromCents(Number(rows[0].balance));
  }

  async append(entries: readonly ReserveEntry[], client: PoolClient): Promise<void> {
    for (const entry of entries) {
      await client.query(
        'INSERT INTO hub_ledger_entries (settlement_id, bank_id, amount) VALUES ($1, $2, $3)',
        [entry.settlementId, entry.bankId, entry.amount.cents],
      );
    }
  }
}
