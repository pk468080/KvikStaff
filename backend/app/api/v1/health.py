import logging

from fastapi import APIRouter, Response, status
from redis.exceptions import RedisError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.booking_otp_rate_limit import get_redis_client
from app.core.config import settings
from app.core.database import engine

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/health/live")
async def liveness() -> dict:
    """Confirm that the API process can answer requests."""
    return {
        "success": True,
        "data": {"status": "ok"},
        "error": None,
    }


@router.get("/health/ready")
async def readiness(response: Response) -> dict:
    """
    Check dependencies required to serve production requests.

    Keep detailed exceptions in server logs. Do not expose connection
    strings, credentials, or raw database exceptions to clients.
    """
    try:
        async with engine.connect() as connection:
            await connection.execute(text("select 1"))

    except SQLAlchemyError:
        logger.exception(
            "Readiness check failed: PostgreSQL connection/query"
        )
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

        return {
            "success": False,
            "data": {"status": "degraded"},
            "error": {
                "code": "DATABASE_UNAVAILABLE",
                "message": "Database is unavailable.",
            },
        }

    if settings.environment == "production":
        try:
            redis_client = get_redis_client()

            if redis_client is None:
                raise RuntimeError(
                    "Redis client was not configured"
                )

            await redis_client.ping()

        except (
            RedisError,
            OSError,
            TimeoutError,
            RuntimeError,
        ):
            logger.exception(
                "Readiness check failed: Redis ping"
            )
            response.status_code = (
                status.HTTP_503_SERVICE_UNAVAILABLE
            )

            return {
                "success": False,
                "data": {"status": "degraded"},
                "error": {
                    "code": "REDIS_UNAVAILABLE",
                    "message": (
                        "A required service is unavailable."
                    ),
                },
            }

    return {
        "success": True,
        "data": {"status": "ready"},
        "error": None,
    }