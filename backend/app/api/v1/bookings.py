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


@router.post(
    "/instant",
)
async def create_instant_booking(
    request: InstantBookingCreateRequest,
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.create_instant_booking(
        request=request,
        customer_id=UUID(
            current_user.id
        ),
    )


@router.post(
    "/scheduled",
)
async def create_scheduled_booking(
    request: MultiOccurrenceBookingCreateRequest,
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.create_scheduled_booking(
        request=request,
        customer_id=UUID(
            current_user.id
        ),
    )


@router.post(
    "/recurring",
)
async def create_recurring_booking(
    request: MultiOccurrenceBookingCreateRequest,
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: BookingsService = Depends(
        get_bookings_service
    ),
) -> dict[str, Any]:
    return await service.create_recurring_booking(
        request=request,       
        customer_id=UUID(
            current_user.id
        ),
    )