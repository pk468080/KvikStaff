from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class InvoicesRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_customer_invoice(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> dict[str, Any] | None:
        async with self.db.begin():
            booking_result = await self.db.execute(
                text(
                    '''
                    SELECT
                        b.id,
                        b.customer_id,
                        b.status::text AS status,
                        b.fulfillment_type::text AS fulfillment_type,
                        b.scheduled_start,
                        b.scheduled_end,
                        CAST(
                            b.total_working_hours
                            AS double precision
                        ) AS total_working_hours,
                        CAST(
                            b.base_amount
                            AS double precision
                        ) AS base_amount,
                        CAST(
                            b.discount_amount
                            AS double precision
                        ) AS discount_amount,
                        CAST(
                            b.platform_fee
                            AS double precision
                        ) AS platform_fee,
                        CAST(
                            b.tax_amount
                            AS double precision
                        ) AS tax_amount,
                        CAST(
                            b.total_amount
                            AS double precision
                        ) AS total_amount,
                        b.completed_at,
                        b.created_at,
                        s.name AS service_name
                    FROM public.bookings AS b
                    LEFT JOIN public.service_variants AS sv
                        ON sv.id = b.service_variant_id
                    LEFT JOIN public.services AS s
                        ON s.id = sv.service_id
                    WHERE b.id = :booking_id
                      AND b.customer_id = :customer_id
                    LIMIT 1
                    '''
                ),
                {
                    "booking_id": str(booking_id),
                    "customer_id": str(customer_id),
                },
            )

            booking = booking_result.mappings().first()

            if booking is None:
                return None

            payment_result = await self.db.execute(
                text(
                    '''
                    SELECT
                        p.id,
                        p.booking_id,
                        CAST(
                            p.amount
                            AS double precision
                        ) AS amount,
                        p.currency,
                        p.status::text AS status,
                        p.provider,
                        p.provider_order_id,
                        p.provider_payment_id,
                        p.paid_at,
                        p.created_at
                    FROM public.payments AS p
                    WHERE p.booking_id = :booking_id
                    ORDER BY
                        CASE
                            WHEN p.status = 'paid'::public.payment_status
                            THEN 0
                            ELSE 1
                        END,
                        p.created_at DESC,
                        p.id DESC
                    LIMIT 1
                    '''
                ),
                {
                    "booking_id": str(booking_id),
                },
            )

            payment = payment_result.mappings().first()

            if payment is None:
                return {
                    "booking": dict(booking),
                    "payment": None,
                }

            return {
                "booking": dict(booking),
                "payment": dict(payment),
            }
