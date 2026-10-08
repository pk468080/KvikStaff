import asyncio
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

# Wait up to 10 seconds for concurrent requests
MAX_WAIT_TIME = 10
# Consider a lease stale after 30 seconds
STALE_LEASE_SECONDS = 30

def idempotent(action: str) -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            idempotency_key = kwargs.get("idempotency_key")
            current_user = kwargs.get("current_user")

            if not idempotency_key:
                raise HTTPException(
                    status_code=400, detail="Idempotency-Key header is missing."
                )
            if not current_user:
                raise RuntimeError("current_user not found in kwargs")

            # Stronger validation for idempotency key
            if len(idempotency_key) > 255:
                raise HTTPException(
                    status_code=400, detail="Idempotency key exceeds maximum length of 255 characters."
                )

            user_id = current_user.id
            wait_attempts = int(MAX_WAIT_TIME / 0.5)

            # We use a dedicated DB session to avoid interfering with the
            # request-scoped transaction (e.g. if the caller does a rollback).
            async with AsyncSessionLocal() as idemp_db:
                for _ in range(wait_attempts):
                    # Try to insert or acquire lease
                    async with idemp_db.begin():
                        # We use 'locked_at' to implement a lease timeout for 'in_progress' status
                        result = await idemp_db.execute(
                            text("""
                                INSERT INTO public.idempotency_keys (user_id, action, idempotency_key, status, locked_at)
                                VALUES (CAST(:user_id AS uuid), :action, :key, 'in_progress', NOW())
                                ON CONFLICT (user_id, action, idempotency_key) DO UPDATE
                                SET
                                    status = 'in_progress',
                                    locked_at = NOW()
                                WHERE
                                    public.idempotency_keys.status = 'failed'
                                    OR (
                                        public.idempotency_keys.status = 'in_progress'
                                        AND public.idempotency_keys.locked_at < NOW() - INTERVAL ':stale_seconds seconds'
                                    )
                                RETURNING status
                            """),
                            {
                                "user_id": user_id,
                                "action": action,
                                "key": idempotency_key,
                                "stale_seconds": STALE_LEASE_SECONDS
                            },
                        )
                        row = result.mappings().first()

                    if row:
                        # Successfully acquired the lock
                        break

                    # Otherwise, it exists and is either 'completed' or an active 'in_progress'
                    async with idemp_db.begin():
                        res = await idemp_db.execute(
                            text("""
                                SELECT status, response_body
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

                    if existing["status"] == "completed":
                        body = existing["response_body"]
                        if isinstance(body, str):
                            return json.loads(body)
                        return body

                    if existing["status"] == "failed":
                        # We should have acquired it in the INSERT ON CONFLICT, but maybe race condition
                        continue

                    # Active 'in_progress', wait
                    await asyncio.sleep(0.5)
                else:
                    raise HTTPException(
                        status_code=409, detail="Concurrent request processing."
                    )

            # Process the actual request (outside of our idempotency lock transaction)
            business_success = False
            response = None
            try:
                response = await func(*args, **kwargs)
                business_success = True
            except asyncio.CancelledError:
                # If the request is cancelled, we must mark it as failed so it can be retried.
                # However, if the inner function already committed its transaction, we might
                # have a discrepancy. Standard FastAPI pattern is cancellation rolls back
                # uncommitted transactions.
                business_success = False
                raise
            except Exception as e:
                business_success = False
                raise
            finally:
                # Final state update in dedicated session
                async with AsyncSessionLocal() as final_db:
                    try:
                        async with final_db.begin():
                            if business_success:
                                # Serialize safely using FastAPI's jsonable_encoder
                                safe_response = jsonable_encoder(response)
                                await final_db.execute(
                                    text("""
                                        UPDATE public.idempotency_keys
                                        SET status = 'completed',
                                            response_body = CAST(:response_body AS jsonb),
                                            response_status_code = 200,
                                            locked_at = NULL
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
                                        SET status = 'failed',
                                            locked_at = NULL
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
                        # If business logic succeeded but we fail to record idempotency,
                        # DO NOT raise, as the operation is committed. Return the response.
                        # If business logic failed, the original exception was already raised.

            return response

        return wrapper
    return decorator
