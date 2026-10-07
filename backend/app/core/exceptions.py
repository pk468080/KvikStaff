from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code

        super().__init__(message)


async def app_error_handler(
    request: Request,
    exc: AppError,
) -> JSONResponse:
    request_id = getattr(
        request.state,
        "request_id",
        None,
    )

    error: dict[str, Any] = {
        "code": exc.code,
        "message": exc.message,
    }

    if request_id:
        error["requestId"] = request_id

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "error": error,
        },
        headers={
            "X-Request-ID": request_id
        }
        if request_id
        else None,
    )