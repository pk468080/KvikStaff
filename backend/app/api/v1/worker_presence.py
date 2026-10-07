from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import CurrentUser, get_worker
from app.modules.worker_presence.repository import (
    WorkerPresenceRepository,
)
from app.modules.worker_presence.schemas import (
    SetWorkerPresenceRequest,
    WorkerLocationRequest,
    WorkerLocationResponse,
    WorkerPresenceHeartbeatRequest,
    WorkerPresenceResponse,
)
from app.modules.worker_presence.service import (
    WorkerPresenceService,
)

router = APIRouter()


def get_worker_presence_service(
    db=Depends(get_db),
) -> WorkerPresenceService:
    return WorkerPresenceService(
        WorkerPresenceRepository(db)
    )


@router.get(
    "",
    response_model=WorkerPresenceResponse | None,
)
async def get_worker_presence(
    current_user: CurrentUser = Depends(get_worker),
    service: WorkerPresenceService = Depends(
        get_worker_presence_service
    ),
) -> WorkerPresenceResponse | None:
    from uuid import UUID

    return await service.get_presence(
        UUID(current_user.id)
    )
@router.get(
    "/location",
    response_model=WorkerLocationResponse | None,
)
async def get_latest_worker_location(
    current_user: CurrentUser = Depends(get_worker),
    service: WorkerPresenceService = Depends(
        get_worker_presence_service
    ),
) -> WorkerLocationResponse | None:
    from uuid import UUID

    return await service.get_latest_location(
        UUID(current_user.id)
    )

@router.post(
    "",
    response_model=WorkerPresenceResponse,
)
async def set_worker_presence(
    request: SetWorkerPresenceRequest,
    current_user: CurrentUser = Depends(get_worker),
    service: WorkerPresenceService = Depends(
        get_worker_presence_service
    ),
) -> WorkerPresenceResponse:
    from uuid import UUID

    return await service.set_presence(
        UUID(current_user.id),
        request.available,
    )


@router.post(
    "/heartbeat",
    response_model=WorkerPresenceResponse,
)
async def heartbeat(
    request: WorkerPresenceHeartbeatRequest,
    current_user: CurrentUser = Depends(get_worker),
    service: WorkerPresenceService = Depends(
        get_worker_presence_service
    ),
) -> WorkerPresenceResponse:
    from uuid import UUID

    return await service.heartbeat(
        UUID(current_user.id),
        request.latitude,
        request.longitude,
    )


@router.post(
    "/location",
    response_model=WorkerLocationResponse,
)
async def update_location(
    request: WorkerLocationRequest,
    current_user: CurrentUser = Depends(get_worker),
    service: WorkerPresenceService = Depends(
        get_worker_presence_service
    ),
) -> WorkerLocationResponse:
    from uuid import UUID

    return await service.update_location(
        UUID(current_user.id),
        request.latitude,
        request.longitude,
        request.booking_id,
    )