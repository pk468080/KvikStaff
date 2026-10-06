from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class NotificationsRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def _set_customer_auth_context(
        self,
        customer_id: UUID,
    ) -> None:
        await self.db.execute(
            text(
                """
                SELECT set_config(
                    'request.jwt.claim.sub',
                    CAST(:customer_id AS text),
                    true
                )
                """
            ),
            {
                "customer_id": str(customer_id),
            },
        )

    async def get_customer_notifications(
        self,
        customer_id: UUID,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        result = await self.db.execute(
            text(
                """
                SELECT
                    id,
                    booking_id,
                    title,
                    message,
                    notification_type,
                    is_read,
                    created_at
                FROM public.notifications
                WHERE user_id = CAST(:customer_id AS uuid)
                ORDER BY created_at DESC, id DESC
                LIMIT :limit
                """
            ),
            {
                "customer_id": str(customer_id),
                "limit": limit,
            },
        )

        return [
            dict(row)
            for row in result.mappings().all()
        ]

    async def mark_customer_notification_read(
        self,
        customer_id: UUID,
        notification_id: UUID,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_customer_auth_context(
                customer_id,
            )

            result = await self.db.execute(
                text(
                    """
                    SELECT public.mark_notification_read(
                        CAST(:notification_id AS uuid)
                    ) AS result
                    """
                ),
                {
                    "notification_id": str(
                        notification_id
                    ),
                },
            )

            value = result.scalar_one()

        return self._to_dict(value)

    async def get_unread_customer_notification_count(
        self,
        customer_id: UUID,
    ) -> int:
        result = await self.db.execute(
            text(
                """
                SELECT count(*)::integer
                FROM public.notifications
                WHERE user_id = CAST(:customer_id AS uuid)
                  AND is_read = false
                """
            ),
            {
                "customer_id": str(customer_id),
            },
        )

        return int(
            result.scalar_one() or 0
        )

    async def register_customer_push_token(
        self,
        customer_id: UUID,
        token: str,
        platform: str | None,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_customer_auth_context(
                customer_id,
            )

            if platform is None:
                query = text(
                    """
                    SELECT public.register_customer_push_token(
                        p_token => :token
                    ) AS result
                    """
                )

                params = {
                    "token": token,
                }
            else:
                query = text(
                    """
                    SELECT public.register_customer_push_token(
                        p_token => :token,
                        p_platform => :platform
                    ) AS result
                    """
                )

                params = {
                    "token": token,
                    "platform": platform,
                }

            result = await self.db.execute(
                query,
                params,
            )

            value = result.scalar_one()

        return self._to_dict(value)

    async def deactivate_customer_push_tokens(
        self,
        customer_id: UUID,
    ) -> None:
        async with self.db.begin():
            await self._set_customer_auth_context(
                customer_id,
            )

            await self.db.execute(
                text(
                    """
                    UPDATE public.push_tokens
                    SET
                        is_active = false,
                        updated_at = now()
                    WHERE user_id = CAST(:customer_id AS uuid)
                      AND is_active = true
                    """
                ),
                {
                    "customer_id": str(
                        customer_id
                    ),
                },
            )

    @staticmethod
    def _to_dict(
        value: Any,
    ) -> dict[str, Any]:
        if isinstance(value, dict):
            return value

        if isinstance(value, str):
            import json

            parsed = json.loads(value)

            if isinstance(parsed, dict):
                return parsed

        if hasattr(value, "_mapping"):
            return dict(
                value._mapping
            )

        raise ValueError(
            "Notification function returned an invalid result."
        )