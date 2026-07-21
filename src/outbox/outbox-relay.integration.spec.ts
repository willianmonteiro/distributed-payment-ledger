import { randomUUID } from 'node:crypto';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as amqplib from 'amqplib';
import { Pool } from 'pg';
import { DatabaseModule, PG_POOL } from '../infra/database/database.module';
import { RabbitMqModule } from '../infra/messaging/rabbitmq.module';
import { AMQP_CONNECTION } from '../infra/messaging/tokens';
import { BANK_TRANSFERS_EXCHANGE } from '../infra/messaging/topology';
import { OutboxRelayService } from './outbox-relay.service';
import { OutboxRepository } from './outbox.repository';

/**
 * Exercises the real outbox table (Postgres) and the real RabbitMQ exchange
 * from docker-compose — proves the relay actually delivers messages over the
 * wire, not just that it flips a column.
 */
describe('OutboxRelayService (integration)', () => {
  let pool: Pool;
  let outbox: OutboxRepository;
  let relay: OutboxRelayService;
  let appConnection: amqplib.ChannelModel;
  let testConnection: amqplib.ChannelModel;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), DatabaseModule, RabbitMqModule],
      providers: [OutboxRepository, OutboxRelayService],
    }).compile();

    pool = moduleRef.get(PG_POOL);
    outbox = moduleRef.get(OutboxRepository);
    relay = moduleRef.get(OutboxRelayService);
    appConnection = moduleRef.get(AMQP_CONNECTION);

    const rabbitmqUrl = moduleRef.get(ConfigService).getOrThrow<string>('RABBITMQ_URL');
    testConnection = await amqplib.connect(rabbitmqUrl);
  });

  afterAll(async () => {
    await testConnection.close();
    await appConnection.close();
    await pool.end();
  });

  // Previous crashed runs could leave unpublished rows behind; start every
  // test from a table with nothing left to claim, so publish counts are exact.
  beforeEach(async () => {
    // eslint-disable-next-line no-empty
    while ((await relay.tick()) > 0) {}
  });

  async function insertOutboxEvent(routingKey: string, payload: unknown): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await outbox.insert(client, {
        aggregateId: randomUUID(),
        eventType: 'test.event',
        routingKey,
        payload,
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  }

  /** Binds a fresh exclusive queue to the given routing key and collects deliveries as they arrive. */
  async function subscribe(routingKey: string): Promise<{
    take: (count: number, timeoutMs?: number) => Promise<unknown[]>;
    close: () => Promise<void>;
  }> {
    const channel = await testConnection.createChannel();
    const { queue } = await channel.assertQueue('', { exclusive: true });
    await channel.bindQueue(queue, BANK_TRANSFERS_EXCHANGE, routingKey);

    const received: unknown[] = [];
    await channel.consume(queue, (msg) => {
      if (!msg) return;
      received.push(JSON.parse(msg.content.toString()));
      channel.ack(msg);
    });

    return {
      take: (count, timeoutMs = 5000) =>
        new Promise((resolve, reject) => {
          const start = Date.now();
          const poll = (): void => {
            if (received.length >= count) return resolve(received.slice(0, count));
            if (Date.now() - start > timeoutMs) {
              reject(new Error(`Timed out waiting for ${count} messages, got ${received.length}`));
              return;
            }
            setTimeout(poll, 25);
          };
          poll();
        }),
      close: () => channel.close(),
    };
  }

  it('publishes an unpublished row to the exchange and marks it published', async () => {
    const routingKey = 'test.outbox.single';
    const sub = await subscribe(routingKey);
    try {
      await insertOutboxEvent(routingKey, { hello: 'world' });

      expect(await relay.tick()).toBe(1);

      const [message] = await sub.take(1);
      expect(message).toEqual({ hello: 'world' });
    } finally {
      await sub.close();
    }
  });

  it('never delivers the same row twice when relay ticks race (SKIP LOCKED)', async () => {
    const routingKey = 'test.outbox.concurrent';
    const sub = await subscribe(routingKey);
    try {
      const rowCount = 20;
      for (let i = 0; i < rowCount; i++) {
        await insertOutboxEvent(routingKey, { i });
      }

      const publishedCounts = await Promise.all([relay.tick(), relay.tick(), relay.tick()]);
      expect(publishedCounts.reduce((a, b) => a + b, 0)).toBe(rowCount);

      const messages = (await sub.take(rowCount)) as { i: number }[];
      const seen = new Set(messages.map((m) => m.i));
      expect(seen.size).toBe(rowCount);
    } finally {
      await sub.close();
    }
  });
});
