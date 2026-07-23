import { Module } from '@nestjs/common';
import { BanksModule } from '../banks/banks.module';
import { LedgerModule } from '../ledger/ledger.module';
import { OutboxModule } from '../outbox/outbox.module';
import { SettlementRepository } from './settlement.repository';
import { SettlementsConsumer } from './settlements.consumer';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

@Module({
  imports: [BanksModule, LedgerModule, OutboxModule],
  controllers: [SettlementsController],
  providers: [SettlementsService, SettlementRepository, SettlementsConsumer],
})
export class SettlementsModule {}
