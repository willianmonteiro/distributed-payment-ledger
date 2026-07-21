import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { BANK_TRANSFERS_EXCHANGE } from './topology';
import { RabbitMqPublisher } from './rabbitmq.publisher';
import { AMQP_CHANNEL, AMQP_CONNECTION } from './tokens';

@Global()
@Module({
  providers: [
    {
      provide: AMQP_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Promise<amqplib.ChannelModel> =>
        amqplib.connect(config.getOrThrow<string>('RABBITMQ_URL')),
    },
    {
      provide: AMQP_CHANNEL,
      inject: [AMQP_CONNECTION],
      useFactory: async (connection: amqplib.ChannelModel): Promise<amqplib.Channel> => {
        const channel = await connection.createChannel();
        await channel.assertExchange(BANK_TRANSFERS_EXCHANGE, 'topic', { durable: true });
        return channel;
      },
    },
    RabbitMqPublisher,
  ],
  exports: [RabbitMqPublisher],
})
export class RabbitMqModule implements OnApplicationShutdown {
  constructor(
    @Inject(AMQP_CONNECTION) private readonly connection: amqplib.ChannelModel,
    @Inject(AMQP_CHANNEL) private readonly channel: amqplib.Channel,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.channel.close();
    await this.connection.close();
  }
}
