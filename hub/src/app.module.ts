import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { BanksModule } from './banks/banks.module';
import { HealthModule } from './health/health.module';
import { DomainExceptionFilter } from './http/domain-exception.filter';
import { DatabaseModule } from './infra/database/database.module';
import { LedgerModule } from './ledger/ledger.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    HealthModule,
    LedgerModule,
    BanksModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
