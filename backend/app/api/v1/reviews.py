from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.database import get_db
from app.core.security import CurrentUser, get_customer
from app.modules.reviews.repository import ReviewsRepository
from app.modules.reviews.schemas import (
    CustomerReviewResponse,
    CustomerReviewSubmissionRequest,
    CustomerReviewableOccurrenceResponse,
)
from app.modules.reviews.service import ReviewsService

router = APIRouter()


def get_reviews_service(db=Depends(get_db)) -> ReviewsService:
    return ReviewsService(ReviewsRepository(db))


@router.get(
    "/bookings/{booking_id}",
    response_model=CustomerReviewResponse | None,
)
async def get_customer_booking_review(
    booking_id: UUID,
    occurrence_id: UUID | None = Query(default=None),
    current_user: CurrentUser = Depends(get_customer),
    service: ReviewsService = Depends(get_reviews_service),
) -> dict[str, Any] | None:
    return await service.get_customer_booking_review(
        customer_id=UUID(current_user.id),
        booking_id=booking_id,
        occurrence_id=occurrence_id,
    )


@router.get(
    "/bookings/{booking_id}/occurrences",
    response_model=list[CustomerReviewableOccurrenceResponse],
)
async def get_reviewable_occurrences(
    booking_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: ReviewsService = Depends(get_reviews_service),
) -> list[dict[str, Any]]:
    return await service.get_reviewable_occurrences(
        customer_id=UUID(current_user.id),
        booking_id=booking_id,
    )


@router.post(
    "/bookings/{booking_id}",
    response_model=CustomerReviewResponse,
)
async def submit_customer_booking_review(
    booking_id: UUID,
    request: CustomerReviewSubmissionRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: ReviewsService = Depends(get_reviews_service),
) -> dict[str, Any]:
    return await service.submit_customer_booking_review(
        customer_id=UUID(current_user.id),
        booking_id=booking_id,
        occurrence_id=request.occurrence_id,
        rating=request.rating,
        comment=request.comment,
    )
