import math
from uuid import UUID

from app.modules.services.repository import (
    ServiceAreaRow,
    ServiceCatalogRow,
    ServicesRepository,
)
from app.modules.services.schemas import ServiceResponse


class ServicesService:
    def __init__(
        self,
        repository: ServicesRepository,
    ) -> None:
        self.repository = repository

    async def get_services(
        self,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> list[ServiceResponse]:
        services = await self.repository.get_active_services()

        if latitude is None and longitude is None:
            return [
                self._to_response(service)
                for service in services
            ]

        if latitude is None or longitude is None:
            raise ValueError(
                "Latitude and longitude must be provided together."
            )

        areas = await self.repository.get_active_service_areas()

        generic_area_available = False
        available_service_ids: set[UUID] = set()

        for area in areas:
            if (
                not math.isfinite(area.center_latitude)
                or not math.isfinite(area.center_longitude)
                or not math.isfinite(area.radius_km)
                or area.radius_km <= 0
            ):
                continue

            distance_km = self._distance_km(
                latitude,
                longitude,
                area.center_latitude,
                area.center_longitude,
            )

            if distance_km > area.radius_km:
                continue

            if area.service_id is None:
                generic_area_available = True
            else:
                available_service_ids.add(area.service_id)

        if generic_area_available:
            return [
                self._to_response(service)
                for service in services
            ]

        return [
            self._to_response(service)
            for service in services
            if service.id in available_service_ids
        ]

    async def get_service(
        self,
        service_id: UUID,
    ) -> ServiceResponse | None:
        services = await self.repository.get_active_services(
            service_id=service_id,
        )

        if not services:
            return None

        return self._to_response(services[0])

    @staticmethod
    def _to_response(
        row: ServiceCatalogRow,
    ) -> ServiceResponse:
        return ServiceResponse(
            id=row.id,
            service_variant_id=row.service_variant_id,
            name=row.name,
            description=row.description,
            hourly_price=row.hourly_price,
            currency=row.currency,
            image_url=row.image_url,
            display_order=row.display_order,
            is_featured=row.is_featured,
            category_id=row.category_id,
            category_name=row.category_name,
        )

    @staticmethod
    def _distance_km(
        latitude1: float,
        longitude1: float,
        latitude2: float,
        longitude2: float,
    ) -> float:
        earth_radius_km = 6371.0

        latitude_delta = math.radians(
            latitude2 - latitude1
        )
        longitude_delta = math.radians(
            longitude2 - longitude1
        )

        a = (
            math.sin(latitude_delta / 2) ** 2
            + math.cos(math.radians(latitude1))
            * math.cos(math.radians(latitude2))
            * math.sin(longitude_delta / 2) ** 2
        )

        return (
            2
            * earth_radius_km
            * math.atan2(
                math.sqrt(a),
                math.sqrt(1 - a),
            )
        )