import { Inject, Injectable } from '@nestjs/common';
import { Channel } from 'amqplib';
import { AMQP_CHANNEL } from './tokens';

@Injectable()
export class RabbitMqPublisher {
  constructor(@Inject(AMQP_CHANNEL) private readonly channel: Channel) {}

  publish(exchange: string, routingKey: string, payload: unknown): void {
    this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(payload)), {
      contentType: 'application/json',
      persistent: true,
    });
  }
}
