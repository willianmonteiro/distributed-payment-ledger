/**
 * Topic exchange shared by every bank and the Hub. Every routing key names a
 * *role* (never a specific counterparty) — the destination bank id is data,
 * carried in the payload or as a routing-key suffix a bank binds its own
 * queue to. Must match hub/src/infra/messaging/topology.ts exactly.
 */
export const HUB_SETTLEMENTS_EXCHANGE = 'hub-settlements';

/** This bank -> Hub: "move money for me". */
export const SETTLEMENT_REQUESTED_ROUTING_KEY = 'settlement.requested';

/** This bank -> Hub: "here's what happened on my end with a settlement you notified me about". */
export const SETTLEMENT_REPLY_ROUTING_KEY = 'settlement.reply';

/** Hub -> this bank (as payee): "you have incoming money". */
export function settlementNotifyRoutingKey(bankId: string): string {
  return `settlement.notify.${bankId}`;
}

/** Hub -> this bank (as payer): "here's the final outcome of the settlement you requested". */
export function settlementOutcomeRoutingKey(bankId: string): string {
  return `settlement.outcome.${bankId}`;
}
