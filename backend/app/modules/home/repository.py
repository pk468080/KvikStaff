from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class HomeRepository:
    def __init__(
        self,
        db: AsyncSession,
    ) -> None:
        self.db = db

    async def get_customer_favourite_service_ids(
        self,
        customer_id: UUID,
    ) -> list[UUID]:
        result = await self.db.execute(
            text(
                """
                SELECT service_id
                FROM public.customer_favourite_services
                WHERE customer_id = CAST(:customer_id AS uuid)
                ORDER BY created_at ASC, service_id ASC
                """
            ),
            {
                "customer_id": str(customer_id),
            },
        )

        rows = result.mappings().all()

        return [
            row["service_id"]
            for row in rows
        ]

    async def add_customer_favourite_service(
        self,
        customer_id: UUID,
        service_id: UUID,
    ) -> None:
        async with self.db.begin():
            await self.db.execute(
                text(
                    """
                    INSERT INTO public.customer_favourite_services (
                        customer_id,
                        service_id
                    )
                    VALUES (
                        CAST(:customer_id AS uuid),
                        CAST(:service_id AS uuid)
                    )
                    ON CONFLICT (
                        customer_id,
                        service_id
                    )
                    DO NOTHING
                    """
                ),
                {
                    "customer_id": str(customer_id),
                    "service_id": str(service_id),
                },
            )

    async def remove_customer_favourite_service(
        self,
        customer_id: UUID,
        service_id: UUID,
    ) -> None:
        async with self.db.begin():
            await self.db.execute(
                text(
                    """
                    DELETE FROM public.customer_favourite_services
                    WHERE customer_id = CAST(:customer_id AS uuid)
                      AND service_id = CAST(:service_id AS uuid)
                    """
                ),
                {
                    "customer_id": str(customer_id),
                    "service_id": str(service_id),
                },
            )

    async def get_active_home_promotions(
        self,
    ) -> list[dict[str, Any]]:
        result = await self.db.execute(
            text(
                """
                SELECT
                    id,
                    title,
                    subtitle,
                    cta_text,
                    service_id,
                    image_url,
                    sort_order,
                    starts_at,
                    ends_at
                FROM public.home_promotions
                WHERE is_active = true
                ORDER BY sort_order ASC, id ASC
                """
            )
        )

        return [
            dict(row)
            for row in result.mappings().all()
        ]

    async def get_customer_rebook_rows(
        self,
        customer_id: UUID,
    ) -> list[dict[str, Any]]:
        result = await self.db.execute(
            text(
                """
                SELECT
                    service_id,
                    created_at,
                    CAST(
                        duration_value
                        AS double precision
                    ) AS duration_value,
                    duration_unit,
                    scheduled_start
                FROM public.bookings
                WHERE customer_id = CAST(:customer_id AS uuid)
                  AND status = 'completed'
                  AND service_id IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 20
                """
            ),
            {
                "customer_id": str(customer_id),
            },
        )

        return [
            dict(row)
            for row in result.mappings().all()
        ]