import logging

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractExchange, AbstractRobustConnection

from app.config import get_settings
from app.messaging.topology import BANK_TRANSFERS_EXCHANGE

logger = logging.getLogger("bank_b.messaging")

_connection: AbstractRobustConnection | None = None
_channel: AbstractChannel | None = None
_exchange: AbstractExchange | None = None


async def init_messaging() -> None:
    global _connection, _channel, _exchange
    # connect_robust auto-reconnects (and re-declares topology) on drops —
    # unlike a plain connect(), a heartbeat timeout here won't take the
    # whole process down the way it did on Bank A before that was fixed.
    _connection = await aio_pika.connect_robust(get_settings().rabbitmq_url)
    _channel = await _connection.channel()
    await _channel.set_qos(prefetch_count=10)
    _exchange = await _channel.declare_exchange(
        BANK_TRANSFERS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )
    logger.info("Connected to RabbitMQ and declared %s", BANK_TRANSFERS_EXCHANGE)


async def close_messaging() -> None:
    if _connection is not None:
        await _connection.close()


def get_channel() -> AbstractChannel:
    if _channel is None:
        raise RuntimeError("Messaging channel has not been initialized.")
    return _channel


def get_exchange() -> AbstractExchange:
    if _exchange is None:
        raise RuntimeError("Messaging exchange has not been initialized.")
    return _exchange
