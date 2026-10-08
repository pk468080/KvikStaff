import asyncio
import hashlib
import json
import logging
from collections.abc import Callable
from functools import wraps
from typing import Any

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text

from app.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

MAX_WAIT_TIME = 10  # maximum seconds to wait for an active concurrent request

def _hash_request(payload: Any) -> str:
    """Generate a canonical hash from the request payload."""
    # We serialize the request payload into a stable JSON string.
    # The payload could be a Pydantic model or dict.
    if hasattr(payload, "model_dump"):
        data = payload.model_dump()
    elif isinstance(payload, dict):
        data = payload
    else:
        # Fallback for simple types or unhashable structures
        try:
            data = jsonable_encoder(payload)
        except Exception:
            data = str(payload)

    serialized = json.dumps(data, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

def idempotent(action: str) -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            idempotency_key = kwargs.get("idempotency_key")
            current_user = kwargs.get("current_user")

            # Find the main request payload (e.g. InstantBookingCreateRequest)
            # Typically named 'request' in our endpoints
            payload = kwargs.get("request")

            if not idempotency_key:
                raise HTTPException(
                    status_code=400, detail="Idempotency-Key header is missing."
                )
            if not current_user:
                raise RuntimeError("current_user not found in kwargs")

            if len(idempotency_key) > 255:
                raise HTTPException(
                    status_code=400, detail="Idempotency key exceeds maximum length of 255 characters."
                )

            request_hash = _hash_request(payload) if payload else ""
            user_id = current_user.id
            wait_attempts = int(MAX_WAIT_TIME / 0.5)

            async with AsyncSessionLocal() as idemp_db:
                for _ in range(wait_attempts):
                    # Try to insert lock
                    async with idemp_db.begin():
                        result = await idemp_db.execute(
                            text("""
                                INSERT INTO public.idempotency_keys
                                (user_id, action, idempotency_key, request_hash, status)
                                VALUES (CAST(:user_id AS uuid), :action, :key, :hash, 'in_progress')
                                ON CONFLICT (user_id, action, idempotency_key) DO UPDATE
                                SET status = 'in_progress', request_hash = :hash
                                WHERE public.idempotency_keys.status = 'failed'
                                RETURNING status
                            """),
                            {
                                "user_id": user_id,
                                "action": action,
                                "key": idempotency_key,
                                "hash": request_hash
                            },
                        )
                        row = result.mappings().first()

                    if row:
                        # Successfully acquired the lock
                        break

                    # Lock already exists, fetch it
                    async with idemp_db.begin():
                        res = await idemp_db.execute(
                            text("""
                                SELECT status, request_hash, response_body
                                FROM public.idempotency_keys
                                WHERE user_id = CAST(:user_id AS uuid)
                                  AND action = :action
                                  AND idempotency_key = :key
                            """),
                            {"user_id": user_id, "action": action, "key": idempotency_key},
                        )
                        existing = res.mappings().first()

                    if not existing:
                        # Race condition, try again
                        continue

                    # Validate request hash match
                    if existing["request_hash"] != request_hash:
                        raise HTTPException(
                            status_code=409,
                            detail="Idempotency key reuse detected with different request payload."
                        )

                    if existing["status"] == "completed":
                        body = existing["response_body"]
                        if isinstance(body, str):
                            return json.loads(body)
                        return body

                    if existing["status"] == "failed":
                        # We should have acquired it in the INSERT ON CONFLICT, but race condition
                        continue

                    # Active 'in_progress', wait
                    await asyncio.sleep(0.5)
                else:
                    # Bounded wait exceeded
                    raise HTTPException(
                        status_code=409, detail="Concurrent request processing."
                    )

            # Process the actual request (outside of our idempotency lock transaction)
            business_success = False
            response = None
            try:
                response = await func(*args, **kwargs)
                business_success = True
            finally:
                # Final state update in dedicated session
                # If the business logic failed, we ONLY mark as failed if it threw an exception
                # This guarantees that if the business operation committed, we do not mark it failed.
                # If business logic failed *during* commit, the exception is raised, and we mark failed.
                async with AsyncSessionLocal() as final_db:
                    try:
                        async with final_db.begin():
                            if business_success:
                                safe_response = jsonable_encoder(response)
                                await final_db.execute(
                                    text("""
                                        UPDATE public.idempotency_keys
                                        SET status = 'completed',
                                            response_body = CAST(:response_body AS jsonb),
                                            response_status_code = 200
                                        WHERE user_id = CAST(:user_id AS uuid)
                                          AND action = :action
                                          AND idempotency_key = :key
                                    """),
                                    {
                                        "user_id": user_id,
                                        "action": action,
                                        "key": idempotency_key,
                                        "response_body": json.dumps(safe_response),
                                    },
                                )
                            else:
                                await final_db.execute(
                                    text("""
                                        UPDATE public.idempotency_keys
                                        SET status = 'failed'
                                        WHERE user_id = CAST(:user_id AS uuid)
                                          AND action = :action
                                          AND idempotency_key = :key
                                    """),
                                    {
                                        "user_id": user_id,
                                        "action": action,
                                        "key": idempotency_key,
                                    },
                                )
                    except Exception as inner_e:
                        logger.error(f"Failed to update idempotency state: {inner_e}")
                        # We must not swallow a successful business response if idempotency update fails

            return response

        return wrapper
    return decorator
