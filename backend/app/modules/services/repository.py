from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class ServiceCatalogRow:
    id: UUID
    service_variant_id: UUID
    name: str
    description: str | None
    hourly_price: float
    currency: str | None
    image_url: str | None
    display_order: int
    is_featured: bool
    category_id: UUID | None
    category_name: str | None


@dataclass(frozen=True)
class ServiceAreaRow:
    service_id: UUID | None
    center_latitude: float
    center_longitude: float
    radius_km: float


class ServicesRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_active_services(
        self,
        service_id: UUID | None = None,
    ) -> list[ServiceCatalogRow]:
        query = text(
            """
            SELECT
                s.id,
                v.id AS service_variant_id,
                s.name,
                s.description,
                p.price::double precision AS hourly_price,
                p.currency,
                s.image_url,
                COALESCE(s.display_order, 0) AS display_order,
                COALESCE(s.is_featured, false) AS is_featured,
                s.category_id,
                c.name AS category_name
            FROM public.services AS s
            LEFT JOIN public.service_categories AS c
                ON c.id = s.category_id
            JOIN LATERAL (
                SELECT
                    sv.id,
                    sv.service_id,
                    sv.billing_type,
                    sv.sort_order
                FROM public.service_variants AS sv
                WHERE
                    sv.service_id = s.id
                    AND sv.is_active = true
                    AND sv.billing_type = 'hourly'
                ORDER BY
                    sv.sort_order ASC,
                    sv.id ASC
                LIMIT 1
            ) AS v
                ON true
            JOIN LATERAL (
                SELECT
                    svp.price,
                    svp.currency,
                    svp.effective_from
                FROM public.service_variant_prices AS svp
                WHERE
                    svp.service_variant_id = v.id
                    AND svp.is_active = true
                    AND svp.effective_from <= now()
                    AND (
                        svp.effective_to IS NULL
                        OR now() < svp.effective_to
                    )
                ORDER BY
                    svp.effective_from DESC,
                    svp.id DESC
                LIMIT 1
            ) AS p
                ON true
            WHERE
                s.is_active = true
                AND p.price >= 0
                AND (
                    :service_id IS NULL
                    OR s.id = :service_id
                )
            ORDER BY
                COALESCE(s.is_featured, false) DESC,
                COALESCE(s.display_order, 0) ASC,
                s.name ASC
            """
        ).columns(service_id=UUID)

        result = await self.db.execute(
            query,
            {"service_id": service_id},
        )

        rows = result.mappings().all()

        return [
            ServiceCatalogRow(
                id=row["id"],
                service_variant_id=row["service_variant_id"],
                name=row["name"],
                description=row["description"],
                hourly_price=float(row["hourly_price"]),
                currency=row["currency"],
                image_url=row["image_url"],
                display_order=int(row["display_order"]),
                is_featured=bool(row["is_featured"]),
                category_id=row["category_id"],
                category_name=row["category_name"],
            )
            for row in rows
        ]

    async def get_active_service_areas(
        self,
    ) -> list[ServiceAreaRow]:
        query = text(
            """
            SELECT
                service_id,
                center_latitude::double precision AS center_latitude,
                center_longitude::double precision AS center_longitude,
                radius_km::double precision AS radius_km
            FROM public.service_areas
            WHERE is_active = true
            """
        )

        result = await self.db.execute(query)

        rows = result.mappings().all()

        return [
            ServiceAreaRow(
                service_id=row["service_id"],
                center_latitude=float(row["center_latitude"]),
                center_longitude=float(row["center_longitude"]),
                radius_km=float(row["radius_km"]),
            )
            for row in rows
        ]