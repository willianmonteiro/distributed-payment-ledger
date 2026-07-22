"""Shared with Bank A's src/infra/messaging/topology.ts — keep routing keys in sync."""

BANK_TRANSFERS_EXCHANGE = "bank-transfers"
TRANSFER_INITIATED_ROUTING_KEY = "transfer.initiated.bank-b"
TRANSFER_REPLY_ROUTING_KEY = "transfer.reply.bank-a"

INBOUND_QUEUE_NAME = "bank-b.transfers.inbox"
INBOUND_DLX_NAME = "bank-b.transfers.inbox.dlx"
INBOUND_DLQ_NAME = "bank-b.transfers.inbox.dlq"
