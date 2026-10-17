from typing import Any
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import AppError
from app.modules.wallet.repository import WalletRepository


class WalletService:
    def __init__(
        self,
        repository: WalletRepository,
    ) -> None:
        self.repository = repository

    async def get_wallet_summary(
        self,
        customer_id: UUID,
    ) -> dict[str, Any]:
        try:
            wallet = await self.repository.get_or_create_wallet(
                customer_id=customer_id,
            )
        except SQLAlchemyError as exc:
            raise AppError(
                "WALLET_LOAD_FAILED",
                "Unable to load your wallet.",
                500,
            ) from exc

        if wallet is None:
            raise AppError(
                "WALLET_UNAVAILABLE",
                "The wallet is unavailable for this account.",
                403,
            )

        return wallet

    async def get_wallet_transactions(
        self,
        customer_id: UUID,
        limit: int,
        offset: int,
    ) -> dict[str, Any]:
        wallet = await self.get_wallet_summary(
            customer_id=customer_id,
        )

        try:
            page = await self.repository.list_transactions(
                wallet_id=wallet["walletId"],
                limit=limit,
                offset=offset,
            )
        except SQLAlchemyError as exc:
            raise AppError(
                "WALLET_HISTORY_LOAD_FAILED",
                "Unable to load wallet transaction history.",
                500,
            ) from exc

        return {
            "walletId": wallet["walletId"],
            "items": page["items"],
            "total": page["total"],
            "limit": limit,
            "offset": offset,
        }