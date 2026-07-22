import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Channel, ConsumeMessage } from 'amqplib';
import { AMQP_CHANNEL } from '../infra/messaging/tokens';
import { BANK_TRANSFERS_EXCHANGE } from '../infra/messaging/topology';
import { InterbankReplyService, ReplyEvent } from './interbank-reply.service';

const QUEUE_NAME = 'bank-a.transfers.replies';
const DLX_NAME = 'bank-a.transfers.replies.dlx';
const DLQ_NAME = 'bank-a.transfers.replies.dlq';
const ROUTING_KEY = 'transfer.reply.bank-a';

@Injectable()
export class InterbankReplyConsumer implements OnApplicationBootstrap {
  private readonly logger = new Logger(InterbankReplyConsumer.name);

  constructor(
    @Inject(AMQP_CHANNEL) private readonly channel: Channel,
    private readonly replyService: InterbankReplyService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // A malformed payload or a bug in handle() would otherwise redeliver
    // forever; nacking with requeue=false routes it here instead, where it
    // waits for a human — same DLX pattern as Bank B's inbound queue.
    await this.channel.assertExchange(DLX_NAME, 'fanout', { durable: true });
    await this.channel.assertQueue(DLQ_NAME, { durable: true });
    await this.channel.bindQueue(DLQ_NAME, DLX_NAME, '');

    await this.channel.assertQueue(QUEUE_NAME, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': DLX_NAME },
    });
    await this.channel.bindQueue(QUEUE_NAME, BANK_TRANSFERS_EXCHANGE, ROUTING_KEY);

    await this.channel.consume(QUEUE_NAME, (msg) => void this.onMessage(msg));
    this.logger.log(`Consuming ${QUEUE_NAME} bound to ${ROUTING_KEY}`);
  }

  private async onMessage(msg: ConsumeMessage | null): Promise<void> {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString()) as ReplyEvent;
      await this.replyService.handle(event);
      this.channel.ack(msg);
    } catch (error) {
      this.logger.error(
        'Failed to process transfer.reply message; routed to DLQ',
        error instanceof Error ? error.stack : error,
      );
      this.channel.nack(msg, false, false);
    }
  }
}
