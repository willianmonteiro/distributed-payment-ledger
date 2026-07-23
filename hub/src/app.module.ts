import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { BanksModule } from './banks/banks.module';
import { HealthModule } from './health/health.module';
import { DomainExceptionFilter } from './http/domain-exception.filter';
import { DatabaseModule } from './infra/database/database.module';
import { RabbitMqModule } from './infra/messaging/rabbitmq.module';
import { LedgerModule } from './ledger/ledger.module';
import { OutboxModule } from './outbox/outbox.module';
import { SettlementsModule } from './settlements/settlements.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RabbitMqModule,
    HealthModule,
    LedgerModule,
    BanksModule,
    OutboxModule,
    SettlementsModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
