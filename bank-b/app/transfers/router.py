from __future__ import annotations

from uuid import UUID

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.db import get_pool
from app.transfers.repository import IncomingTransferRepository

router = APIRouter(prefix="/internal/transfers", tags=["internal"])


class IncomingTransferResponse(BaseModel):
    transfer_id: str
    status: str
    reject_reason: str | None


def get_incoming_transfer_repository(
    pool: asyncpg.Pool = Depends(get_pool),
) -> IncomingTransferRepository:
    return IncomingTransferRepository(pool)


@router.get("/{transfer_id}", response_model=IncomingTransferResponse)
async def get_incoming_transfer(
    transfer_id: UUID,
    incoming_transfers: IncomingTransferRepository = Depends(get_incoming_transfer_repository),
) -> IncomingTransferResponse:
    """
    Ground truth for Bank A's reconciliation sweep: "what actually happened
    to this transfer here", independent of whether the reply event we sent
    ever arrived. Internal-only in spirit — a real deployment would put this
    behind service-to-service auth, not the public API surface.
    """
    record = await incoming_transfers.find_by_id(str(transfer_id))
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown transfer")
    return IncomingTransferResponse(
        transfer_id=record.transfer_id, status=record.status, reject_reason=record.reject_reason
    )
