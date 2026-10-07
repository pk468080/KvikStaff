from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.exceptions import AppError, app_error_handler
from app.core.logging import configure_logging


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    yield


def build_docs_config() -> dict[str, str | None]:
    """
    Keep interactive API documentation available in development/staging,
    but do not expose it publicly in production.
    """
    if settings.environment == "production":
        return {
            "docs_url": None,
            "redoc_url": None,
            "openapi_url": None,
        }

    return {
        "docs_url": "/docs",
        "redoc_url": "/redoc",
        "openapi_url": "/openapi.json",
    }


docs_config = build_docs_config()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    debug=settings.debug,
    lifespan=lifespan,
    **docs_config,
)


@app.middleware("http")
async def request_context_middleware(
    request: Request,
    call_next,
):
    """
    Generate one request ID for every API request.

    This ID is returned to the client so support/admin logs can correlate
    a failed request with backend logs and downstream operations.
    """
    request_id = str(uuid4())

    request.state.request_id = request_id

    response = await call_next(request)

    response.headers["X-Request-ID"] = request_id

    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=[
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS",
    ],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Accept",
        "Idempotency-Key",
        "X-Request-ID",
    ],
)


app.add_exception_handler(
    AppError,
    app_error_handler,
)


app.include_router(
    api_router,
    prefix=settings.api_v1_prefix,
)