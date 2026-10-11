from __future__ import annotations

import logging
import time
from uuid import uuid4

from fastapi import HTTPException
from redis.exceptions import RedisError

from app.core.booking_otp_rate_limit import get_redis_client
from app.core.config import settings

logger = logging.getLogger(__name__)

WINDOW_MS = 15 * 60 * 1000
CUSTOMER_REQUEST_LIMIT = 20

_RATE_LIMIT_SCRIPT = """
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call("ZREMRANGEBYSCORE", KEYS[1], "-inf", now - window)

local count = redis.call("ZCARD", KEYS[1])
if count >= limit then
    return 0
end

redis.call("ZADD", KEYS[1], now, member)
redis.call("PEXPIRE", KEYS[1], window)

return 1
"""


async def enforce_geocoding_rate_limit(
    *,
    customer_id: str,
) -> None:
    """Limit address searches to 20 per customer per 15 minutes."""
    client = get_redis_client()
    now_ms = int(time.time() * 1000)
    member = f"{now_ms}:{uuid4().hex}"
    key = f"kvikstaff:rate:geocoding:customer:{customer_id}"

    try:
        result = await client.eval(
            _RATE_LIMIT_SCRIPT,
            1,
            key,
            now_ms,
            WINDOW_MS,
            CUSTOMER_REQUEST_LIMIT,
            member,
        )
    except (RedisError, OSError, TimeoutError) as exc:
        logger.error(
            "Geocoding rate limiter unavailable (%s).",
            type(exc).__name__,
        )

        if settings.environment == "production":
            raise HTTPException(
                status_code=503,
                detail=(
                    "Address search is temporarily unavailable. "
                    "Please try again shortly."
                ),
            ) from exc

        return

    if int(result) == 0:
        raise HTTPException(
            status_code=429,
            detail=(
                "Too many address searches. Please wait "
                "15 minutes before trying again."
            ),
        )