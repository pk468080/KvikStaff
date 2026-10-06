from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class AccountDeletionRepository:
    def __init__(
        self,
        db: AsyncSession,
    ) -> None:
        self.db = db

    async def get_latest_request(
        self,
        customer_id: UUID,
    ) -> dict[str, Any] | None:
        result = await self.db.execute(
            text(
                """
                SELECT
                    id,
                    reason,
                    status,
                    requested_at,
                    reviewed_at
                FROM public.account_deletion_requests
                WHERE user_id = CAST(:customer_id AS uuid)
                ORDER BY
                    requested_at DESC,
                    id DESC
                LIMIT 1
                """
            ),
            {
                "customer_id": str(customer_id),
            },
        )

        row = result.mappings().first()

        return (
            dict(row)
            if row is not None
            else None
        )

    async def request_account_deletion(
        self,
        customer_id: UUID,
        reason: str | None,
    ) -> dict[str, Any]:
        async with self.db.begin():
            inserted = await self.db.execute(
                text(
                    """
                    INSERT INTO public.account_deletion_requests (
                        user_id,
                        reason,
                        status
                    )
                    VALUES (
                        CAST(:customer_id AS uuid),
                        :reason,
                        'pending'
                    )
                    ON CONFLICT (user_id)
                    WHERE status = 'pending'
                    DO NOTHING
                    RETURNING
                        id,
                        reason,
                        status,
                        requested_at,
                        reviewed_at
                    """
                ),
                {
                    "customer_id": str(customer_id),
                    "reason": reason,
                },
            )

            row = inserted.mappings().first()

            if row is not None:
                return dict(row)

            existing = await self.db.execute(
                text(
                    """
                    SELECT
                        id,
                        reason,
                        status,
                        requested_at,
                        reviewed_at
                    FROM public.account_deletion_requests
                    WHERE user_id = CAST(:customer_id AS uuid)
                      AND status = 'pending'
                    ORDER BY
                        requested_at DESC,
                        id DESC
                    LIMIT 1
                    """
                ),
                {
                    "customer_id": str(customer_id),
                },
            )

            existing_row = (
                existing.mappings().first()
            )

            if existing_row is None:
                raise ValueError(
                    "Your deletion request could not be submitted."
                )

            return dict(existing_row)