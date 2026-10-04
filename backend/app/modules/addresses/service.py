from uuid import UUID

from app.core.exceptions import AppError
from app.modules.addresses.repository import (
    AddressesRepository,
    CustomerAddressRow,
)
from app.modules.addresses.schemas import (
    CustomerAddressCreateRequest,
    CustomerAddressResponse,
)


class AddressesService:
    def __init__(
        self,
        repository: AddressesRepository,
    ) -> None:
        self.repository = repository

    async def get_addresses(
        self,
        customer_id: UUID,
    ) -> list[CustomerAddressResponse]:
        rows = await self.repository.get_customer_addresses(
            customer_id,
        )

        return [
            self._to_response(row)
            for row in rows
        ]

    async def get_address(
        self,
        address_id: UUID,
        customer_id: UUID,
    ) -> CustomerAddressResponse | None:
        row = await self.repository.get_customer_address(
            address_id,
            customer_id,
        )

        if row is None:
            return None

        return self._to_response(row)

    async def get_or_create_address(
        self,
        request: CustomerAddressCreateRequest,
        customer_id: UUID,
    ) -> CustomerAddressResponse:
        existing = (
            await self.repository.find_existing_customer_address(
                customer_id=customer_id,
                address_line=request.address,
                latitude=request.latitude,
                longitude=request.longitude,
            )
        )

        if existing is not None:
            return self._to_response(existing)

        try:
            row = await self.repository.create_customer_address(
                customer_id=customer_id,
                address_line=request.address,
                latitude=request.latitude,
                longitude=request.longitude,
                label=request.label,
            )
        except Exception as exc:
            raise AppError(
                "ADDRESS_CREATE_FAILED",
                "Unable to create the customer address.",
                400,
            ) from exc

        return self._to_response(row)

    async def delete_address(
        self,
        address_id: UUID,
        customer_id: UUID,
    ) -> None:
        deleted = await self.repository.delete_customer_address(
            address_id,
            customer_id,
        )

        if not deleted:
            raise AppError(
                "ADDRESS_NOT_FOUND",
                "Customer address not found.",
                404,
            )

    @staticmethod
    def _to_response(
        row: CustomerAddressRow,
    ) -> CustomerAddressResponse:
        return CustomerAddressResponse(
            id=row.id,
            label=row.label,
            address_line=row.address_line,
            latitude=row.latitude,
            longitude=row.longitude,
            created_at=row.created_at,
        )