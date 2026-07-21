from fastapi import APIRouter

from app.db import get_pool

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    async with get_pool().acquire() as connection:
        await connection.execute("SELECT 1")
    return {"status": "ok"}
