from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.database import get_db
from app.core.security import CurrentUser, get_customer
from app.modules.availability.repository import AvailabilityRepository
from app.modules.availability.schemas import (
    AvailableServiceIdsResponse,
    InstantAvailabilityCheckRequest,
    InstantAvailabilityCheckResponse,
    InstantAvailabilitySlotsRequest,
    InstantAvailabilitySlotsResponse,
    ScheduledAvailabilitySlotsRequest,
    ScheduledAvailabilitySlotsResponse,
    ServiceAreaResponse,
)
from app.modules.availability.service import AvailabilityService

router = APIRouter()


def get_availability_service(
    db=Depends(get_db),
) -> AvailabilityService:
    return AvailabilityService(
        AvailabilityRepository(db)
    )


@router.get(
    "/service-areas",
    response_model=list[ServiceAreaResponse],
)
async def get_service_areas(
    service: AvailabilityService = Depends(
        get_availability_service
    ),
) -> list[ServiceAreaResponse]:
    return await service.get_active_service_areas()


@router.get(
    "/service-ids",
    response_model=AvailableServiceIdsResponse,
)
async def get_available_service_ids(
    latitude: float = Query(
        ...,
        ge=-90,
        le=90,
    ),
    longitude: float = Query(
        ...,
        ge=-180,
        le=180,
    ),
    service_ids: list[UUID] | None = Query(
        default=None
    ),
    service: AvailabilityService = Depends(
        get_availability_service
    ),
) -> AvailableServiceIdsResponse:
    return await service.get_available_service_ids(
        latitude,
        longitude,
        service_ids or [],
    )


@router.post(
    "/instant/check",
    response_model=InstantAvailabilityCheckResponse,
)
async def check_instant_availability(
    request: InstantAvailabilityCheckRequest,
    _: CurrentUser = Depends(get_customer),
    service: AvailabilityService = Depends(
        get_availability_service
    ),
) -> InstantAvailabilityCheckResponse:
    return await service.check_instant_availability(
        request.service_id,
        request.latitude,
        request.longitude,
    )


@router.post(
    "/instant/slots",
    response_model=InstantAvailabilitySlotsResponse,
)
async def get_instant_availability_slots(
    request: InstantAvailabilitySlotsRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: AvailabilityService = Depends(
        get_availability_service
    ),
) -> InstantAvailabilitySlotsResponse:
    return await service.get_instant_availability_slots(
        request.service_variant_id,
        request.address_id,
        request.duration_hours,
        UUID(current_user.id),
    )


@router.post(
    "/scheduled/slots",
    response_model=ScheduledAvailabilitySlotsResponse,
)
async def get_scheduled_availability_slots(
    request: ScheduledAvailabilitySlotsRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: AvailabilityService = Depends(
        get_availability_service
    ),
) -> ScheduledAvailabilitySlotsResponse:
    return await service.get_scheduled_availability_slots(
        request,
        UUID(current_user.id),
    )