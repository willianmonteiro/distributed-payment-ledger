import { Module } from '@nestjs/common';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxRepository } from './outbox.repository';

@Module({
  providers: [OutboxRepository, OutboxRelayService],
  exports: [OutboxRepository],
})
export class OutboxModule {}
