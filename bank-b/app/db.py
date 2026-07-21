import asyncpg

from app.config import get_settings

_pool: asyncpg.Pool | None = None


async def init_pool() -> asyncpg.Pool:
    global _pool
    _pool = await asyncpg.create_pool(dsn=get_settings().database_url)
    return _pool


async def close_pool() -> None:
    if _pool is not None:
        await _pool.close()


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Connection pool has not been initialized.")
    return _pool
