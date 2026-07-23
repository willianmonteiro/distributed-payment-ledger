import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { Bank } from '../domain';
import { PG_POOL } from '../infra/database/database.module';

interface BankRow {
  id: string;
  name: string;
  base_url: string;
  created_at: Date;
}

@Injectable()
export class BankRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Returns null when the id is already taken (`banks.id` is the primary key). */
  async create(id: string, name: string, baseUrl: string): Promise<Bank | null> {
    const { rows } = await this.pool.query<BankRow>(
      `INSERT INTO banks (id, name, base_url) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO NOTHING
       RETURNING id, name, base_url, created_at`,
      [id, name, baseUrl],
    );
    return rows[0] ? toBank(rows[0]) : null;
  }

  async findById(id: string): Promise<Bank | null> {
    const { rows } = await this.pool.query<BankRow>(
      'SELECT id, name, base_url, created_at FROM banks WHERE id = $1',
      [id],
    );
    return rows[0] ? toBank(rows[0]) : null;
  }

  async findAll(): Promise<Bank[]> {
    const { rows } = await this.pool.query<BankRow>(
      'SELECT id, name, base_url, created_at FROM banks ORDER BY created_at',
    );
    return rows.map(toBank);
  }
}

function toBank(row: BankRow): Bank {
  return { id: row.id, name: row.name, baseUrl: row.base_url, createdAt: row.created_at };
}
