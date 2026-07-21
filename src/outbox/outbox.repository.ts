import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';

export interface OutboxEvent {
  id: number;
  routingKey: string;
  payload: unknown;
}

@Injectable()
export class OutboxRepository {
  /** Appends an event inside the caller's transaction, atomic with whatever business write it accompanies. */
  async insert(
    client: PoolClient,
    params: { aggregateId: string; eventType: string; routingKey: string; payload: unknown },
  ): Promise<void> {
    await client.query(
      `INSERT INTO outbox_events (aggregate_id, event_type, routing_key, payload)
       VALUES ($1, $2, $3, $4)`,
      [params.aggregateId, params.eventType, params.routingKey, JSON.stringify(params.payload)],
    );
  }

  /** Claims up to `limit` unpublished rows, skipping any a concurrent relay tick already has locked. */
  async claimUnpublished(client: PoolClient, limit: number): Promise<OutboxEvent[]> {
    const { rows } = await client.query<{ id: number; routing_key: string; payload: unknown }>(
      `SELECT id, routing_key, payload FROM outbox_events
        WHERE published_at IS NULL
        ORDER BY id
        LIMIT $1
        FOR UPDATE SKIP LOCKED`,
      [limit],
    );
    return rows.map((row) => ({ id: row.id, routingKey: row.routing_key, payload: row.payload }));
  }

  async markPublished(client: PoolClient, id: number): Promise<void> {
    await client.query('UPDATE outbox_events SET published_at = now() WHERE id = $1', [id]);
  }
}
