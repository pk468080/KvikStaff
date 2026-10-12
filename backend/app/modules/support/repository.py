from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class SupportRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_customer_support_ticket(
        self,
        customer_id: UUID,
        category: str,
        subject: str,
        description: str,
        booking_id: UUID | None,
        payment_id: UUID | None,
        worker_id: UUID | None,
        refund_request_id: UUID | None,
        payment_refund_id: UUID | None,
    ) -> dict[str, Any]:
        async with self.db.begin():
            await self.db.execute(
                text("""
                    SELECT set_config(
                        'request.jwt.claim.sub',
                        CAST(:customer_id AS text),
                        true
                    )
                """),
                {"customer_id": str(customer_id)},
            )

            result = await self.db.execute(
                text("""
                    SELECT *
                    FROM public.create_support_ticket(
                        :category,
                        :subject,
                        :description,
                        CAST(:booking_id AS uuid),
                        CAST(:payment_id AS uuid),
                        CAST(:worker_id AS uuid),
                        CAST(:refund_request_id AS uuid),
                        CAST(:payment_refund_id AS uuid)
                    )
                """),
                {
                    "category": category,
                    "subject": subject,
                    "description": description,
                    "booking_id": str(booking_id) if booking_id else None,
                    "payment_id": str(payment_id) if payment_id else None,
                    "worker_id": str(worker_id) if worker_id else None,
                    "refund_request_id": str(refund_request_id) if refund_request_id else None,
                    "payment_refund_id": str(payment_refund_id) if payment_refund_id else None,
                },
            )

            row = result.mappings().first()
            if row is None:
                raise ValueError("The support request was not created.")
            return dict(row)

    async def get_customer_support_tickets(
        self,
        customer_id: UUID,
    ) -> list[dict[str, Any]]:
        result = await self.db.execute(
            text("""
                SELECT
                    id,
                    category,
                    subject,
                    description,
                    status,
                    booking_id,
                    created_at,
                    updated_at,
                    resolved_at
                FROM public.support_tickets
                WHERE user_id = :customer_id
                ORDER BY created_at DESC
            """),
            {"customer_id": str(customer_id)},
        )

        return [dict(row) for row in result.mappings().all()]
