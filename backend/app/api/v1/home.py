from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.core.database import get_db
from app.core.security import CurrentUser, get_customer
from app.modules.home.repository import HomeRepository
from app.modules.home.schemas import (
    HomeFavouriteResponse,
    HomePromotionResponse,
    HomeRebookResponse,
)
from app.modules.home.service import HomeService


router = APIRouter()


def get_home_service(
    db=Depends(get_db),
) -> HomeService:
    return HomeService(
        HomeRepository(db),
    )


@router.get(
    "/promotions",
    response_model=list[HomePromotionResponse],
)
async def get_home_promotions(
    service_ids: str | None = Query(
        default=None,
        description="Comma-separated service UUIDs available at the customer's location.",
    ),
    service: HomeService = Depends(
        get_home_service,
    ),
) -> list[dict[str, Any]]:
    available_service_ids: set[UUID] | None = None

    if service_ids is not None:
        available_service_ids = set()

        for raw_id in service_ids.split(","):
            normalized = raw_id.strip()

            if not normalized:
                continue

            try:
                available_service_ids.add(
                    UUID(normalized)
                )
            except ValueError:
                continue

    return await service.get_home_promotions(
        available_service_ids=available_service_ids,
    )


@router.get(
    "/favourites",
    response_model=list[str],
)
async def get_customer_favourites(
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: HomeService = Depends(
        get_home_service,
    ),
) -> list[str]:
    return await service.get_customer_favourite_service_ids(
        UUID(current_user.id),
    )


@router.post(
    "/favourites/{service_id}",
    response_model=HomeFavouriteResponse,
)
async def add_customer_favourite(
    service_id: UUID,
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: HomeService = Depends(
        get_home_service,
    ),
) -> dict[str, Any]:
    return await service.set_customer_favourite_service(
        customer_id=UUID(current_user.id),
        service_id=service_id,
        is_favourite=True,
    )


@router.delete(
    "/favourites/{service_id}",
    response_model=HomeFavouriteResponse,
)
async def remove_customer_favourite(
    service_id: UUID,
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: HomeService = Depends(
        get_home_service,
    ),
) -> dict[str, Any]:
    return await service.set_customer_favourite_service(
        customer_id=UUID(current_user.id),
        service_id=service_id,
        is_favourite=False,
    )


@router.get(
    "/rebook-history",
    response_model=list[HomeRebookResponse],
)
async def get_customer_rebook_history(
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: HomeService = Depends(
        get_home_service,
    ),
) -> list[dict[str, Any]]:
    return await service.get_customer_rebook_history(
        UUID(current_user.id),
    )