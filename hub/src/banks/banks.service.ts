import { Injectable } from '@nestjs/common';
import { Bank, BankNotFoundError, DuplicateBankError, Money } from '../domain';
import { LedgerRepository } from '../ledger/ledger.repository';
import { BankRepository } from './bank.repository';

@Injectable()
export class BanksService {
  constructor(
    private readonly banks: BankRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  async registerBank(id: string, name: string, baseUrl: string): Promise<Bank> {
    const bank = await this.banks.create(id, name, baseUrl);
    if (!bank) throw new DuplicateBankError(id);
    return bank;
  }

  async getBank(id: string): Promise<Bank> {
    const bank = await this.banks.findById(id);
    if (!bank) throw new BankNotFoundError(id);
    return bank;
  }

  listBanks(): Promise<Bank[]> {
    return this.banks.findAll();
  }

  async getReserveBalance(id: string): Promise<Money> {
    await this.getBank(id);
    return this.ledger.reserveBalanceOf(id);
  }
}
