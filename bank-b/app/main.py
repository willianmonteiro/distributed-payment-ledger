from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.accounts.router import router as accounts_router
from app.db import close_pool, init_pool
from app.domain import DomainError
from app.health.router import router as health_router
from app.http.exception_handlers import domain_error_handler


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await init_pool()
    yield
    await close_pool()


app = FastAPI(lifespan=lifespan)
app.add_exception_handler(DomainError, domain_error_handler)
app.include_router(health_router)
app.include_router(accounts_router)
