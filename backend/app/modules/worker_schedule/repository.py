from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.worker_schedule.schemas import (
    WorkerWeeklyScheduleRequest,
)


class WorkerScheduleRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def list_weekly_schedules(
        self,
        worker_id: UUID,
    ) -> list[dict[str, Any]]:
        result = await self.db.execute(
            text(
                """
                SELECT
                    id,
                    worker_id,
                    day_of_week,
                    start_time,
                    end_time,
                    is_active,
                    created_at,
                    updated_at
                FROM public.worker_weekly_schedules
                WHERE worker_id = :worker_id
                ORDER BY day_of_week ASC, start_time ASC
                """
            ),
            {
                "worker_id": str(worker_id),
            },
        )

        return [
            dict(row)
            for row in result.mappings().all()
        ]

    async def get_weekly_schedule(
        self,
        worker_id: UUID,
        schedule_id: UUID,
    ) -> dict[str, Any] | None:
        result = await self.db.execute(
            text(
                """
                SELECT
                    id,
                    worker_id,
                    day_of_week,
                    start_time,
                    end_time,
                    is_active,
                    created_at,
                    updated_at
                FROM public.worker_weekly_schedules
                WHERE id = :schedule_id
                  AND worker_id = :worker_id
                LIMIT 1
                """
            ),
            {
                "schedule_id": str(schedule_id),
                "worker_id": str(worker_id),
            },
        )

        row = result.mappings().first()

        return dict(row) if row is not None else None

    async def has_overlap(
        self,
        worker_id: UUID,
        schedule: WorkerWeeklyScheduleRequest,
        exclude_schedule_id: UUID | None = None,
    ) -> bool:
        query = """
            SELECT EXISTS (
                SELECT 1
                FROM public.worker_weekly_schedules
                WHERE worker_id = :worker_id
                  AND day_of_week = :day_of_week
                  AND is_active = true
                  AND start_time < :end_time
                  AND end_time > :start_time
        """

        params: dict[str, Any] = {
            "worker_id": str(worker_id),
            "day_of_week": schedule.day_of_week,
            "start_time": schedule.start_time,
            "end_time": schedule.end_time,
        }

        if exclude_schedule_id is not None:
            query += """
                  AND id <> :exclude_schedule_id
            """

            params["exclude_schedule_id"] = str(
                exclude_schedule_id
            )

        query += """
            ) AS overlaps
        """

        result = await self.db.execute(
            text(query),
            params,
        )

        return bool(result.scalar_one())

    async def create_weekly_schedule(
        self,
        worker_id: UUID,
        schedule: WorkerWeeklyScheduleRequest,
    ) -> dict[str, Any]:
        async with self.db.begin():
            result = await self.db.execute(
                text(
                    """
                    INSERT INTO public.worker_weekly_schedules (
                        worker_id,
                        day_of_week,
                        start_time,
                        end_time,
                        is_active
                    )
                    VALUES (
                        :worker_id,
                        :day_of_week,
                        :start_time,
                        :end_time,
                        :is_active
                    )
                    RETURNING
                        id,
                        worker_id,
                        day_of_week,
                        start_time,
                        end_time,
                        is_active,
                        created_at,
                        updated_at
                    """
                ),
                {
                    "worker_id": str(worker_id),
                    "day_of_week": schedule.day_of_week,
                    "start_time": schedule.start_time,
                    "end_time": schedule.end_time,
                    "is_active": schedule.is_active,
                },
            )

            return dict(
                result.mappings().one()
            )

    async def update_weekly_schedule(
        self,
        worker_id: UUID,
        schedule_id: UUID,
        schedule: WorkerWeeklyScheduleRequest,
    ) -> dict[str, Any] | None:
        async with self.db.begin():
            result = await self.db.execute(
                text(
                    """
                    UPDATE public.worker_weekly_schedules
                    SET
                        day_of_week = :day_of_week,
                        start_time = :start_time,
                        end_time = :end_time,
                        is_active = :is_active,
                        updated_at = now()
                    WHERE id = :schedule_id
                      AND worker_id = :worker_id
                    RETURNING
                        id,
                        worker_id,
                        day_of_week,
                        start_time,
                        end_time,
                        is_active,
                        created_at,
                        updated_at
                    """
                ),
                {
                    "schedule_id": str(schedule_id),
                    "worker_id": str(worker_id),
                    "day_of_week": schedule.day_of_week,
                    "start_time": schedule.start_time,
                    "end_time": schedule.end_time,
                    "is_active": schedule.is_active,
                },
            )

            row = result.mappings().first()

            return (
                dict(row)
                if row is not None
                else None
            )

    async def delete_weekly_schedule(
        self,
        worker_id: UUID,
        schedule_id: UUID,
    ) -> bool:
        async with self.db.begin():
            result = await self.db.execute(
                text(
                    """
                    DELETE FROM public.worker_weekly_schedules
                    WHERE id = :schedule_id
                      AND worker_id = :worker_id
                    """
                ),
                {
                    "schedule_id": str(schedule_id),
                    "worker_id": str(worker_id),
                },
            )

            return result.rowcount > 0

    async def replace_weekly_schedules(
        self,
        worker_id: UUID,
        schedules: list[WorkerWeeklyScheduleRequest],
    ) -> list[dict[str, Any]]:
        async with self.db.begin():
            await self.db.execute(
                text(
                    """
                    DELETE FROM public.worker_weekly_schedules
                    WHERE worker_id = :worker_id
                    """
                ),
                {
                    "worker_id": str(worker_id),
                },
            )

            for schedule in schedules:
                await self.db.execute(
                    text(
                        """
                        INSERT INTO public.worker_weekly_schedules (
                            worker_id,
                            day_of_week,
                            start_time,
                            end_time,
                            is_active
                        )
                        VALUES (
                            :worker_id,
                            :day_of_week,
                            :start_time,
                            :end_time,
                            :is_active
                        )
                        """
                    ),
                    {
                        "worker_id": str(worker_id),
                        "day_of_week": schedule.day_of_week,
                        "start_time": schedule.start_time,
                        "end_time": schedule.end_time,
                        "is_active": schedule.is_active,
                    },
                )

            result = await self.db.execute(
                text(
                    """
                    SELECT
                        id,
                        worker_id,
                        day_of_week,
                        start_time,
                        end_time,
                        is_active,
                        created_at,
                        updated_at
                    FROM public.worker_weekly_schedules
                    WHERE worker_id = :worker_id
                    ORDER BY day_of_week ASC, start_time ASC
                    """
                ),
                {
                    "worker_id": str(worker_id),
                },
            )

            return [
                dict(row)
                for row in result.mappings().all()
            ]