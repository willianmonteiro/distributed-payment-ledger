import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Pool } from 'pg';
import { PG_POOL } from '../infra/database/database.module';
import { RabbitMqPublisher } from '../infra/messaging/rabbitmq.publisher';
import { HUB_SETTLEMENTS_EXCHANGE } from '../infra/messaging/topology';
import { OutboxRepository } from './outbox.repository';

const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 1000;

@Injectable()
export class OutboxRelayService {
  private readonly logger = new Logger(OutboxRelayService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly outbox: OutboxRepository,
    private readonly publisher: RabbitMqPublisher,
  ) {}

  /** Runs one poll-publish-mark cycle and returns how many events it published. Public so tests can drive it directly. */
  async tick(): Promise<number> {
    const client = await this.pool.connect();
    let published = 0;
    try {
      await client.query('BEGIN');
      const events = await this.outbox.claimUnpublished(client, BATCH_SIZE);
      for (const event of events) {
        this.publisher.publish(HUB_SETTLEMENTS_EXCHANGE, event.routingKey, event.payload);
        await this.outbox.markPublished(client, event.id);
        published += 1;
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      this.logger.error('Outbox relay tick failed', error instanceof Error ? error.stack : error);
      throw error;
    } finally {
      client.release();
    }
    return published;
  }

  @Interval(POLL_INTERVAL_MS)
  private async handleInterval(): Promise<void> {
    try {
      await this.tick();
    } catch {
      // Already logged in tick(); published_at stays NULL so the next tick retries.
    }
  }
}
