import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { SUSPENSE_ACCOUNT_ID, Transfer } from '../domain';
import { PG_POOL } from '../infra/database/database.module';
import { LedgerRepository } from '../ledger/ledger.repository';
import { TransferRepository } from '../transfers/transfer.repository';
import { InterbankTransferRepository } from './interbank-transfer.repository';

/** The Hub's outcome for a settlement this bank requested. */
export interface SettlementOutcomeEvent {
  settlementId: string;
  outcome: 'CONFIRMED' | 'REVERSED' | 'REJECTED';
  reason?: string;
}

@Injectable()
export class InterbankReplyService {
  private readonly logger = new Logger(InterbankReplyService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly transfers: TransferRepository,
    private readonly interbankTransfers: InterbankTransferRepository,
    private readonly ledger: LedgerRepository,
  ) {}

  async handle(event: SettlementOutcomeEvent): Promise<void> {
    const interbank = await this.interbankTransfers.findById(event.settlementId);
    if (!interbank) {
      throw new Error(`No interbank transfer found for ${event.settlementId}.`);
    }
    // Already CONFIRMED or COMPENSATED: a redelivered reply (or, later, a
    // reconciliation pass that got there first) — nothing left to do.
    if (interbank.status !== 'DEBITED') return;

    if (event.outcome === 'CONFIRMED') {
      await this.interbankTransfers.markConfirmed(event.settlementId);
      return;
    }

    // REVERSED (the payee bank couldn't credit locally) and REJECTED (the
    // Hub didn't recognize the payee bank at all) both mean the payer's
    // money never reached anyone — same compensation either way.
    this.logger.warn(
      `Compensating transfer ${event.settlementId}: ${event.outcome} (${event.reason ?? 'no reason given'})`,
    );
    await this.compensate(event.settlementId);
  }

  /** Reverses the local leg: suspense -> original payer. No affordability check —
   *  this money undeniably reached suspense when the original transfer debited. */
  private async compensate(originalTransferId: string): Promise<void> {
    const original = await this.transfers.findById(originalTransferId);
    if (!original) {
      throw new Error(`Local transfer ${originalTransferId} not found for compensation.`);
    }

    const reversal = Transfer.create({
      id: randomUUID(),
      payerAccountId: SUSPENSE_ACCOUNT_ID,
      payeeAccountId: original.payerAccountId,
      amount: original.amount,
    });

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const record = await this.transfers.insert(
        reversal,
        `compensation-${originalTransferId}`,
        client,
      );
      if (record) {
        await this.ledger.append(reversal.entries(), client);
      }
      await this.interbankTransfers.markCompensated(originalTransferId, client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
