from datetime import time
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class WorkerWeeklyScheduleResponse(BaseModel):
    id: UUID
    worker_id: UUID
    day_of_week: int
    start_time: time
    end_time: time
    is_active: bool
    created_at: object
    updated_at: object


class WorkerWeeklyScheduleRequest(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: time
    end_time: time
    is_active: bool

    @field_validator("end_time")
    @classmethod
    def validate_time_range(
        cls,
        value: time,
        info,
    ) -> time:
        start_time = info.data.get("start_time")

        if (
            start_time is not None
            and value <= start_time
        ):
            raise ValueError(
                "Schedule end time must be after the start time."
            )

        duration_minutes = (
            value.hour * 60
            + value.minute
            - (
                start_time.hour * 60
                + start_time.minute
            )
            if start_time is not None
            else 0
        )

        if start_time is not None and duration_minutes < 30:
            raise ValueError(
                "A worker schedule window must be at least 30 minutes."
            )

        return value


class WorkerWeeklyScheduleReplaceRequest(BaseModel):
    schedules: list[WorkerWeeklyScheduleRequest]