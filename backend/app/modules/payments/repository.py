from datetime import date, datetime, time, timezone
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
                        CAST(:selected_weekdays AS smallint[]),
                        CAST(:off_dates AS date[]),
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
                    "schedule_start_date":
                        schedule_start_date,
                    "schedule_end_date":
                        schedule_end_date,
                    "daily_start_time":
                        daily_start_time,
                    "daily_end_time":
                        daily_end_time,
                    "selected_weekdays":
                        selected_weekdays,
                    "off_dates":
                        off_dates,
                    "notes": notes,
                },
            )

            value = result.scalar_one()

        return self._to_dict(value)

    async def cancel_customer_booking(
        self,
        customer_id: UUID,
        booking_id: UUID,
        reason: str,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_customer_auth_context(
                customer_id
            )

            result = await self.db.execute(
                text(
                    """
                    SELECT public.cancel_customer_booking(
                        CAST(:booking_id AS uuid),
                        :reason
                    ) AS result
                    """
                ),
                {
                    "booking_id": str(
                        booking_id
                    ),
                    "reason": reason,
                },
            )

            value = result.scalar_one()

        return self._to_dict(value)

    async def cancel_customer_booking_series(
        self,
        customer_id: UUID,
        booking_id: UUID,
        reason: str,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_customer_auth_context(
                customer_id
            )

            result = await self.db.execute(
                text(
                    """
                    SELECT public.cancel_customer_booking_series(
                        CAST(:booking_id AS uuid),
                        :reason
                    ) AS result
                    """
                ),
                {
                    "booking_id": str(
                        booking_id
                    ),
                    "reason": reason,
                },
            )

            value = result.scalar_one()

        return self._to_dict(value)

    async def cancel_customer_booking_occurrence(
        self,
        customer_id: UUID,
        occurrence_id: UUID,
        reason: str,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_customer_auth_context(
                customer_id
            )

            result = await self.db.execute(
                text(
                    """
                    SELECT public.cancel_customer_booking_occurrence(
                        CAST(:occurrence_id AS uuid),
                        :reason
                    ) AS result
                    """
                ),
                {
                    "occurrence_id": str(
                        occurrence_id
                    ),
                    "reason": reason,
                },
            )

            value = result.scalar_one()

        return self._to_dict(value)

    async def get_customer_booking_refunds(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> list[dict[str, Any]]:
        async with self.db.begin():
            await self._set_customer_auth_context(
                customer_id
            )

            result = await self.db.execute(
                text(
                    """
                    SELECT private.get_customer_booking_refunds(
                        CAST(:booking_id AS uuid)
                    ) AS result
                    """
                ),
                {
                    "booking_id": str(
                        booking_id
                    ),
                },
            )

            value = result.scalar_one()

        return self._to_list(value)

    async def reschedule_customer_booking(
        self,
        customer_id: UUID,
        booking_id: UUID,
        new_start: datetime,
        new_end: datetime,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self._set_customer_auth_context(
                customer_id
            )

            result = await self.db.execute(
                text(
                    """
                    SELECT public.reschedule_customer_booking(
                        CAST(:booking_id AS uuid),
                        CAST(:new_start AS timestamptz),
                        CAST(:new_end AS timestamptz)
                    ) AS result
                    """
                ),
                {
                    "booking_id": str(
                        booking_id
                    ),
                    "new_start": new_start,
                    "new_end": new_end,
                },
            )

            value = result.scalar_one()

        return self._to_dict(value)

    async def finalize_razorpay_payment(
        self,
        payment_id: UUID,
        provider_payment_id: str,
        paid_at: datetime | None,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self.db.execute(
                text(
                    """
                    SELECT set_config(
                        'request.jwt.claim.role',
                        'service_role',
                        true
                    )
                    """
                )
            )

            result = await self.db.execute(
                text(
                    """
                    SELECT public.finalize_razorpay_payment(
                        CAST(:payment_id AS uuid),
                        :provider_payment_id,
                        CAST(:paid_at AS timestamptz)
                    ) AS result
                    """
                ),
                {
                    "payment_id": str(
                        payment_id
                    ),
                    "provider_payment_id":
                        provider_payment_id,
                    "paid_at":
                        paid_at
                        or datetime.now(
                            timezone.utc
                        ),
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

    @staticmethod
    def _to_list(
        value: Any,
    ) -> list[dict[str, Any]]:
        if isinstance(value, list):
            return [
                item
                for item in value
                if isinstance(item, dict)
            ]

        if isinstance(value, str):
            import json

            parsed = json.loads(value)

            if isinstance(parsed, list):
                return [
                    item
                    for item in parsed
                    if isinstance(item, dict)
                ]

        raise ValueError(
            "Booking refund function returned an invalid result."
        )