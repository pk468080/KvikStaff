from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header

from app.core.booking_otp_rate_limit import (
    enforce_booking_otp_rate_limit,
)
from app.core.database import get_db
from app.core.security import CurrentUser, get_customer
from app.modules.bookings.repository import BookingsRepository
from app.modules.bookings.schemas import (
    CustomerBookingCancellationRequest,
    CustomerBookingOccurrenceCancellationRequest,
    CustomerBookingOtpRequest,
    CustomerBookingRescheduleRequest,
    InstantBookingCreateRequest,
    InstantBookingPriceRequest,
    MultiOccurrenceBookingCreateRequest,
    MultiOccurrenceBookingPriceRequest,
)
from app.modules.bookings.service import BookingsService


router = APIRouter()


def get_bookings_service(
    db=Depends(get_db),
) -> BookingsService:
    return BookingsService(
        BookingsRepository(db),
    )


@router.get("")
async def list_customer_bookings(
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> list[dict[str, Any]]:
    return await service.list_customer_bookings(
        customer_id=UUID(current_user.id),
    )


@router.post("/pricing/instant")
async def calculate_instant_booking_price(
    request: InstantBookingPriceRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.calculate_customer_instant_booking_price(
        customer_id=UUID(current_user.id),
        service_variant_id=request.service_variant_id,
        total_working_hours=request.total_working_hours,
    )


@router.post("/pricing/multi")
async def calculate_multi_occurrence_booking_price(
    request: MultiOccurrenceBookingPriceRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.calculate_customer_multi_occurrence_booking_price(
        customer_id=UUID(current_user.id),
        request=request,
    )


@router.post("/instant")
async def create_instant_booking(
    request: InstantBookingCreateRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(get_bookings_service),
) -> dict[str, Any]:
    return await service.create_instant_booking(
        request=request,
        customer_id=UUID(current_user.id),
        idempotency_key=idempotency_key,
    )


@router.post("/scheduled")
async def create_scheduled_booking(
    request: MultiOccurrenceBookingCreateRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(get_bookings_service),
) -> dict[str, Any]:
    return await service.create_scheduled_booking(
        request=request,
        customer_id=UUID(current_user.id),
        idempotency_key=idempotency_key,
    )


@router.post("/recurring")
async def create_recurring_booking(
    request: MultiOccurrenceBookingCreateRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(get_bookings_service),
) -> dict[str, Any]:
    return await service.create_recurring_booking(
        request=request,
        customer_id=UUID(current_user.id),
        idempotency_key=idempotency_key,
    )


@router.get("/{booking_id}/history")
async def get_booking_history(
    booking_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> list[dict[str, Any]]:
    return await service.get_customer_booking_status_history(
        booking_id=booking_id,
        customer_id=UUID(current_user.id),
    )


@router.get("/{booking_id}/occurrences")
async def get_booking_occurrences(
    booking_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> list[dict[str, Any]]:
    return await service.get_customer_booking_occurrences(
        booking_id=booking_id,
        customer_id=UUID(current_user.id),
    )


@router.get("/{booking_id}/occurrences/active")
async def get_active_booking_occurrence(
    booking_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any] | None:
    return await service.get_customer_active_booking_occurrence(
        booking_id=booking_id,
        customer_id=UUID(current_user.id),
    )


@router.get("/{booking_id}/tracking/location")
async def get_booking_worker_location(
    booking_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any] | None:
    return await service.get_customer_booking_latest_worker_location(
        booking_id=booking_id,
        customer_id=UUID(current_user.id),
    )


@router.post("/{booking_id}/otp")
async def create_booking_otp(
    booking_id: UUID,
    request: CustomerBookingOtpRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    customer_id = UUID(current_user.id)

    await enforce_booking_otp_rate_limit(
        booking_id=booking_id,
        customer_id=customer_id,
        otp_type=request.otp_type,
    )

    return await service.create_customer_booking_otp(
        booking_id=booking_id,
        customer_id=customer_id,
        otp_type=request.otp_type,
        occurrence_id=request.occurrence_id,
    )


@router.get("/{booking_id}")
async def get_customer_booking(
    booking_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.get_customer_booking(
        booking_id=booking_id,
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
    return await service.get_customer_booking_refunds(
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
