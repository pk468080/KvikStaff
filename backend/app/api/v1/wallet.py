from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import CurrentUser, get_customer
from app.modules.wallet.repository import WalletRepository
from app.modules.wallet.schemas import (
    WalletSummaryResponse,
    WalletTransactionPageResponse,
)
from app.modules.wallet.service import WalletService

router = APIRouter()


def get_wallet_service(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> WalletService:
    return WalletService(
        WalletRepository(db),
    )


@router.get(
    "",
    response_model=WalletSummaryResponse,
)
async def get_wallet(
    current_user: Annotated[CurrentUser, Depends(get_customer)],
    service: Annotated[WalletService, Depends(get_wallet_service)],
) -> dict[str, Any]:
    return await service.get_wallet_summary(
        customer_id=UUID(current_user.id),
    )


@router.get(
    "/transactions",
    response_model=WalletTransactionPageResponse,
)
async def get_wallet_transactions(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=100000),
    current_user: Annotated[CurrentUser, Depends(get_customer)] = None,
    service: Annotated[WalletService, Depends(get_wallet_service)] = None,
) -> dict[str, Any]:
    return await service.get_wallet_transactions(
        customer_id=UUID(current_user.id),
        limit=limit,
        offset=offset,
    )