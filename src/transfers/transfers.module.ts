import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TransferRepository } from './transfer.repository';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [AccountsModule, LedgerModule],
  controllers: [TransfersController],
  providers: [TransfersService, TransferRepository],
  exports: [TransferRepository],
})
export class TransfersModule {}
