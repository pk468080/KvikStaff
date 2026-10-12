from uuid import UUID

from fastapi import APIRouter, Depends, status
from fastapi.responses import Response

from app.core.database import get_db
from app.core.security import CurrentUser, get_customer
from app.modules.addresses.repository import AddressesRepository
from app.modules.addresses.schemas import (
    CustomerAddressCreateRequest,
    CustomerAddressCreateResponse,
    CustomerAddressResponse,
)
from app.modules.addresses.service import AddressesService

router = APIRouter()


def get_addresses_service(
    db=Depends(get_db),
) -> AddressesService:
    return AddressesService(
        AddressesRepository(db),
    )


@router.get(
    "",
    response_model=list[CustomerAddressResponse],
)
async def get_addresses(
    current_user: CurrentUser = Depends(get_customer),
    service: AddressesService = Depends(
        get_addresses_service,
    ),
) -> list[CustomerAddressResponse]:
    return await service.get_addresses(
        UUID(current_user.id),
    )


@router.get(
    "/{address_id}",
    response_model=CustomerAddressResponse,
)
async def get_address(
    address_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: AddressesService = Depends(
        get_addresses_service,
    ),
) -> CustomerAddressResponse:
    address = await service.get_address(
        address_id,
        UUID(current_user.id),
    )

    if address is None:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=404,
            detail="Customer address not found.",
        )

    return address


@router.post(
    "",
    response_model=CustomerAddressCreateResponse,
    status_code=status.HTTP_200_OK,
)
async def create_address(
    request: CustomerAddressCreateRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: AddressesService = Depends(
        get_addresses_service,
    ),
) -> CustomerAddressCreateResponse:
    address = await service.get_or_create_address(
        request,
        UUID(current_user.id),
    )

    return CustomerAddressCreateResponse(
        address=address,
    )


@router.delete(
    "/{address_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_address(
    address_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: AddressesService = Depends(
        get_addresses_service,
    ),
) -> Response:
    await service.delete_address(
        address_id,
        UUID(current_user.id),
    )

    return Response(
        status_code=status.HTTP_204_NO_CONTENT,
    )