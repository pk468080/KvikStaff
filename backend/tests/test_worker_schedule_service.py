from datetime import time
from uuid import UUID

import pytest

from app.core.exceptions import AppError
from app.modules.worker_schedule.schemas import (
    WorkerWeeklyScheduleRequest,
)
from app.modules.worker_schedule.service import (
    WorkerScheduleService,
)

WORKER_ID = UUID(
    "11111111-1111-1111-1111-111111111111"
)


def schedule(
    day: int = 1,
    start: str = "09:00",
    end: str = "18:00",
    active: bool = True,
) -> WorkerWeeklyScheduleRequest:
    return WorkerWeeklyScheduleRequest(
        day_of_week=day,
        start_time=time.fromisoformat(start),
        end_time=time.fromisoformat(end),
        is_active=active,
    )


class FakeRepository:
    def __init__(self, overlap: bool = False):
        self.overlap = overlap

    async def list_weekly_schedules(self, worker_id):
        return []

    async def get_weekly_schedule(
        self,
        worker_id,
        schedule_id,
    ):
        return {
            "id": schedule_id,
            "worker_id": worker_id,
        }

    async def has_overlap(
        self,
        worker_id,
        schedule,
        exclude_schedule_id=None,
    ):
        return self.overlap

    async def create_weekly_schedule(
        self,
        worker_id,
        schedule,
    ):
        return {
            "worker_id": worker_id,
            "day_of_week": schedule.day_of_week,
        }

    async def update_weekly_schedule(
        self,
        worker_id,
        schedule_id,
        schedule,
    ):
        return {
            "id": schedule_id,
            "worker_id": worker_id,
        }

    async def delete_weekly_schedule(
        self,
        worker_id,
        schedule_id,
    ):
        return True

    async def replace_weekly_schedules(
        self,
        worker_id,
        schedules,
    ):
        return [
            {
                "worker_id": worker_id,
                "day_of_week": item.day_of_week,
            }
            for item in schedules
        ]


@pytest.mark.asyncio
async def test_create_rejects_overlap():
    service = WorkerScheduleService(
        FakeRepository(overlap=True)
    )

    with pytest.raises(AppError) as exc_info:
        await service.create_weekly_schedule(
            WORKER_ID,
            schedule(),
        )

    assert exc_info.value.code == (
        "WORKER_SCHEDULE_OVERLAP"
    )


@pytest.mark.asyncio
async def test_update_rejects_overlap():
    service = WorkerScheduleService(
        FakeRepository(overlap=True)
    )

    with pytest.raises(AppError) as exc_info:
        await service.update_weekly_schedule(
            WORKER_ID,
            WORKER_ID,
            schedule(),
        )

    assert exc_info.value.code == (
        "WORKER_SCHEDULE_OVERLAP"
    )


@pytest.mark.asyncio
async def test_replace_rejects_duplicate_day_overlap():
    service = WorkerScheduleService(
        FakeRepository()
    )

    with pytest.raises(AppError) as exc_info:
        await service.replace_weekly_schedules(
            WORKER_ID,
            [
                schedule(1, "09:00", "12:00"),
                schedule(1, "11:00", "15:00"),
            ],
        )

    assert exc_info.value.code == (
        "WORKER_SCHEDULE_OVERLAP"
    )