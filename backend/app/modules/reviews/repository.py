from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


class ReviewsRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_customer_booking_review(
        self,
        customer_id: UUID,
        booking_id: UUID,
        occurrence_id: UUID | None,
    ) -> dict[str, Any] | None:
        async with self.db.begin():
            result = await self.db.execute(
                text(
                    """
                    SELECT
                        r.id,
                        r.booking_id,
                        r.occurrence_id,
                        r.customer_id,
                        r.worker_id,
                        r.rating,
                        r.comment,
                        r.created_at
                    FROM public.reviews AS r
                    WHERE r.customer_id = :customer_id
                      AND r.booking_id = :booking_id
                      AND (
                          (:occurrence_id IS NULL AND r.occurrence_id IS NULL)
                          OR r.occurrence_id = :occurrence_id
                      )
                    LIMIT 1
                    """
                ),
                {
                    "customer_id": str(customer_id),
                    "booking_id": str(booking_id),
                    "occurrence_id": (
                        str(occurrence_id)
                        if occurrence_id is not None
                        else None
                    ),
                },
            )
            row = result.mappings().first()
            return dict(row) if row is not None else None

    async def get_customer_completed_occurrences(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> list[dict[str, Any]]:
        async with self.db.begin():
            result = await self.db.execute(
                text(
                    """
                    SELECT
                        o.id,
                        o.worker_id,
                        o.occurrence_index,
                        o.status::text AS status
                    FROM public.booking_schedule_occurrences AS o
                    INNER JOIN public.bookings AS b
                        ON b.id = o.booking_id
                    WHERE b.customer_id = :customer_id
                      AND o.booking_id = :booking_id
                      AND o.status = 'completed'
                    ORDER BY o.occurrence_index ASC
                    """
                ),
                {
                    "customer_id": str(customer_id),
                    "booking_id": str(booking_id),
                },
            )
            return [dict(row) for row in result.mappings().all()]

    async def submit_customer_booking_review(
        self,
        customer_id: UUID,
        booking_id: UUID,
        occurrence_id: UUID | None,
        rating: int,
        comment: str | None,
    ) -> dict[str, Any]:
        async with self.db.begin():
            booking_result = await self.db.execute(
                text(
                    """
                    SELECT
                        id,
                        customer_id,
                        status::text AS status,
                        worker_id,
                        fulfillment_type::text AS fulfillment_type
                    FROM public.bookings
                    WHERE id = :booking_id
                      AND customer_id = :customer_id
                    FOR UPDATE
                    """
                ),
                {
                    "booking_id": str(booking_id),
                    "customer_id": str(customer_id),
                },
            )
            booking = booking_result.mappings().first()

            if booking is None:
                raise ValueError("Booking not found.")

            if booking["status"] != "completed":
                raise ValueError(
                    "This booking is not eligible for a review."
                )

            fulfillment_type = str(
                booking["fulfillment_type"] or ""
            )
            resolved_occurrence_id = occurrence_id
            worker_id = booking["worker_id"]

            if fulfillment_type == "recurring":
                if resolved_occurrence_id is None:
                    occurrence_result = await self.db.execute(
                        text(
                            """
                            SELECT
                                id,
                                worker_id,
                                status::text AS status,
                                occurrence_index
                            FROM public.booking_schedule_occurrences
                            WHERE booking_id = :booking_id
                              AND status = 'completed'
                            ORDER BY occurrence_index ASC
                            LIMIT 1
                            FOR UPDATE
                            """
                        ),
                        {"booking_id": str(booking_id)},
                    )
                    occurrence = occurrence_result.mappings().first()
                else:
                    occurrence_result = await self.db.execute(
                        text(
                            """
                            SELECT
                                id,
                                worker_id,
                                status::text AS status,
                                occurrence_index
                            FROM public.booking_schedule_occurrences
                            WHERE id = :occurrence_id
                              AND booking_id = :booking_id
                            LIMIT 1
                            FOR UPDATE
                            """
                        ),
                        {
                            "occurrence_id": str(resolved_occurrence_id),
                            "booking_id": str(booking_id),
                        },
                    )
                    occurrence = occurrence_result.mappings().first()

                if occurrence is None:
                    raise ValueError(
                        "This booking is not eligible for a review."
                    )

                if occurrence["status"] != "completed":
                    raise ValueError(
                        "This booking is not eligible for a review."
                    )

                resolved_occurrence_id = occurrence["id"]
                worker_id = occurrence["worker_id"] or worker_id
            elif resolved_occurrence_id is not None:
                raise ValueError(
                    "Occurrence ID is only valid for recurring bookings."
                )

            if worker_id is None:
                raise ValueError(
                    "This booking does not have an assigned worker to review."
                )

            existing_result = await self.db.execute(
                text(
                    """
                    SELECT id
                    FROM public.reviews
                    WHERE customer_id = :customer_id
                      AND booking_id = :booking_id
                      AND (
                          (:occurrence_id IS NULL AND occurrence_id IS NULL)
                          OR occurrence_id = :occurrence_id
                      )
                    LIMIT 1
                    """
                ),
                {
                    "customer_id": str(customer_id),
                    "booking_id": str(booking_id),
                    "occurrence_id": (
                        str(resolved_occurrence_id)
                        if resolved_occurrence_id is not None
                        else None
                    ),
                },
            )
            if existing_result.first() is not None:
                raise ValueError(
                    "You have already reviewed this booking."
                )

            try:
                insert_result = await self.db.execute(
                    text(
                        """
                        INSERT INTO public.reviews (
                            booking_id,
                            occurrence_id,
                            customer_id,
                            worker_id,
                            rating,
                            comment
                        )
                        VALUES (
                            :booking_id,
                            :occurrence_id,
                            :customer_id,
                            :worker_id,
                            :rating,
                            :comment
                        )
                        RETURNING
                            id,
                            booking_id,
                            occurrence_id,
                            customer_id,
                            worker_id,
                            rating,
                            comment,
                            created_at
                        """
                    ),
                    {
                        "booking_id": str(booking_id),
                        "occurrence_id": (
                            str(resolved_occurrence_id)
                            if resolved_occurrence_id is not None
                            else None
                        ),
                        "customer_id": str(customer_id),
                        "worker_id": str(worker_id),
                        "rating": rating,
                        "comment": comment,
                    },
                )
            except IntegrityError as exc:
                raise ValueError(
                    "You have already reviewed this booking."
                ) from exc

            row = insert_result.mappings().one()
            return dict(row)
