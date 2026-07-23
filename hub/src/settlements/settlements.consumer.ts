import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Channel, ConsumeMessage } from 'amqplib';
import { AMQP_CHANNEL } from '../infra/messaging/tokens';
import {
  HUB_SETTLEMENTS_EXCHANGE,
  SETTLEMENT_REPLY_ROUTING_KEY,
  SETTLEMENT_REQUESTED_ROUTING_KEY,
} from '../infra/messaging/topology';
import { SettlementReplyEvent, SettlementRequestedEvent, SettlementsService } from './settlements.service';

const REQUESTS_QUEUE = 'hub.settlement-requests';
const REPLIES_QUEUE = 'hub.settlement-replies';
const DLX_NAME = 'hub.settlements.dlx';
const DLQ_NAME = 'hub.settlements.dlq';

@Injectable()
export class SettlementsConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(SettlementsConsumer.name);

  constructor(
    @Inject(AMQP_CHANNEL) private readonly channel: Channel,
    private readonly settlements: SettlementsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Shared dead-letter queue for both inbound queues: a malformed or
    // repeatedly-failing message stops redelivering forever and waits for
    // a human, same pattern as every other consumer in this system.
    await this.channel.assertExchange(DLX_NAME, 'fanout', { durable: true });
    await this.channel.assertQueue(DLQ_NAME, { durable: true });
    await this.channel.bindQueue(DLQ_NAME, DLX_NAME, '');

    await this.channel.assertQueue(REQUESTS_QUEUE, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': DLX_NAME },
    });
    await this.channel.bindQueue(REQUESTS_QUEUE, HUB_SETTLEMENTS_EXCHANGE, SETTLEMENT_REQUESTED_ROUTING_KEY);
    await this.channel.consume(REQUESTS_QUEUE, (msg) => void this.onRequested(msg));

    await this.channel.assertQueue(REPLIES_QUEUE, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': DLX_NAME },
    });
    await this.channel.bindQueue(REPLIES_QUEUE, HUB_SETTLEMENTS_EXCHANGE, SETTLEMENT_REPLY_ROUTING_KEY);
    await this.channel.consume(REPLIES_QUEUE, (msg) => void this.onReply(msg));

    this.logger.log(`Consuming ${REQUESTS_QUEUE} and ${REPLIES_QUEUE}`);
  }

  private async onRequested(msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString()) as SettlementRequestedEvent;
      await this.settlements.handleRequested(event);
      this.channel.ack(msg);
    } catch (error) {
      this.logger.error(
        'Failed to process settlement.requested; routed to DLQ',
        error instanceof Error ? error.stack : error,
      );
      this.channel.nack(msg, false, false);
    }
  }

  private async onReply(msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString()) as SettlementReplyEvent;
      await this.settlements.handleReply(event);
      this.channel.ack(msg);
    } catch (error) {
      this.logger.error(
        'Failed to process settlement.reply; routed to DLQ',
        error instanceof Error ? error.stack : error,
      );
      this.channel.nack(msg, false, false);
    }
  }
}
