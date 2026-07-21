from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import close_pool, init_pool
from app.health.router import router as health_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    await init_pool()
    yield
    await close_pool()


app = FastAPI(lifespan=lifespan)
app.include_router(health_router)
