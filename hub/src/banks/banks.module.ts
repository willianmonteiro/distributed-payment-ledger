import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { BankRepository } from './bank.repository';
import { BanksController } from './banks.controller';
import { BanksService } from './banks.service';

@Module({
  imports: [LedgerModule],
  controllers: [BanksController],
  providers: [BanksService, BankRepository],
  exports: [BankRepository],
})
export class BanksModule {}
