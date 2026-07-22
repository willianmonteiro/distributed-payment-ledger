from __future__ import annotations

import json
import logging

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractExchange, AbstractIncomingMessage

from app.messaging.topology import (
    INBOUND_DLQ_NAME,
    INBOUND_DLX_NAME,
    INBOUND_QUEUE_NAME,
    TRANSFER_INITIATED_ROUTING_KEY,
    TRANSFER_REPLY_ROUTING_KEY,
)
from app.transfers.service import InboundTransfersService, ReplyEvent, TransferInitiatedEvent

logger = logging.getLogger("bank_b.transfers.consumer")


async def start_consuming(
    channel: AbstractChannel, exchange: AbstractExchange, service: InboundTransfersService
) -> None:
    # A malformed payload or a bug in handle() would otherwise redeliver
    # forever (nack -> requeue -> nack -> ...); after requeue=False the
    # broker routes it here instead, where it waits for a human.
    dlx = await channel.declare_exchange(
        INBOUND_DLX_NAME, aio_pika.ExchangeType.FANOUT, durable=True
    )
    dlq = await channel.declare_queue(INBOUND_DLQ_NAME, durable=True)
    await dlq.bind(dlx)

    queue = await channel.declare_queue(
        INBOUND_QUEUE_NAME,
        durable=True,
        arguments={"x-dead-letter-exchange": INBOUND_DLX_NAME},
    )
    await queue.bind(exchange, routing_key=TRANSFER_INITIATED_ROUTING_KEY)

    async def on_message(message: AbstractIncomingMessage) -> None:
        try:
            async with message.process(requeue=False):
                payload = json.loads(message.body)
                event = TransferInitiatedEvent(
                    transfer_id=payload["transferId"],
                    payee_account_id=payload["payeeAccountId"],
                    amount_cents=payload["amountCents"],
                )
                reply = await service.handle(event)
                await _publish_reply(exchange, reply)
        except Exception:
            # message.process() already nacked (-> DLX) on the exception above;
            # this is purely so the failure is visible in our own logs too.
            logger.exception("Failed to process transfer.initiated message; routed to DLQ")

    await queue.consume(on_message)
    logger.info("Consuming %s bound to %s", INBOUND_QUEUE_NAME, TRANSFER_INITIATED_ROUTING_KEY)


async def _publish_reply(exchange: AbstractExchange, reply: ReplyEvent) -> None:
    body = json.dumps(
        {
            "eventType": reply.event_type,
            "transferId": reply.transfer_id,
            "reason": reply.reason,
            "occurredAt": reply.occurred_at,
        }
    ).encode()
    message = aio_pika.Message(
        body=body,
        content_type="application/json",
        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
    )
    await exchange.publish(message, routing_key=TRANSFER_REPLY_ROUTING_KEY)
