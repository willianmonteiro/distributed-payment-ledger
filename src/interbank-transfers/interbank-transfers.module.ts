import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { LedgerModule } from '../ledger/ledger.module';
import { OutboxModule } from '../outbox/outbox.module';
import { TransfersModule } from '../transfers/transfers.module';
import { InterbankTransferRepository } from './interbank-transfer.repository';
import { InterbankTransfersController } from './interbank-transfers.controller';
import { InterbankTransfersService } from './interbank-transfers.service';

@Module({
  imports: [AccountsModule, LedgerModule, OutboxModule, TransfersModule],
  controllers: [InterbankTransfersController],
  providers: [InterbankTransfersService, InterbankTransferRepository],
})
export class InterbankTransfersModule {}
