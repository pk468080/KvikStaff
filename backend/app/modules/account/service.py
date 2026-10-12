from typing import Any
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import AppError
from app.modules.account.repository import (
    AccountDeletionRepository,
)


class AccountDeletionService:
    def __init__(
        self,
        repository: AccountDeletionRepository,
    ) -> None:
        self.repository = repository

    async def get_latest_request(
        self,
        customer_id: UUID,
    ) -> dict[str, Any] | None:
        try:
            return await self.repository.get_latest_request(
                customer_id,
            )
        except SQLAlchemyError as exc:
            raise AppError(
                "ACCOUNT_DELETION_STATUS_LOAD_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    async def request_account_deletion(
        self,
        customer_id: UUID,
        reason: str | None,
    ) -> dict[str, Any]:
        try:
            return await self.repository.request_account_deletion(
                customer_id=customer_id,
                reason=reason,
            )
        except ValueError as exc:
            raise AppError(
                "ACCOUNT_DELETION_REQUEST_FAILED",
                str(exc),
                400,
            ) from exc
        except SQLAlchemyError as exc:
            raise AppError(
                "ACCOUNT_DELETION_REQUEST_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    @staticmethod
    def _database_message(
        exc: SQLAlchemyError,
    ) -> str:
        original = getattr(
            exc,
            "orig",
            None,
        )

        message = str(
            original or exc
        ).strip()

        return (
            message
            or "Unable to complete the account deletion operation."
        )