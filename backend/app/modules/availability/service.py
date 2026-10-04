import math
from datetime import datetime, time, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.core.exceptions import AppError
from app.modules.availability.repository import AvailabilityRepository
from app.modules.availability.schemas import (
    AvailabilitySlot,
    AvailableServiceIdsResponse,
    InstantAvailabilityCheckResponse,
    InstantAvailabilitySlotsResponse,
    ScheduledAvailabilitySlotsRequest,
    ScheduledAvailabilitySlotsResponse,
    ServiceAreaResponse,
)


class AvailabilityService:
    def __init__(self, repository: AvailabilityRepository) -> None:
        self.repository = repository

    async def get_active_service_areas(
        self,
    ) -> list[ServiceAreaResponse]:
        rows = await self.repository.get_active_service_areas()

        return [
            ServiceAreaResponse(
                id=row.id,
                service_id=row.service_id,
                name=row.name,
                city=row.city,
                state=row.state,
                center_latitude=row.center_latitude,
                center_longitude=row.center_longitude,
                radius_km=row.radius_km,
            )
            for row in rows
        ]

    async def get_available_service_ids(
        self,
        latitude: float,
        longitude: float,
        service_ids: list[UUID],
    ) -> AvailableServiceIdsResponse:
        available: set[UUID] = set()
        requested = set(service_ids)

        areas = await self.repository.get_active_service_areas()

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
                if requested:
                    available.update(requested)
                continue

            if not requested or area.service_id in requested:
                available.add(area.service_id)

        return AvailableServiceIdsResponse(
            latitude=latitude,
            longitude=longitude,
            service_ids=sorted(available, key=str),
        )

    async def check_instant_availability(
        self,
        service_id: UUID,
        latitude: float,
        longitude: float,
    ) -> InstantAvailabilityCheckResponse:
        checked_at = datetime.now(timezone.utc)

        service_area_available = (
            await self.repository.is_service_area_available(
                service_id,
                latitude,
                longitude,
            )
        )

        if not service_area_available:
            return InstantAvailabilityCheckResponse(
                service_area_available=False,
                nearby_worker_available=False,
                instant_available=False,
                recommended_booking_type="scheduled",
                nearby_worker_count=0,
                nearest_worker_id=None,
                nearest_worker_distance_km=None,
                checked_at=checked_at,
            )

        snapshot = await self.repository.get_instant_worker_snapshot(
            service_id,
            latitude,
            longitude,
        )

        nearby_worker_available = snapshot.count > 0

        return InstantAvailabilityCheckResponse(
            service_area_available=True,
            nearby_worker_available=nearby_worker_available,
            instant_available=nearby_worker_available,
            recommended_booking_type=(
                "instant"
                if nearby_worker_available
                else "scheduled"
            ),
            nearby_worker_count=snapshot.count,
            nearest_worker_id=snapshot.nearest_worker_id,
            nearest_worker_distance_km=snapshot.nearest_distance_km,
            checked_at=checked_at,
        )

    async def get_instant_availability_slots(
        self,
        service_variant_id: UUID,
        address_id: UUID,
        duration_hours: float,
        customer_id: UUID,
    ) -> InstantAvailabilitySlotsResponse:
        service_context = (
            await self.repository.get_active_hourly_service_variant(
                service_variant_id
            )
        )

        if service_context is None:
            raise AppError(
                "INVALID_SERVICE_VARIANT",
                "An active hourly service variant is required.",
                400,
            )

        address = await self.repository.get_customer_address(
            address_id,
            customer_id,
        )

        if address is None:
            raise AppError(
                "INVALID_CUSTOMER_ADDRESS",
                "A valid customer address is required.",
                400,
            )

        service_area_available = (
            await self.repository.is_service_area_available(
                service_context.service_id,
                address.latitude,
                address.longitude,
            )
        )

        if not service_area_available:
            return InstantAvailabilitySlotsResponse(
                service_area_available=False,
                instant_available=False,
                slots=[],
            )

        timezone_name = (
            await self.repository.get_platform_setting_value(
                "operations.timezone",
                "Asia/Kolkata",
            )
        )

        open_time_value = (
            await self.repository.get_platform_setting_value(
                "operations.default_start_time",
                "08:00:00",
            )
        )

        close_time_value = (
            await self.repository.get_platform_setting_value(
                "operations.default_end_time",
                "22:00:00",
            )
        )

        tz = self._timezone(timezone_name)

        open_time = self._parse_time(
            open_time_value,
            "operations.default_start_time",
        )

        close_time = self._parse_time(
            close_time_value,
            "operations.default_end_time",
        )

        now_utc = datetime.now(timezone.utc)
        local_date = now_utc.astimezone(tz).date()

        operating_start = datetime.combine(
            local_date,
            open_time,
            tzinfo=tz,
        )

        operating_end = datetime.combine(
            local_date,
            close_time,
            tzinfo=tz,
        )

        duration = timedelta(hours=duration_hours)

        cursor = self._ceil_to_15_minutes(
            now_utc + timedelta(minutes=15)
        )

        if cursor < operating_start:
            cursor = operating_start

        last_start = min(
            operating_end - duration,
            now_utc + timedelta(hours=4),
        )

        slots: list[AvailabilitySlot] = []

        while cursor <= last_start:
            count = (
                await self.repository.count_instant_slot_workers(
                    service_context.service_id,
                    address.latitude,
                    address.longitude,
                    cursor,
                    cursor + duration,
                )
            )

            if count > 0:
                slots.append(
                    AvailabilitySlot(
                        start=cursor,
                        end=cursor + duration,
                        available_worker_count=count,
                    )
                )

            cursor += timedelta(minutes=15)

        return InstantAvailabilitySlotsResponse(
            service_area_available=True,
            instant_available=bool(slots),
            slots=slots,
        )

    async def get_scheduled_availability_slots(
        self,
        request: ScheduledAvailabilitySlotsRequest,
        customer_id: UUID,
    ) -> ScheduledAvailabilitySlotsResponse:
        request.validate_window()

        service_context = (
            await self.repository.get_active_service_variant(
                request.service_variant_id
            )
        )

        if service_context is None:
            raise AppError(
                "INVALID_SERVICE_VARIANT",
                "Service variant is not active.",
                400,
            )

        address = await self.repository.get_customer_address(
            request.address_id,
            customer_id,
        )

        if address is None:
            raise AppError(
                "INVALID_CUSTOMER_ADDRESS",
                "The booking address does not belong to this customer.",
                400,
            )

        service_area_available = (
            await self.repository.is_service_area_available(
                service_context.service_id,
                address.latitude,
                address.longitude,
            )
        )

        if not service_area_available:
            return ScheduledAvailabilitySlotsResponse(
                service_area_available=False,
                slots=[],
            )

        timezone_name = (
            await self.repository.get_platform_setting_value(
                "operations.timezone",
                "Asia/Kolkata",
            )
        )

        tz = self._timezone(timezone_name)

        now_utc = datetime.now(timezone.utc)

        local_date = now_utc.astimezone(tz).date()

        lookahead_limit = datetime.combine(
            local_date + timedelta(days=2),
            time.min,
            tzinfo=tz,
        )

        duration = timedelta(
            hours=request.duration_hours
        )

        cursor = max(
            request.start,
            now_utc,
        )

        last_start = min(
            request.end,
            lookahead_limit,
        ) - duration

        slots: list[AvailabilitySlot] = []

        while cursor <= last_start:
            count = await self.repository.count_scheduled_workers(
                service_context.service_id,
                cursor,
                cursor + duration,
            )

            if count > 0:
                slots.append(
                    AvailabilitySlot(
                        start=cursor,
                        end=cursor + duration,
                        available_worker_count=count,
                    )
                )

            cursor += timedelta(hours=1)

        return ScheduledAvailabilitySlotsResponse(
            service_area_available=True,
            slots=slots,
        )

    @staticmethod
    def _timezone(value: str) -> ZoneInfo:
        try:
            return ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise AppError(
                "INVALID_TIMEZONE",
                "Configured operations timezone is invalid.",
                500,
            ) from exc

    @staticmethod
    def _parse_time(
        value: str,
        setting_key: str,
    ) -> time:
        try:
            return time.fromisoformat(value)
        except ValueError as exc:
            raise AppError(
                "INVALID_PLATFORM_SETTING",
                f"Configured time value for {setting_key} is invalid.",
                500,
            ) from exc

    @staticmethod
    def _ceil_to_15_minutes(
        value: datetime,
    ) -> datetime:
        seconds = value.timestamp()
        rounded = math.ceil(seconds / 900) * 900

        return datetime.fromtimestamp(
            rounded,
            tz=value.tzinfo,
        )

    @staticmethod
    def _distance_km(
        latitude1: float,
        longitude1: float,
        latitude2: float,
        longitude2: float,
    ) -> float:
        earth_radius_km = 6371

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