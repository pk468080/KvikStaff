from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class CustomerAddressRow:
    id: UUID
    label: str | None
    address_line: str
    latitude: float
    longitude: float
    created_at: datetime


class AddressesRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_customer_addresses(
        self,
        customer_id: UUID,
    ) -> list[CustomerAddressRow]:
        query = text(
            """
            SELECT
                id,
                label,
                address_line,
                latitude,
                longitude,
                created_at
            FROM public.addresses
            WHERE user_id = :customer_id
            ORDER BY created_at DESC
            """
        )

        result = await self.db.execute(
            query,
            {"customer_id": customer_id},
        )

        rows = result.mappings().all()

        return [
            CustomerAddressRow(
                id=row["id"],
                label=row["label"],
                address_line=row["address_line"],
                latitude=float(row["latitude"]),
                longitude=float(row["longitude"]),
                created_at=row["created_at"],
            )
            for row in rows
        ]

    async def get_customer_address(
        self,
        address_id: UUID,
        customer_id: UUID,
    ) -> CustomerAddressRow | None:
        query = text(
            """
            SELECT
                id,
                label,
                address_line,
                latitude,
                longitude,
                created_at
            FROM public.addresses
            WHERE
                id = :address_id
                AND user_id = :customer_id
            LIMIT 1
            """
        )

        result = await self.db.execute(
            query,
            {
                "address_id": address_id,
                "customer_id": customer_id,
            },
        )

        row = result.mappings().first()

        if row is None:
            return None

        return CustomerAddressRow(
            id=row["id"],
            label=row["label"],
            address_line=row["address_line"],
            latitude=float(row["latitude"]),
            longitude=float(row["longitude"]),
            created_at=row["created_at"],
        )

    async def find_existing_customer_address(
        self,
        customer_id: UUID,
        address_line: str,
        latitude: float,
        longitude: float,
    ) -> CustomerAddressRow | None:
        query = text(
            """
            SELECT
                id,
                label,
                address_line,
                latitude,
                longitude,
                created_at
            FROM public.addresses
            WHERE
                user_id = :customer_id
                AND address_line = :address_line
                AND latitude = :latitude
                AND longitude = :longitude
            ORDER BY created_at DESC
            LIMIT 1
            """
        )

        result = await self.db.execute(
            query,
            {
                "customer_id": customer_id,
                "address_line": address_line,
                "latitude": latitude,
                "longitude": longitude,
            },
        )

        row = result.mappings().first()

        if row is None:
            return None

        return CustomerAddressRow(
            id=row["id"],
            label=row["label"],
            address_line=row["address_line"],
            latitude=float(row["latitude"]),
            longitude=float(row["longitude"]),
            created_at=row["created_at"],
        )

    async def create_customer_address(
        self,
        customer_id: UUID,
        address_line: str,
        latitude: float,
        longitude: float,
        label: str | None,
    ) -> CustomerAddressRow:
        query = text(
            """
            INSERT INTO public.addresses (
                user_id,
                label,
                address_line,
                latitude,
                longitude,
                location
            )
            VALUES (
                :customer_id,
                :label,
                :address_line,
                :latitude,
                :longitude,
                ST_SetSRID(
                    ST_MakePoint(:longitude, :latitude),
                    4326
                )::geography
            )
            RETURNING
                id,
                label,
                address_line,
                latitude,
                longitude,
                created_at
            """
        )

        result = await self.db.execute(
            query,
            {
                "customer_id": customer_id,
                "label": label,
                "address_line": address_line,
                "latitude": latitude,
                "longitude": longitude,
            },
        )

        row = result.mappings().one()

        return CustomerAddressRow(
            id=row["id"],
            label=row["label"],
            address_line=row["address_line"],
            latitude=float(row["latitude"]),
            longitude=float(row["longitude"]),
            created_at=row["created_at"],
        )

    async def delete_customer_address(
        self,
        address_id: UUID,
        customer_id: UUID,
    ) -> bool:
        query = text(
            """
            DELETE FROM public.addresses
            WHERE
                id = :address_id
                AND user_id = :customer_id
            RETURNING id
            """
        )

        result = await self.db.execute(
            query,
            {
                "address_id": address_id,
                "customer_id": customer_id,
            },
        )

        return result.scalar_one_or_none() is not None