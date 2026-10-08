from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class PaymentsRepository:
    def __init__(
        self,
        db: AsyncSession,
    ) -> None:
        self.db = db

    async def get_customer_booking(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> dict[str, Any] | None:
        result = await self.db.execute(
            text(
                """
                SELECT
                    id,
                    customer_id,
                    status::text AS status,
                    fulfillment_type::text
                        AS fulfillment_type,
                    service_variant_id,
                    total_amount,
                    pricing_snapshot,
                    scheduled_start,
                    schedule_start_date,
                    schedule_end_date,
                    selected_weekdays,
                    off_dates,
                    total_working_hours
                FROM public.bookings
                WHERE id =
                    CAST(:booking_id AS uuid)
                  AND customer_id =
                    CAST(:customer_id AS uuid)
                LIMIT 1
                """
            ),
            {
                "booking_id": str(booking_id),
                "customer_id": str(customer_id),
            },
        )

        row = result.mappings().first()

        if row is None:
            return None

        return dict(row)

    async def mark_payment_failed(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> str | None:
        result = await self.db.execute(
            text(
                """
                UPDATE public.bookings
                SET
                    status = 'payment_failed',
                    updated_at = now()
                WHERE id =
                    CAST(:booking_id AS uuid)
                  AND customer_id =
                    CAST(:customer_id AS uuid)
                  AND status = 'pending_payment'
                RETURNING status::text AS status
                """
            ),
            {
                "booking_id": str(booking_id),
                "customer_id": str(customer_id),
            },
        )

        await self.db.commit()

        row = result.mappings().first()

        if row is not None:
            return str(row["status"])

        booking = await self.get_customer_booking(
            customer_id=customer_id,
            booking_id=booking_id,
        )

        if booking is None:
            return None

        return str(
            booking.get("status")
        )

    async def reset_payment_failed(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> bool:
        result = await self.db.execute(
            text(
                """
                UPDATE public.bookings
                SET
                    status = 'pending_payment',
                    updated_at = now()
                WHERE id =
                    CAST(:booking_id AS uuid)
                  AND customer_id =
                    CAST(:customer_id AS uuid)
                  AND status = 'payment_failed'
                """
            ),
            {
                "booking_id": str(booking_id),
                "customer_id": str(customer_id),
            },
        )

        await self.db.commit()

        return result.rowcount > 0

    async def expire_payment_booking(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> bool:
        result = await self.db.execute(
            text(
                """
                UPDATE public.bookings
                SET
                    status = 'expired',
                    updated_at = now()
                WHERE id =
                    CAST(:booking_id AS uuid)
                  AND customer_id =
                    CAST(:customer_id AS uuid)
                  AND status IN (
                      'pending_payment',
                      'payment_failed'
                  )
                """
            ),
            {
                "booking_id": str(booking_id),
                "customer_id": str(customer_id),
            },
        )

        await self.db.commit()

        return result.rowcount > 0

    async def get_latest_payment(
        self,
        booking_id: UUID,
    ) -> dict[str, Any] | None:
        result = await self.db.execute(
            text(
                """
                SELECT
                    id,
                    booking_id,
                    provider,
                    provider_order_id,
                    provider_payment_id,
                    amount,
                    currency,
                    status::text AS status,
                    paid_at,
                    created_at,
                    updated_at
                FROM public.payments
                WHERE booking_id =
                    CAST(:booking_id AS uuid)
                  AND provider = 'razorpay'
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {
                "booking_id": str(booking_id),
            },
        )

        row = result.mappings().first()

        if row is None:
            return None

        return dict(row)

    async def get_payment_by_order(
        self,
        customer_id: UUID,
        booking_id: UUID,
        provider_order_id: str,
    ) -> dict[str, Any] | None:
        result = await self.db.execute(
            text(
                """
                SELECT
                    p.id,
                    p.booking_id,
                    p.provider,
                    p.provider_order_id,
                    p.provider_payment_id,
                    p.amount,
                    p.currency,
                    p.status::text AS status,
                    p.paid_at,
                    p.created_at,
                    p.updated_at
                FROM public.payments p
                INNER JOIN public.bookings b
                    ON b.id = p.booking_id
                WHERE p.booking_id =
                    CAST(:booking_id AS uuid)
                  AND b.customer_id =
                    CAST(:customer_id AS uuid)
                  AND p.provider = 'razorpay'
                  AND p.provider_order_id =
                    :provider_order_id
                LIMIT 1
                """
            ),
            {
                "booking_id": str(booking_id),
                "customer_id": str(customer_id),
                "provider_order_id":
                    provider_order_id,
            },
        )

        row = result.mappings().first()

        if row is None:
            return None

        return dict(row)

    async def insert_payment_if_missing(
        self,
        booking_id: UUID,
        provider_order_id: str,
        amount: Decimal,
        currency: str,
    ) -> dict[str, Any]:
        result = await self.db.execute(
            text(
                """
                INSERT INTO public.payments (
                    booking_id,
                    provider,
                    provider_order_id,
                    amount,
                    currency,
                    status
                )
                VALUES (
                    CAST(:booking_id AS uuid),
                    'razorpay',
                    :provider_order_id,
                    :amount,
                    :currency,
                    'pending'
                )
                ON CONFLICT (booking_id)
                DO NOTHING
                RETURNING
                    id,
                    booking_id,
                    provider,
                    provider_order_id,
                    provider_payment_id,
                    amount,
                    currency,
                    status::text AS status,
                    paid_at,
                    created_at,
                    updated_at
                """
            ),
            {
                "booking_id": str(
                    booking_id
                ),
                "provider_order_id":
                    provider_order_id,
                "amount": amount,
                "currency": currency,
            },
        )

        await self.db.commit()

        row = result.mappings().first()

        if row is not None:
            return dict(row)

        existing = await self.get_latest_payment(
            booking_id
        )

        if existing is None:
            raise ValueError(
                "Payment record could not be created."
            )

        return existing

    async def finalize_razorpay_payment(
        self,
        payment_id: UUID,
        provider_payment_id: str,
        paid_at: datetime | None,
    ) -> dict[str, Any]:
        # This RPC requires service_role.
        # Set the role and execute the RPC in the
        # same transaction.
        await self.db.rollback()

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
            "Payment function returned an invalid result."
        )