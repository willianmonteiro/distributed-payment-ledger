from __future__ import annotations

from fastapi import Request, status
from fastapi.responses import JSONResponse

from app.domain import AccountNotFoundError, DomainError, InvalidAmountError

_STATUS_BY_ERROR: list[tuple[type[DomainError], int]] = [
    (AccountNotFoundError, status.HTTP_404_NOT_FOUND),
    (InvalidAmountError, status.HTTP_400_BAD_REQUEST),
]


async def domain_error_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, DomainError)
    status_code = next(
        (code for error_type, code in _STATUS_BY_ERROR if isinstance(exc, error_type)),
        status.HTTP_500_INTERNAL_SERVER_ERROR,
    )
    return JSONResponse(
        status_code=status_code,
        content={"statusCode": status_code, "error": type(exc).__name__, "message": str(exc)},
    )
