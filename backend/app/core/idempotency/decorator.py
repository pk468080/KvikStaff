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

MAX_WAIT_TIME = 10
WAIT_INTERVAL = 0.5


def _hash_request(payload: Any) -> str:
    """Generate a deterministic SHA-256 hash for a request payload."""
    if payload is None:
        data = None
    elif hasattr(payload, "model_dump"):
        # JSON mode converts UUID/date/time/datetime/etc. to JSON-safe values.
        data = payload.model_dump(mode="json")
    elif isinstance(payload, dict):
        data = jsonable_encoder(payload)
    else:
        data = jsonable_encoder(payload)

    serialized = json.dumps(
        data,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )

    return hashlib.sha256(
        serialized.encode("utf-8")
    ).hexdigest()


def idempotent(action: str) -> Callable:
    """Protect a customer mutation using a durable PostgreSQL idempotency key."""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> Any:
            idempotency_key = kwargs.get("idempotency_key")
            current_user = kwargs.get("current_user")
            payload = kwargs.get("request")

            if not idempotency_key:
                raise HTTPException(
                    status_code=400,
                    detail="Idempotency-Key header is missing.",
                )

            if not current_user:
                raise RuntimeError(
                    "current_user not found in kwargs"
                )

            idempotency_key = str(idempotency_key).strip()

            if not idempotency_key:
                raise HTTPException(
                    status_code=400,
                    detail="Idempotency-Key header is missing.",
                )

            if len(idempotency_key) > 255:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Idempotency key exceeds maximum length "
                        "of 255 characters."
                    ),
                )

            request_hash = _hash_request(payload)
            user_id = current_user.id

            wait_attempts = max(
                1,
                int(MAX_WAIT_TIME / WAIT_INTERVAL),
            )

            async with AsyncSessionLocal() as idemp_db:
                acquired = False

                for _ in range(wait_attempts):
                    # Insert the key for a new request.
                    #
                    # A failed request may be retried ONLY when the
                    # original request hash is identical.
                    #
                    # Important: request_hash is deliberately NOT
                    # overwritten on conflict.
                    async with idemp_db.begin():
                        result = await idemp_db.execute(
                            text(
                                """
                                INSERT INTO public.idempotency_keys
                                (
                                    user_id,
                                    action,
                                    idempotency_key,
                                    request_hash,
                                    status
                                )
                                VALUES
                                (
                                    CAST(:user_id AS uuid),
                                    :action,
                                    :key,
                                    :hash,
                                    'in_progress'
                                )
                                ON CONFLICT
                                (
                                    user_id,
                                    action,
                                    idempotency_key
                                )
                                DO UPDATE
                                SET status = 'in_progress'
                                WHERE
                                    public.idempotency_keys.status = 'failed'
                                    AND public.idempotency_keys.request_hash = :hash
                                RETURNING status
                                """
                            ),
                            {
                                "user_id": user_id,
                                "action": action,
                                "key": idempotency_key,
                                "hash": request_hash,
                            },
                        )

                        row = result.mappings().first()

                    if row:
                        acquired = True
                        break

                    # Existing key. Read its state.
                    async with idemp_db.begin():
                        result = await idemp_db.execute(
                            text(
                                """
                                SELECT
                                    status,
                                    request_hash,
                                    response_body,
                                    response_status_code
                                FROM public.idempotency_keys
                                WHERE
                                    user_id = CAST(:user_id AS uuid)
                                    AND action = :action
                                    AND idempotency_key = :key
                                """
                            ),
                            {
                                "user_id": user_id,
                                "action": action,
                                "key": idempotency_key,
                            },
                        )

                        existing = result.mappings().first()

                    if not existing:
                        # Very small race window; retry the acquisition.
                        await asyncio.sleep(WAIT_INTERVAL)
                        continue

                    # Same idempotency key with different request data
                    # is always a conflict.
                    if existing["request_hash"] != request_hash:
                        raise HTTPException(
                            status_code=409,
                            detail=(
                                "Idempotency key reuse detected with "
                                "different request payload."
                            ),
                        )

                    status = existing["status"]

                    if status == "completed":
                        body = existing["response_body"]

                        if isinstance(body, str):
                            return json.loads(body)

                        return body

                    if status == "failed":
                        # Matching failed requests can be retried.
                        continue

                    # Existing request is currently being processed.
                    await asyncio.sleep(WAIT_INTERVAL)

                if not acquired:
                    raise HTTPException(
                        status_code=409,
                        detail="Concurrent request processing.",
                    )

            business_success = False
            response: Any = None

            try:
                response = await func(*args, **kwargs)
                business_success = True
                return response

            finally:
                # Persist the result after the business operation finishes.
                #
                # This remains intentionally separate from the business
                # transaction for now. Atomic transaction integration is
                # a separate hardening task.
                async with AsyncSessionLocal() as final_db:
                    try:
                        async with final_db.begin():
                            if business_success:
                                safe_response = jsonable_encoder(
                                    response
                                )

                                await final_db.execute(
                                    text(
                                        """
                                        UPDATE public.idempotency_keys
                                        SET
                                            status = 'completed',
                                            response_body =
                                                CAST(
                                                    :response_body
                                                    AS jsonb
                                                ),
                                            response_status_code = 200
                                        WHERE
                                            user_id =
                                                CAST(:user_id AS uuid)
                                            AND action = :action
                                            AND idempotency_key = :key
                                            AND request_hash = :hash
                                        """
                                    ),
                                    {
                                        "user_id": user_id,
                                        "action": action,
                                        "key": idempotency_key,
                                        "hash": request_hash,
                                        "response_body": json.dumps(
                                            safe_response,
                                            ensure_ascii=False,
                                        ),
                                    },
                                )
                            else:
                                await final_db.execute(
                                    text(
                                        """
                                        UPDATE public.idempotency_keys
                                        SET status = 'failed'
                                        WHERE
                                            user_id =
                                                CAST(:user_id AS uuid)
                                            AND action = :action
                                            AND idempotency_key = :key
                                            AND request_hash = :hash
                                        """
                                    ),
                                    {
                                        "user_id": user_id,
                                        "action": action,
                                        "key": idempotency_key,
                                        "hash": request_hash,
                                    },
                                )

                    except Exception as state_error:
                        logger.exception(
                            "Failed to update idempotency state: %s",
                            state_error,
                        )

        return wrapper

    return decorator