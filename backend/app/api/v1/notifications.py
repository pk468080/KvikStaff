from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.security import CurrentUser, get_customer
from app.modules.notifications.repository import (
    NotificationsRepository,
)
from app.core.database import get_db
from app.modules.notifications.schemas import (
    CustomerPushTokenRequest,
    CustomerPushTokenResponse,
)
from app.modules.notifications.service import NotificationsService


router = APIRouter()


def get_notifications_service(
    db=Depends(get_db),
) -> NotificationsService:
    return NotificationsService(
        NotificationsRepository(db)
    )


@router.get("/unread-count")
async def get_unread_notification_count(
    current_user: CurrentUser = Depends(get_customer),
    service: NotificationsService = Depends(
        get_notifications_service
    ),
) -> int:
    return await service.get_unread_customer_notification_count(
        customer_id=UUID(current_user.id),
    )


@router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: NotificationsService = Depends(
        get_notifications_service
    ),
) -> None:
    await service.mark_customer_notification_read(
        customer_id=UUID(current_user.id),
        notification_id=notification_id,
    )


@router.post(
    "/push-tokens",
    response_model=CustomerPushTokenResponse,
)
async def register_customer_push_token(
    request: CustomerPushTokenRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: NotificationsService = Depends(
        get_notifications_service
    ),
) -> CustomerPushTokenResponse:
    return await service.register_customer_push_token(
        customer_id=UUID(current_user.id),
        token=request.token,
        platform=request.platform,
    )


@router.delete("/push-tokens")
async def deactivate_customer_push_tokens(
    current_user: CurrentUser = Depends(get_customer),
    service: NotificationsService = Depends(
        get_notifications_service
    ),
) -> None:
    await service.deactivate_customer_push_tokens(
        customer_id=UUID(current_user.id),
    )
