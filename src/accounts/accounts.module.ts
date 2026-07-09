import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { AccountRepository } from './account.repository';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';

@Module({
  imports: [LedgerModule],
  controllers: [AccountsController],
  providers: [AccountsService, AccountRepository],
})
export class AccountsModule {}
