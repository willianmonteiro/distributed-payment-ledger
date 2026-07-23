import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { Account, AccountNotFoundError, Money } from '../domain';
import { PG_POOL } from '../infra/database/database.module';
import { LedgerRepository, StatementLine } from '../ledger/ledger.repository';
import { AccountRepository } from './account.repository';
import { DEV_TREASURY_ACCOUNT_ID } from './dev-treasury-account';

@Injectable()
export class AccountsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly accounts: AccountRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  createAccount(ownerName: string): Promise<Account> {
    return this.accounts.create(ownerName);
  }

  async getAccount(id: string): Promise<Account> {
    const account = await this.accounts.findById(id);
    if (!account) throw new AccountNotFoundError(id);
    return account;
  }

  async getBalance(accountId: string): Promise<Money> {
    await this.getAccount(accountId);
    return this.ledger.balanceOf(accountId);
  }

  async getStatement(accountId: string): Promise<StatementLine[]> {
    await this.getAccount(accountId);
    return this.ledger.statementOf(accountId);
  }

  /**
   * Demo/dev tooling only — funds an account from a well-known treasury
   * account via an ordinary double-entry transfer, the same mechanism
   * every integration test uses to seed a balance. Not part of the public
   * API: there is deliberately no general-purpose faucet/mint endpoint.
   */
  async devSeed(accountId: string, amount: Money): Promise<Money> {
    await this.getAccount(accountId);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const transferId = randomUUID();
      await client.query(
        `INSERT INTO transfers (id, idempotency_key, payer_account_id, payee_account_id, amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [transferId, `dev-seed-${transferId}`, DEV_TREASURY_ACCOUNT_ID, accountId, amount.cents],
      );
      await client.query(
        `INSERT INTO ledger_entries (transfer_id, account_id, amount) VALUES ($1, $2, $3), ($1, $4, $5)`,
        [transferId, DEV_TREASURY_ACCOUNT_ID, -amount.cents, accountId, amount.cents],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getBalance(accountId);
  }
}
