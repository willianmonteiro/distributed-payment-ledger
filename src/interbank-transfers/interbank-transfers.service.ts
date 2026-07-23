import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import {
  AccountNotFoundError,
  IdempotencyConflictError,
  Money,
  SUSPENSE_ACCOUNT_ID,
  Transfer,
  TransferNotFoundError,
} from '../domain';
import { AccountRepository } from '../accounts/account.repository';
import { PG_POOL } from '../infra/database/database.module';
import { SETTLEMENT_REQUESTED_ROUTING_KEY } from '../infra/messaging/topology';
import { LedgerRepository } from '../ledger/ledger.repository';
import { OutboxRepository } from '../outbox/outbox.repository';
import { TransferRecord, TransferRepository } from '../transfers/transfer.repository';
import { InterbankTransferRecord, InterbankTransferRepository } from './interbank-transfer.repository';

export interface InterbankTransferParams {
  payerAccountId: string;
  payeeBankId: string;
  /** Opaque account identifier at the payee bank — meaningless to this bank beyond routing the event. */
  payeeAccountRef: string;
  amount: Money;
}

export interface InterbankTransferResult {
  transfer: TransferRecord;
  interbank: InterbankTransferRecord;
}

@Injectable()
export class InterbankTransfersService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly transfers: TransferRepository,
    private readonly interbankTransfers: InterbankTransferRepository,
    private readonly accounts: AccountRepository,
    private readonly ledger: LedgerRepository,
    private readonly outbox: OutboxRepository,
    private readonly config: ConfigService,
  ) {}

  async execute(
    idempotencyKey: string,
    params: InterbankTransferParams,
  ): Promise<InterbankTransferResult> {
    const transfer = Transfer.create({
      id: randomUUID(),
      payerAccountId: params.payerAccountId,
      payeeAccountId: SUSPENSE_ACCOUNT_ID,
      amount: params.amount,
    });

    const existing = await this.transfers.findByIdempotencyKey(idempotencyKey);
    if (existing) return this.replay(existing, transfer, params.payeeBankId, params.payeeAccountRef);

    const client = await this.pool.connect();
    let result: InterbankTransferResult | null = null;
    try {
      await client.query('BEGIN');

      // Only the payer needs locking: suspense's balance is never read or
      // asserted, so two interbank transfers from different payers can't
      // deadlock over it the way two arbitrary A<->A transfers could.
      const found = await this.accounts.lockById(transfer.payerAccountId, client);
      if (!found) throw new AccountNotFoundError(transfer.payerAccountId);

      const record = await this.transfers.insert(transfer, idempotencyKey, client);
      if (record) {
        transfer.assertPayerCanAfford(await this.ledger.balanceOf(transfer.payerAccountId, client));
        await this.ledger.append(transfer.entries(), client);

        const interbank = await this.interbankTransfers.insert(client, {
          transferId: transfer.id,
          payeeBankId: params.payeeBankId,
          payeeAccountRef: params.payeeAccountRef,
        });

        await this.outbox.insert(client, {
          aggregateId: transfer.id,
          eventType: 'settlement.requested',
          routingKey: SETTLEMENT_REQUESTED_ROUTING_KEY,
          payload: {
            settlementId: transfer.id,
            payerBankId: this.config.getOrThrow<string>('BANK_ID'),
            payeeBankId: params.payeeBankId,
            payeeAccountRef: params.payeeAccountRef,
            amountCents: params.amount.cents,
          },
        });

        result = { transfer: record, interbank };
        await client.query('COMMIT');
      } else {
        await client.query('ROLLBACK');
      }
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    if (result) return result;

    // Lost the race on the key: the winning insert is committed by now
    // (ON CONFLICT only skips after the competing transaction commits).
    const winner = await this.transfers.findByIdempotencyKey(idempotencyKey);
    if (!winner) throw new Error(`Interbank transfer with idempotency key ${idempotencyKey} vanished.`);
    return this.replay(winner, transfer, params.payeeBankId, params.payeeAccountRef);
  }

  async getTransfer(transferId: string): Promise<InterbankTransferResult> {
    const transfer = await this.transfers.findById(transferId);
    if (!transfer) throw new TransferNotFoundError(transferId);
    const interbank = await this.interbankTransfers.findById(transferId);
    if (!interbank) throw new TransferNotFoundError(transferId);
    return { transfer, interbank };
  }

  /** A replayed request must match the original exactly; otherwise the key is being misused. */
  private async replay(
    existing: TransferRecord,
    attempted: Transfer,
    payeeBankId: string,
    payeeAccountRef: string,
  ): Promise<InterbankTransferResult> {
    const matches =
      existing.payerAccountId === attempted.payerAccountId &&
      existing.payeeAccountId === attempted.payeeAccountId &&
      existing.amount.equals(attempted.amount);
    if (!matches) throw new IdempotencyConflictError();

    const interbank = await this.interbankTransfers.findById(existing.id);
    if (
      !interbank ||
      interbank.payeeBankId !== payeeBankId ||
      interbank.payeeAccountRef !== payeeAccountRef
    ) {
      throw new IdempotencyConflictError();
    }
    return { transfer: existing, interbank };
  }
}
