import { Injectable } from '@nestjs/common';
import { Account, AccountNotFoundError, Money } from '../domain';
import { LedgerRepository, StatementLine } from '../ledger/ledger.repository';
import { AccountRepository } from './account.repository';

@Injectable()
export class AccountsService {
  constructor(
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
}
