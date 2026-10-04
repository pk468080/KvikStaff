from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import (
    CurrentUser,
    get_customer,
)
from app.modules.bookings.repository import (
    BookingsRepository,
)
from app.modules.bookings.schemas import (
    CustomerBookingCancellationRequest,
    CustomerBookingOccurrenceCancellationRequest,
    CustomerBookingRescheduleRequest,
    InstantBookingCreateRequest,
    MultiOccurrenceBookingCreateRequest,
)
from app.modules.bookings.service import (
    BookingsService,
)

router = APIRouter()


def get_bookings_service(
    db=Depends(get_db),
) -> BookingsService:
    return BookingsService(
        BookingsRepository(db),
    )


@router.post("/instant")
async def create_instant_booking(
    request: InstantBookingCreateRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.create_instant_booking(
        request=request,
        customer_id=UUID(current_user.id),
    )


@router.post("/scheduled")
async def create_scheduled_booking(
    request: MultiOccurrenceBookingCreateRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.create_scheduled_booking(
        request=request,
        customer_id=UUID(current_user.id),
    )


@router.post("/recurring")
async def create_recurring_booking(
    request: MultiOccurrenceBookingCreateRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.create_recurring_booking(
        request=request,
        customer_id=UUID(current_user.id),
    )


@router.post("/{booking_id}/cancel")
async def cancel_booking(
    booking_id: UUID,
    request: CustomerBookingCancellationRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.cancel_booking(
        booking_id=booking_id,
        request=request,
        customer_id=UUID(current_user.id),
    )


@router.post("/{booking_id}/cancel-series")
async def cancel_booking_series(
    booking_id: UUID,
    request: CustomerBookingCancellationRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.cancel_booking_series(
        booking_id=booking_id,
        request=request,
        customer_id=UUID(current_user.id),
    )


@router.post("/occurrences/{occurrence_id}/cancel")
async def cancel_booking_occurrence(
    occurrence_id: UUID,
    request: CustomerBookingOccurrenceCancellationRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.cancel_booking_occurrence(
        occurrence_id=occurrence_id,
        request=request,
        customer_id=UUID(current_user.id),
    )


@router.get("/{booking_id}/refunds")
async def get_booking_refunds(
    booking_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> list[dict[str, Any]]:
    return await service.get_booking_refunds(
        booking_id=booking_id,
        customer_id=UUID(current_user.id),
    )


@router.post("/{booking_id}/reschedule")
async def reschedule_booking(
    booking_id: UUID,
    request: CustomerBookingRescheduleRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.reschedule_booking(
        booking_id=booking_id,
        request=request,
        customer_id=UUID(current_user.id),
    )