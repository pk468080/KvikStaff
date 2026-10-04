from datetime import date, datetime, time
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


def _require_timezone(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(
            "Booking datetime must include timezone information."
        )

    return value


class InstantBookingCreateRequest(BaseModel):
    service_variant_id: UUID
    address_id: UUID
    scheduled_start: datetime
    scheduled_end: datetime
    notes: str | None = Field(
        default=None,
        max_length=2000,
    )

    _validate_start = field_validator(
        "scheduled_start",
    )(_require_timezone)

    _validate_end = field_validator(
        "scheduled_end",
    )(_require_timezone)

    @field_validator("scheduled_end")
    @classmethod
    def validate_time_range(
        cls,
        value: datetime,
        info,
    ) -> datetime:
        start = info.data.get("scheduled_start")

        if start is not None and value <= start:
            raise ValueError(
                "Booking end time must be after start time."
            )

        return value

    @field_validator("notes")
    @classmethod
    def normalize_notes(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        value = value.strip()

        return value or None


class MultiOccurrenceBookingCreateRequest(BaseModel):
    service_variant_id: UUID
    address_id: UUID
    schedule_start_date: date
    schedule_end_date: date
    daily_start_time: time
    daily_end_time: time
    selected_weekdays: list[int] = Field(
        min_length=1,
        max_length=7,
    )
    off_dates: list[date] = Field(
        default_factory=list,
    )
    notes: str | None = Field(
        default=None,
        max_length=2000,
    )

    @field_validator("schedule_end_date")
    @classmethod
    def validate_date_range(
        cls,
        value: date,
        info,
    ) -> date:
        start_date = info.data.get(
            "schedule_start_date"
        )

        if (
            start_date is not None
            and value < start_date
        ):
            raise ValueError(
                "Booking end date cannot be before start date."
            )

        return value

    @field_validator("daily_end_time")
    @classmethod
    def validate_daily_time_range(
        cls,
        value: time,
        info,
    ) -> time:
        start_time = info.data.get(
            "daily_start_time"
        )

        if (
            start_time is not None
            and value <= start_time
        ):
            raise ValueError(
                "Daily end time must be after daily start time."
            )

        return value

    @field_validator("selected_weekdays")
    @classmethod
    def validate_weekdays(
        cls,
        value: list[int],
    ) -> list[int]:
        if len(set(value)) != len(value):
            raise ValueError(
                "Selected weekdays must be unique."
            )

        if any(day < 0 or day > 6 for day in value):
            raise ValueError(
                "Weekdays must use values from 0 to 6."
            )

        return value

    @field_validator("off_dates")
    @classmethod
    def normalize_off_dates(
        cls,
        value: list[date],
    ) -> list[date]:
        return list(dict.fromkeys(value))

    @field_validator("notes")
    @classmethod
    def normalize_notes(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        value = value.strip()

        return value or None