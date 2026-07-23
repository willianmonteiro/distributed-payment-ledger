/**
 * Topic exchange shared by every bank and the Hub. Unlike the bilateral
 * design's routing keys (which named a specific counterparty), every
 * routing key here names a *role* — the destination bank id is data
 * (in the payload or as a routing-key suffix each bank binds its own
 * queue to), never baked into another service's code.
 */
export const HUB_SETTLEMENTS_EXCHANGE = 'hub-settlements';

/** Bank -> Hub: "move money for me". Single queue, the Hub is the only consumer. */
export const SETTLEMENT_REQUESTED_ROUTING_KEY = 'settlement.requested';

/** Bank -> Hub: "here's what happened on my end with a settlement you notified me about". */
export const SETTLEMENT_REPLY_ROUTING_KEY = 'settlement.reply';

/** Hub -> payee bank: "you have incoming money". Each bank binds its own queue to its own id. */
export function settlementNotifyRoutingKey(bankId: string): string {
  return `settlement.notify.${bankId}`;
}

/** Hub -> payer bank: "here's the final outcome of the settlement you requested". */
export function settlementOutcomeRoutingKey(bankId: string): string {
  return `settlement.outcome.${bankId}`;
}
