import json
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.idempotency.decorator import _hash_request


def get_request_hash(payload: Any) -> str:
    return _hash_request(payload)


def validate_idempotency_key(
    idempotency_key: str | None,
) -> str:
    if not idempotency_key:
        raise HTTPException(
            status_code=400,
            detail="Idempotency-Key header is missing.",
        )

    key = str(idempotency_key).strip()

    if not key:
        raise HTTPException(
            status_code=400,
            detail="Idempotency-Key header is missing.",
        )

    if len(key) > 255:
        raise HTTPException(
            status_code=400,
            detail=(
                "Idempotency key exceeds maximum length "
                "of 255 characters."
            ),
        )

    return key


async def claim_or_replay(
    db: AsyncSession,
    *,
    user_id: UUID,
    action: str,
    idempotency_key: str,
    request_hash: str,
) -> tuple[bool, Any | None]:
    """
    Claim an idempotency key inside the caller's existing transaction.

    Returns:
        (True, None) when this transaction owns the key.
        (False, response) when a completed request can be replayed.

    A successful booking and this row are committed by the same
    surrounding transaction.
    """
    key = validate_idempotency_key(
        idempotency_key
    )

    insert_result = await db.execute(
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
                :request_hash,
                'in_progress'
            )
            ON CONFLICT
            (
                user_id,
                action,
                idempotency_key
            )
            DO NOTHING
            RETURNING id
            """
        ),
        {
            "user_id": str(user_id),
            "action": action,
            "key": key,
            "request_hash": request_hash,
        },
    )

    inserted = insert_result.first()

    if inserted:
        return True, None

    existing_result = await db.execute(
        text(
            """
            SELECT
                status,
                request_hash,
                response_body
            FROM public.idempotency_keys
            WHERE
                user_id = CAST(:user_id AS uuid)
                AND action = :action
                AND idempotency_key = :key
            FOR UPDATE
            """
        ),
        {
            "user_id": str(user_id),
            "action": action,
            "key": key,
        },
    )

    existing = (
        existing_result.mappings().first()
    )

    if not existing:
        raise HTTPException(
            status_code=409,
            detail=(
                "Unable to acquire idempotency key."
            ),
        )

    if (
        existing["request_hash"]
        != request_hash
    ):
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
            return False, json.loads(body)

        return False, body

    if status == "failed":
        retry_result = await db.execute(
            text(
                """
                UPDATE public.idempotency_keys
                SET
                    status = 'in_progress',
                    response_body = NULL,
                    response_status_code = NULL
                WHERE
                    user_id = CAST(:user_id AS uuid)
                    AND action = :action
                    AND idempotency_key = :key
                    AND request_hash = :request_hash
                    AND status = 'failed'
                RETURNING id
                """
            ),
            {
                "user_id": str(user_id),
                "action": action,
                "key": key,
                "request_hash": request_hash,
            },
        )

        if retry_result.first():
            return True, None

    raise HTTPException(
        status_code=409,
        detail="Concurrent request processing.",
    )


async def complete_idempotency(
    db: AsyncSession,
    *,
    user_id: UUID,
    action: str,
    idempotency_key: str,
    request_hash: str,
    response: Any,
) -> None:
    key = validate_idempotency_key(
        idempotency_key
    )

    safe_response = jsonable_encoder(
        response
    )

    result = await db.execute(
        text(
            """
            UPDATE public.idempotency_keys
            SET
                status = 'completed',
                response_body =
                    CAST(:response_body AS jsonb),
                response_status_code = 200
            WHERE
                user_id = CAST(:user_id AS uuid)
                AND action = :action
                AND idempotency_key = :key
                AND request_hash = :request_hash
                AND status = 'in_progress'
            RETURNING id
            """
        ),
        {
            "user_id": str(user_id),
            "action": action,
            "key": key,
            "request_hash": request_hash,
            "response_body": json.dumps(
                safe_response,
                ensure_ascii=False,
            ),
        },
    )

    if not result.first():
        raise RuntimeError(
            "Unable to persist completed idempotency state."
        )