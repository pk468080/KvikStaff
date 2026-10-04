from datetime import date, datetime, time
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class BookingsRepository:
    def __init__(
        self,
        db: AsyncSession,
    ) -> None:
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

    async def create_hourly_booking(
        self,
        customer_id: UUID,
        service_variant_id: UUID,
        address_id: UUID,
        booking_type: str,
        scheduled_start: datetime,
        scheduled_end: datetime,
        notes: str | None,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_customer_auth_context(
                customer_id
            )

            result = await self.db.execute(
                text(
                    """
                    SELECT public.create_customer_hourly_booking(
                        CAST(:service_variant_id AS uuid),
                        CAST(:address_id AS uuid),
                        CAST(
                            :booking_type
                            AS public.booking_fulfillment_type
                        ),
                        CAST(:scheduled_start AS timestamptz),
                        CAST(:scheduled_end AS timestamptz),
                        :notes
                    ) AS result
                    """
                ),
                {
                    "service_variant_id": str(
                        service_variant_id
                    ),
                    "address_id": str(
                        address_id
                    ),
                    "booking_type": booking_type,
                    "scheduled_start": scheduled_start,
                    "scheduled_end": scheduled_end,
                    "notes": notes,
                },
            )

            value = result.scalar_one()

        return self._to_dict(value)

    async def create_multi_occurrence_booking(
        self,
        customer_id: UUID,
        service_variant_id: UUID,
        address_id: UUID,
        schedule_start_date: date,
        schedule_end_date: date,
        daily_start_time: time,
        daily_end_time: time,
        selected_weekdays: list[int],
        off_dates: list[date],
        notes: str | None,
        booking_type: str,
    ) -> dict[str, Any]:
        selected_weekdays_literal = (
            "{"
            + ",".join(
                str(day)
                for day in selected_weekdays
            )
            + "}"
        )

        off_dates_literal = (
            "{"
            + ",".join(
                value.isoformat()
                for value in off_dates
            )
            + "}"
        )

        async with self.db.begin():
            await self._set_customer_auth_context(
                customer_id
            )

            if booking_type == "scheduled":
                function_name = (
                    "create_customer_scheduled_booking"
                )
            elif booking_type == "recurring":
                function_name = (
                    "create_customer_recurring_booking"
                )
            else:
                raise ValueError(
                    "Unsupported multi-occurrence booking type."
                )

            result = await self.db.execute(
                text(
                    f"""
                    SELECT public.{function_name}(
                        CAST(:service_variant_id AS uuid),
                        CAST(:address_id AS uuid),
                        CAST(:schedule_start_date AS date),
                        CAST(:schedule_end_date AS date),
                        CAST(:daily_start_time AS time),
                        CAST(:daily_end_time AS time),
                        CAST(
                            :selected_weekdays
                            AS smallint[]
                        ),
                        CAST(
                            :off_dates
                            AS date[]
                        ),
                        :notes
                    ) AS result
                    """
                ),
                {
                    "service_variant_id": str(
                        service_variant_id
                    ),
                    "address_id": str(
                        address_id
                    ),
                    "schedule_start_date": (
                        schedule_start_date.isoformat()
                    ),
                    "schedule_end_date": (
                        schedule_end_date.isoformat()
                    ),
                    "daily_start_time": (
                        daily_start_time.isoformat()
                    ),
                    "daily_end_time": (
                        daily_end_time.isoformat()
                    ),
                    "selected_weekdays": (
                        selected_weekdays_literal
                    ),
                    "off_dates": (
                        off_dates_literal
                    ),
                    "notes": notes,
                },
            )

            value = result.scalar_one()

        return self._to_dict(value)

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

        raise ValueError(
            "Booking function returned an invalid result."
        )