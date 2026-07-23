import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InterbankReplyService } from './interbank-reply.service';
import { InterbankTransferRepository } from './interbank-transfer.repository';

/**
 * The saga's event path (reply consumer) handles the fast case: a reply
 * arrives, the transfer settles. This is the safety net for the case events
 * don't cover — the settlement.requested or its outcome never arrives at
 * all. Runs far less often than the event path on purpose: the threshold
 * has to comfortably exceed ordinary processing latency, or this would flag
 * transfers that are simply still in flight as "stuck".
 */
const STALE_AFTER_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

interface HubSettlementView {
  status: 'PENDING' | 'CONFIRMED' | 'REVERSED' | 'REJECTED';
  rejectReason: string | null;
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly interbankTransfers: InterbankTransferRepository,
    private readonly replyService: InterbankReplyService,
    private readonly config: ConfigService,
  ) {}

  /** One full pass. Public so tests and manual triggers don't have to wait on the interval. */
  async sweep(): Promise<{ checked: number; reconciled: number }> {
    const stale = await this.interbankTransfers.findStaleDebited(new Date(Date.now() - STALE_AFTER_MS));
    let reconciled = 0;
    for (const transfer of stale) {
      if (await this.reconcileOne(transfer.transferId)) reconciled += 1;
    }
    return { checked: stale.length, reconciled };
  }

  /** Asks the Hub for the ground truth on one settlement and applies it. Returns whether anything changed. */
  async reconcileOne(transferId: string): Promise<boolean> {
    const hubUrl = this.config.getOrThrow<string>('HUB_URL');
    const response = await fetch(`${hubUrl}/settlements/${transferId}`);

    if (response.status === 404) {
      // The Hub has no record: settlement.requested never arrived (or the
      // Hub hasn't processed it yet, which STALE_AFTER_MS is sized to rule out).
      this.logger.warn(`Reconciling ${transferId}: no record at the Hub, compensating.`);
      await this.replyService.handle({
        settlementId: transferId,
        outcome: 'REJECTED',
        reason: 'RECONCILIATION_NO_RECORD_AT_HUB',
      });
      return true;
    }

    if (!response.ok) {
      this.logger.error(`Reconciling ${transferId}: Hub returned ${response.status}; retrying next sweep.`);
      return false;
    }

    const hubView = (await response.json()) as HubSettlementView;
    if (hubView.status === 'PENDING') {
      // The Hub itself is still waiting on the payee bank — nothing this
      // bank can resolve yet; leave it for the next sweep.
      return false;
    }

    this.logger.warn(
      `Reconciling ${transferId}: the Hub already settled it as ${hubView.status}; the outcome event must have been lost.`,
    );
    await this.replyService.handle({
      settlementId: transferId,
      outcome: hubView.status,
      reason: hubView.rejectReason ?? undefined,
    });
    return true;
  }

  @Interval(SWEEP_INTERVAL_MS)
  private async handleInterval(): Promise<void> {
    try {
      const { checked, reconciled } = await this.sweep();
      if (checked > 0) {
        this.logger.log(`Reconciliation sweep: checked ${checked}, reconciled ${reconciled}.`);
      }
    } catch (error) {
      this.logger.error('Reconciliation sweep failed', error instanceof Error ? error.stack : error);
    }
  }
}
