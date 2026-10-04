from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.database import get_db
from app.modules.services.repository import ServicesRepository
from app.modules.services.schemas import ServiceResponse
from app.modules.services.service import ServicesService

router = APIRouter()


def get_services_service(
    db=Depends(get_db),
) -> ServicesService:
    return ServicesService(
        ServicesRepository(db)
    )


@router.get(
    "",
    response_model=list[ServiceResponse],
)
async def get_services(
    latitude: float | None = Query(
        default=None,
        ge=-90,
        le=90,
    ),
    longitude: float | None = Query(
        default=None,
        ge=-180,
        le=180,
    ),
    service: ServicesService = Depends(
        get_services_service,
    ),
) -> list[ServiceResponse]:
    if (
        (latitude is None and longitude is not None)
        or (latitude is not None and longitude is None)
    ):
        raise HTTPException(
            status_code=422,
            detail="Latitude and longitude must be provided together.",
        )

    return await service.get_services(
        latitude=latitude,
        longitude=longitude,
    )


@router.get(
    "/{service_id}",
    response_model=ServiceResponse,
)
async def get_service(
    service_id: UUID,
    service: ServicesService = Depends(
        get_services_service,
    ),
) -> ServiceResponse:
    result = await service.get_service(service_id)

    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Service not found.",
        )

    return result