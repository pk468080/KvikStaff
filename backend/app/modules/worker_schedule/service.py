from uuid import UUID

from app.core.exceptions import AppError
from app.modules.worker_schedule.repository import (
    WorkerScheduleRepository,
)
from app.modules.worker_schedule.schemas import (
    WorkerWeeklyScheduleRequest,
)


class WorkerScheduleService:
    def __init__(
        self,
        repository: WorkerScheduleRepository,
    ) -> None:
        self.repository = repository

    async def list_weekly_schedules(
        self,
        worker_id: UUID,
    ):
        return await self.repository.list_weekly_schedules(
            worker_id
        )

    async def create_weekly_schedule(
        self,
        worker_id: UUID,
        schedule: WorkerWeeklyScheduleRequest,
    ):
        if schedule.is_active:
            overlap = await self.repository.has_overlap(
                worker_id,
                schedule,
            )

            if overlap:
                raise AppError(
                    "WORKER_SCHEDULE_OVERLAP",
                    "Worker schedule windows cannot overlap on the same day.",
                    409,
                )

        return await self.repository.create_weekly_schedule(
            worker_id,
            schedule,
        )

    async def update_weekly_schedule(
        self,
        worker_id: UUID,
        schedule_id: UUID,
        schedule: WorkerWeeklyScheduleRequest,
    ):
        existing = await self.repository.get_weekly_schedule(
            worker_id,
            schedule_id,
        )

        if existing is None:
            raise AppError(
                "WORKER_SCHEDULE_NOT_FOUND",
                "Worker schedule was not found.",
                404,
            )

        if schedule.is_active:
            overlap = await self.repository.has_overlap(
                worker_id,
                schedule,
                exclude_schedule_id=schedule_id,
            )

            if overlap:
                raise AppError(
                    "WORKER_SCHEDULE_OVERLAP",
                    "Worker schedule windows cannot overlap on the same day.",
                    409,
                )

        updated = await self.repository.update_weekly_schedule(
            worker_id,
            schedule_id,
            schedule,
        )

        if updated is None:
            raise AppError(
                "WORKER_SCHEDULE_NOT_FOUND",
                "Worker schedule was not found.",
                404,
            )

        return updated

    async def delete_weekly_schedule(
        self,
        worker_id: UUID,
        schedule_id: UUID,
    ) -> None:
        deleted = await self.repository.delete_weekly_schedule(
            worker_id,
            schedule_id,
        )

        if not deleted:
            raise AppError(
                "WORKER_SCHEDULE_NOT_FOUND",
                "Worker schedule was not found.",
                404,
            )

    async def replace_weekly_schedules(
        self,
        worker_id: UUID,
        schedules: list[WorkerWeeklyScheduleRequest],
    ):
        active_schedules = [
            schedule
            for schedule in schedules
            if schedule.is_active
        ]

        for index, current in enumerate(
            active_schedules
        ):
            for next_schedule in active_schedules[
                index + 1:
            ]:
                if (
                    current.day_of_week
                    != next_schedule.day_of_week
                ):
                    continue

                if (
                    current.start_time
                    < next_schedule.end_time
                    and current.end_time
                    > next_schedule.start_time
                ):
                    raise AppError(
                        "WORKER_SCHEDULE_OVERLAP",
                        "Worker schedule windows cannot overlap on the same day.",
                        409,
                    )

        return await self.repository.replace_weekly_schedules(
            worker_id,
            schedules,
        )