import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { Account } from '../domain';
import { PG_POOL } from '../infra/database/database.module';

interface AccountRow {
  id: string;
  owner_name: string;
  created_at: Date;
}

@Injectable()
export class AccountRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async create(ownerName: string): Promise<Account> {
    const { rows } = await this.pool.query<AccountRow>(
      'INSERT INTO accounts (owner_name) VALUES ($1) RETURNING id, owner_name, created_at',
      [ownerName],
    );
    return toAccount(rows[0]);
  }

  async findById(id: string): Promise<Account | null> {
    const { rows } = await this.pool.query<AccountRow>(
      'SELECT id, owner_name, created_at FROM accounts WHERE id = $1',
      [id],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }
}

function toAccount(row: AccountRow): Account {
  return { id: row.id, ownerName: row.owner_name, createdAt: row.created_at };
}
