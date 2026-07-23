from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.accounts.repository import AccountRepository
from app.accounts.router import router as accounts_router
from app.db import close_pool, get_pool, init_pool
from app.domain import DomainError
from app.health.router import router as health_router
from app.http.exception_handlers import domain_error_handler
from app.ledger.repository import LedgerRepository
from app.messaging.connection import close_messaging, get_channel, get_exchange, init_messaging
from app.transfers.consumer import start_consuming
from app.transfers.repository import IncomingTransferRepository
from app.transfers.router import router as transfers_router
from app.transfers.service import InboundTransfersService


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await init_pool()
    await init_messaging()

    pool = get_pool()
    service = InboundTransfersService(
        pool,
        IncomingTransferRepository(pool),
        AccountRepository(pool),
        LedgerRepository(pool),
    )
    await start_consuming(get_channel(), get_exchange(), service)

    yield

    await close_messaging()
    await close_pool()


app = FastAPI(lifespan=lifespan)
# Open CORS: this is a local demo/portfolio service, not multi-tenant production.
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.add_exception_handler(DomainError, domain_error_handler)
app.include_router(health_router)
app.include_router(accounts_router)
app.include_router(transfers_router)
