from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class AvailabilityCoordinates(BaseModel):
    latitude: float
    longitude: float

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, value: float) -> float:
        if not -90 <= value <= 90:
            raise ValueError("Latitude must be between -90 and 90.")
        return value

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, value: float) -> float:
        if not -180 <= value <= 180:
            raise ValueError("Longitude must be between -180 and 180.")
        return value


class ServiceAreaResponse(BaseModel):
    id: UUID
    service_id: UUID | None
    name: str
    city: str
    state: str
    center_latitude: float
    center_longitude: float
    radius_km: float


class AvailableServiceIdsResponse(BaseModel):
    latitude: float
    longitude: float
    service_ids: list[UUID]


class InstantAvailabilityCheckRequest(AvailabilityCoordinates):
    service_id: UUID


class InstantAvailabilityCheckResponse(BaseModel):
    service_area_available: bool
    nearby_worker_available: bool
    instant_available: bool
    recommended_booking_type: Literal["instant", "scheduled"]
    nearby_worker_count: int
    nearest_worker_id: UUID | None
    nearest_worker_distance_km: float | None
    checked_at: datetime
    error_message: str | None = None


class InstantAvailabilitySlotsRequest(BaseModel):
    service_variant_id: UUID
    address_id: UUID
    duration_hours: float = Field(
        default=1,
        ge=1,
        le=24,
    )


class AvailabilitySlot(BaseModel):
    start: datetime
    end: datetime
    available_worker_count: int


class InstantAvailabilitySlotsResponse(BaseModel):
    service_area_available: bool
    instant_available: bool
    slots: list[AvailabilitySlot]


class ScheduledAvailabilitySlotsRequest(BaseModel):
    service_variant_id: UUID
    address_id: UUID
    start: datetime
    end: datetime
    duration_hours: int = Field(
        default=1,
        ge=1,
        le=24,
    )

    @field_validator("start", "end")
    @classmethod
    def validate_datetime_is_timezone_aware(
        cls,
        value: datetime,
    ) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError(
                "Availability datetimes must include a timezone offset."
            )
        return value

    @field_validator("end")
    @classmethod
    def validate_end_after_start(
        cls,
        value: datetime,
        info,
    ) -> datetime:
        start = info.data.get("start")

        if start is not None and value <= start:
            raise ValueError(
                "Availability end must be after start."
            )

        return value


class ScheduledAvailabilitySlotsResponse(BaseModel):
    service_area_available: bool
    slots: list[AvailabilitySlot]