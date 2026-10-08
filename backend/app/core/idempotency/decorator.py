import asyncio
import json
import logging
from collections.abc import Callable
from functools import wraps
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

def idempotent(action: str) -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            idempotency_key = kwargs.get("idempotency_key")
            current_user = kwargs.get("current_user")
            # We need to extract the db session from kwargs.
            # Many endpoints use get_bookings_service or get_payments_service,
            # which encapsulate the repository and db session.
            # Alternatively, we could inject db directly into the endpoint.
            # To avoid heavily changing the endpoint signature beyond what's required,
            # we'll look for `db` in kwargs.
            db: AsyncSession | None = kwargs.get("db")
            if db is None:
               # Try to get it from the service
               service = kwargs.get("service")
               if service and hasattr(service, "repository") and hasattr(service.repository, "db"):
                   db = service.repository.db

            if not idempotency_key:
                raise HTTPException(
                    status_code=400, detail="Idempotency-Key header is missing."
                )
            if not current_user:
                raise RuntimeError("current_user not found in kwargs")
            if not db:
                raise RuntimeError("db not found in kwargs")

            user_id = current_user.id
            max_attempts = 10

            for _ in range(max_attempts):
                async with db.begin():
                    # Attempt to insert, if fails on conflict but status is 'failed', update it.
                    # Otherwise do nothing and it will return 0 rows.
                    result = await db.execute(
                        text("""
                            INSERT INTO idempotency_keys (user_id, action, idempotency_key, status)
                            VALUES (CAST(:user_id AS uuid), :action, :key, 'in_progress')
                            ON CONFLICT (user_id, action, idempotency_key) DO UPDATE
                            SET status = 'in_progress'
                            WHERE idempotency_keys.status = 'failed'
                            RETURNING status
                        """),
                        {"user_id": user_id, "action": action, "key": idempotency_key},
                    )
                    row = result.mappings().first()

                if row:
                    # Successfully acquired the lock
                    break

                # Otherwise, it exists and is either 'completed' or 'in_progress'
                async with db.begin():
                    res = await db.execute(
                        text("""
                            SELECT status, response_body
                            FROM idempotency_keys
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
                    # Parse the JSON if it's returned as a string, else return directly
                    body = existing["response_body"]
                    if isinstance(body, str):
                        return json.loads(body)
                    return body

                if existing["status"] == "failed":
                    continue

                # 'in_progress'
                await asyncio.sleep(0.5)
            else:
                raise HTTPException(
                    status_code=409, detail="Concurrent request processing."
                )

            # Process the actual request
            try:
                response = await func(*args, **kwargs)

                # Save success
                async with db.begin():
                    await db.execute(
                        text("""
                            UPDATE idempotency_keys
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
                            "response_body": json.dumps(response),
                        },
                    )
                return response

            except Exception:
                # Save failure
                try:
                    async with db.begin():
                        await db.execute(
                            text("""
                                UPDATE idempotency_keys
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
                    logger.error(f"Failed to mark idempotency key as failed: {inner_e}")
                raise

        return wrapper
    return decorator
