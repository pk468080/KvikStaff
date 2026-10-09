from __future__ import annotations

import logging
import time
from uuid import UUID, uuid4

from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.config import settings
from app.core.exceptions import AppError

logger = logging.getLogger(__name__)

WINDOW_MS = 15 * 60 * 1000
BOOKING_OTP_LIMIT = 3
CUSTOMER_OTP_LIMIT = 10

_redis_client: Redis | None = None

_RATE_LIMIT_SCRIPT = """
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local booking_limit = tonumber(ARGV[3])
local customer_limit = tonumber(ARGV[4])
local member = ARGV[5]

for i = 1, 2 do
    redis.call("ZREMRANGEBYSCORE", KEYS[i], "-inf", now - window)

    local count = redis.call("ZCARD", KEYS[i])
    local limit = booking_limit

    if i == 2 then
        limit = customer_limit
    end

    if count >= limit then
        return i
    end
end

redis.call("ZADD", KEYS[1], now, member)
redis.call("PEXPIRE", KEYS[1], window)

redis.call("ZADD", KEYS[2], now, member)
redis.call("PEXPIRE", KEYS[2], window)

return 0
"""


def get_redis_client() -> Redis:
    """Return the shared asynchronous Redis client."""
    global _redis_client

    if _redis_client is None:
        _redis_client = Redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            health_check_interval=30,
        )

    return _redis_client


async def close_redis_client() -> None:
    """Close the shared Redis client during application shutdown."""
    global _redis_client

    if _redis_client is not None:
        client = _redis_client
        _redis_client = None
        await client.aclose()


async def enforce_booking_otp_rate_limit(
    *,
    booking_id: UUID | str,
    customer_id: UUID | str,
    otp_type: str,
) -> None:
    """
    Enforce:
    - 3 OTP requests per booking and OTP type per rolling 15 minutes.
    - 10 OTP requests per customer per rolling 15 minutes.

    Production fails closed if Redis is unavailable. In non-production
    environments, a Redis outage does not block local development.
    """
    client = get_redis_client()
    now_ms = int(time.time() * 1000)
    request_token = f"{now_ms}:{uuid4().hex}"

    booking_key = (
        f"kvikstaff:rate:booking-otp:booking:{booking_id}:{otp_type}"
    )
    customer_key = (
        f"kvikstaff:rate:booking-otp:customer:{customer_id}"
    )

    try:
        result = await client.eval(
            _RATE_LIMIT_SCRIPT,
            2,
            booking_key,
            customer_key,
            now_ms,
            WINDOW_MS,
            BOOKING_OTP_LIMIT,
            CUSTOMER_OTP_LIMIT,
            request_token,
        )
    except (RedisError, OSError, TimeoutError) as exc:
        logger.error(
            "Booking OTP rate limiter could not reach Redis.",
            exc_info=True,
        )

        if settings.environment == "production":
            raise AppError(
                "OTP_RATE_LIMITER_UNAVAILABLE",
                "Booking OTP is temporarily unavailable. Please try again shortly.",
                503,
            ) from exc

        return

    result = int(result)

    if result == 1:
        raise AppError(
            "BOOKING_OTP_RATE_LIMITED",
            "Too many OTP requests for this booking. Please wait 15 minutes before trying again.",
            429,
        )

    if result == 2:
        raise AppError(
            "CUSTOMER_OTP_RATE_LIMITED",
            "You have requested too many booking OTPs. Please wait 15 minutes before trying again.",
            429,
        )
