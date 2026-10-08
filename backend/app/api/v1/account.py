from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import (
    CurrentUser,
    get_customer,
)
from app.modules.account.repository import (
    AccountDeletionRepository,
)
from app.modules.account.schemas import (
    AccountDeletionRequestCreateRequest,
    AccountDeletionRequestResponse,
)
from app.modules.account.service import (
    AccountDeletionService,
)

router = APIRouter()


def get_account_deletion_service(
    db=Depends(get_db),
) -> AccountDeletionService:
    return AccountDeletionService(
        AccountDeletionRepository(db),
    )


@router.get(
    "/deletion-request",
    response_model=(
        AccountDeletionRequestResponse
        | None
    ),
)
async def get_latest_account_deletion_request(
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: AccountDeletionService = Depends(
        get_account_deletion_service
    ),
) -> dict[str, Any] | None:
    return await service.get_latest_request(
        UUID(current_user.id),
    )


@router.post(
    "/deletion-request",
    response_model=AccountDeletionRequestResponse,
)
async def request_account_deletion(
    request: AccountDeletionRequestCreateRequest,
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: AccountDeletionService = Depends(
        get_account_deletion_service
    ),
) -> dict[str, Any]:
    return await service.request_account_deletion(
        customer_id=UUID(current_user.id),
        reason=request.reason,
    )