from typing import Any
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import AppError
from app.modules.reviews.repository import ReviewsRepository


class ReviewsService:
    def __init__(self, repository: ReviewsRepository) -> None:
        self.repository = repository

    async def get_customer_booking_review(
        self,
        customer_id: UUID,
        booking_id: UUID,
        occurrence_id: UUID | None,
    ) -> dict[str, Any] | None:
        try:
            return await self.repository.get_customer_booking_review(
                customer_id=customer_id,
                booking_id=booking_id,
                occurrence_id=occurrence_id,
            )
        except SQLAlchemyError as exc:
            raise AppError(
                "REVIEW_LOAD_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    async def get_reviewable_occurrences(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> list[dict[str, Any]]:
        try:
            return await self.repository.get_customer_completed_occurrences(
                customer_id=customer_id,
                booking_id=booking_id,
            )
        except SQLAlchemyError as exc:
            raise AppError(
                "REVIEW_OCCURRENCES_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    async def submit_customer_booking_review(
        self,
        customer_id: UUID,
        booking_id: UUID,
        occurrence_id: UUID | None,
        rating: int,
        comment: str | None,
    ) -> dict[str, Any]:
        try:
            return await self.repository.submit_customer_booking_review(
                customer_id=customer_id,
                booking_id=booking_id,
                occurrence_id=occurrence_id,
                rating=rating,
                comment=comment,
            )
        except ValueError as exc:
            raise AppError(
                "REVIEW_SUBMISSION_FAILED",
                str(exc),
                400,
            ) from exc
        except SQLAlchemyError as exc:
            raise AppError(
                "REVIEW_SUBMISSION_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    @staticmethod
    def _database_message(exc: SQLAlchemyError) -> str:
        original = getattr(exc, "orig", None)
        message = str(original or exc).strip()
        return message or "Unable to complete the review operation."
