import { Global, Inject, Logger, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { RabbitMqPublisher } from './rabbitmq.publisher';
import { AMQP_CHANNEL, AMQP_CONNECTION } from './tokens';
import { HUB_SETTLEMENTS_EXCHANGE } from './topology';

const logger = new Logger('RabbitMqModule');

@Global()
@Module({
  providers: [
    {
      provide: AMQP_CONNECTION,
      inject: [ConfigService],
      useFactory: async (config: ConfigService): Promise<amqplib.ChannelModel> => {
        const connection = await amqplib.connect(config.getOrThrow<string>('RABBITMQ_URL'));
        // amqplib emits 'error' as a plain EventEmitter event; without a
        // listener, Node treats it as unhandled and crashes the process.
        connection.on('error', (error) => logger.error('AMQP connection error', error));
        return connection;
      },
    },
    {
      provide: AMQP_CHANNEL,
      inject: [AMQP_CONNECTION],
      useFactory: async (connection: amqplib.ChannelModel): Promise<amqplib.Channel> => {
        const channel = await connection.createChannel();
        channel.on('error', (error) => logger.error('AMQP channel error', error));
        await channel.assertExchange(HUB_SETTLEMENTS_EXCHANGE, 'topic', { durable: true });
        return channel;
      },
    },
    RabbitMqPublisher,
  ],
  exports: [RabbitMqPublisher, AMQP_CHANNEL],
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
