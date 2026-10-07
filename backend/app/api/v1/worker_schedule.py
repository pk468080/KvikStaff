from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.database import get_db
from app.core.security import CurrentUser, get_worker
from app.modules.worker_schedule.repository import (
    WorkerScheduleRepository,
)
from app.modules.worker_schedule.schemas import (
    WorkerWeeklyScheduleReplaceRequest,
    WorkerWeeklyScheduleRequest,
    WorkerWeeklyScheduleResponse,
)
from app.modules.worker_schedule.service import (
    WorkerScheduleService,
)

router = APIRouter()


def get_worker_schedule_service(
    db=Depends(get_db),
) -> WorkerScheduleService:
    return WorkerScheduleService(
        WorkerScheduleRepository(db)
    )


@router.get(
    "/weekly",
    response_model=list[
        WorkerWeeklyScheduleResponse
    ],
)
async def list_weekly_schedules(
    current_user: CurrentUser = Depends(get_worker),
    service: WorkerScheduleService = Depends(
        get_worker_schedule_service
    ),
):
    return await service.list_weekly_schedules(
        UUID(current_user.id)
    )


@router.post(
    "/weekly",
    response_model=WorkerWeeklyScheduleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_weekly_schedule(
    request: WorkerWeeklyScheduleRequest,
    current_user: CurrentUser = Depends(get_worker),
    service: WorkerScheduleService = Depends(
        get_worker_schedule_service
    ),
):
    return await service.create_weekly_schedule(
        UUID(current_user.id),
        request,
    )


@router.patch(
    "/weekly/{schedule_id}",
    response_model=WorkerWeeklyScheduleResponse,
)
async def update_weekly_schedule(
    schedule_id: UUID,
    request: WorkerWeeklyScheduleRequest,
    current_user: CurrentUser = Depends(get_worker),
    service: WorkerScheduleService = Depends(
        get_worker_schedule_service
    ),
):
    return await service.update_weekly_schedule(
        UUID(current_user.id),
        schedule_id,
        request,
    )


@router.delete(
    "/weekly/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_weekly_schedule(
    schedule_id: UUID,
    current_user: CurrentUser = Depends(get_worker),
    service: WorkerScheduleService = Depends(
        get_worker_schedule_service
    ),
) -> None:
    await service.delete_weekly_schedule(
        UUID(current_user.id),
        schedule_id,
    )


@router.put(
    "/weekly",
    response_model=list[
        WorkerWeeklyScheduleResponse
    ],
)
async def replace_weekly_schedules(
    request: WorkerWeeklyScheduleReplaceRequest,
    current_user: CurrentUser = Depends(get_worker),
    service: WorkerScheduleService = Depends(
        get_worker_schedule_service
    ),
):
    return await service.replace_weekly_schedules(
        UUID(current_user.id),
        request.schedules,
    )