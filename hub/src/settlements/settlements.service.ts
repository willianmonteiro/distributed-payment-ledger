import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { Money, Settlement, SettlementNotFoundError } from '../domain';
import { BankRepository } from '../banks/bank.repository';
import { PG_POOL } from '../infra/database/database.module';
import { settlementNotifyRoutingKey, settlementOutcomeRoutingKey } from '../infra/messaging/topology';
import { LedgerRepository } from '../ledger/ledger.repository';
import { OutboxRepository } from '../outbox/outbox.repository';
import { SettlementRecord, SettlementRepository } from './settlement.repository';

export interface SettlementRequestedEvent {
  settlementId: string;
  payerBankId: string;
  payeeBankId: string;
  payeeAccountRef: string;
  amountCents: number;
}

export interface SettlementReplyEvent {
  settlementId: string;
  outcome: 'CONFIRMED' | 'REVERSED';
  reason?: string;
}

const UNKNOWN_PAYEE_BANK = 'UNKNOWN_PAYEE_BANK';

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly settlements: SettlementRepository,
    private readonly banks: BankRepository,
    private readonly ledger: LedgerRepository,
    private readonly outbox: OutboxRepository,
  ) {}

  async getSettlement(id: string): Promise<SettlementRecord> {
    const settlement = await this.settlements.findById(id);
    if (!settlement) throw new SettlementNotFoundError(id);
    return settlement;
  }

  /** Bank -> Hub: move reserves for a new settlement, or reject it outright if the destination bank is unknown. */
  async handleRequested(event: SettlementRequestedEvent): Promise<void> {
    const payeeBank = await this.banks.findById(event.payeeBankId);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (!payeeBank) {
        const record = await this.settlements.insert(client, {
          id: event.settlementId,
          payerBankId: event.payerBankId,
          payeeBankId: event.payeeBankId,
          payeeAccountRef: event.payeeAccountRef,
          amountCents: event.amountCents,
          status: 'REJECTED',
          rejectReason: UNKNOWN_PAYEE_BANK,
        });
        if (record) {
          await this.outbox.insert(client, {
            aggregateId: record.id,
            eventType: 'settlement.outcome',
            routingKey: settlementOutcomeRoutingKey(event.payerBankId),
            payload: { settlementId: record.id, outcome: 'REJECTED', reason: UNKNOWN_PAYEE_BANK },
          });
        }
        await client.query('COMMIT');
        return;
      }

      const settlement = Settlement.create({
        id: event.settlementId,
        payerBankId: event.payerBankId,
        payeeBankId: event.payeeBankId,
        payeeAccountRef: event.payeeAccountRef,
        amount: Money.fromCents(event.amountCents),
      });

      const record = await this.settlements.insert(client, {
        id: settlement.id,
        payerBankId: settlement.payerBankId,
        payeeBankId: settlement.payeeBankId,
        payeeAccountRef: settlement.payeeAccountRef,
        amountCents: settlement.amount.cents,
        status: 'PENDING',
        rejectReason: null,
      });

      if (record) {
        await this.ledger.append(settlement.entries(), client);
        await this.outbox.insert(client, {
          aggregateId: settlement.id,
          eventType: 'settlement.notify',
          routingKey: settlementNotifyRoutingKey(settlement.payeeBankId),
          payload: {
            settlementId: settlement.id,
            payerBankId: settlement.payerBankId,
            payeeAccountRef: settlement.payeeAccountRef,
            amountCents: settlement.amount.cents,
            occurredAt: new Date().toISOString(),
          },
        });
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Payee bank -> Hub: apply the outcome and relay it on to the payer bank. */
  async handleReply(event: SettlementReplyEvent): Promise<void> {
    const settlement = await this.settlements.findById(event.settlementId);
    if (!settlement) {
      throw new Error(`No settlement found for ${event.settlementId}.`);
    }
    // Already resolved: a redelivered or late reply is a no-op.
    if (settlement.status !== 'PENDING') return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      if (event.outcome === 'CONFIRMED') {
        await this.settlements.markConfirmed(settlement.id, client);
      } else {
        const reason = event.reason ?? 'REJECTED_BY_PAYEE_BANK';
        this.logger.warn(`Reversing settlement ${settlement.id}: ${reason}`);
        const domain = Settlement.create({
          id: settlement.id,
          payerBankId: settlement.payerBankId,
          payeeBankId: settlement.payeeBankId,
          payeeAccountRef: settlement.payeeAccountRef,
          amount: Money.fromCents(settlement.amountCents),
        });
        await this.ledger.append(domain.reversalEntries(), client);
        await this.settlements.markReversed(settlement.id, reason, client);
      }

      await this.outbox.insert(client, {
        aggregateId: settlement.id,
        eventType: 'settlement.outcome',
        routingKey: settlementOutcomeRoutingKey(settlement.payerBankId),
        payload: { settlementId: settlement.id, outcome: event.outcome, reason: event.reason },
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
