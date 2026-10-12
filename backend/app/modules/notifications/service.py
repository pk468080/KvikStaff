import re
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import AppError
from app.modules.notifications.repository import (
    NotificationsRepository,
)
from app.modules.notifications.schemas import (
    CustomerNotificationResponse,
    CustomerPushTokenResponse,
)


_EXPO_PUSH_TOKEN_PATTERN = re.compile(
    r"^ExponentPushToken\[[^\]]+\]$"
)


class NotificationsService:
    def __init__(
        self,
        repository: NotificationsRepository,
    ) -> None:
        self.repository = repository

    async def get_customer_notifications(
        self,
        customer_id: UUID,
        limit: int = 100,
    ) -> list[CustomerNotificationResponse]:
        safe_limit = min(
            max(limit, 1),
            100,
        )

        try:
            rows = (
                await self.repository
                .get_customer_notifications(
                    customer_id=customer_id,
                    limit=safe_limit,
                )
            )

            return [
                CustomerNotificationResponse(
                    id=str(row["id"]),
                    booking_id=(
                        str(row["booking_id"])
                        if row.get("booking_id") is not None
                        else None
                    ),
                    title=str(
                        row["title"]
                    ),
                    message=str(
                        row["message"]
                    ),
                    notification_type=(
                        str(
                            row["notification_type"]
                        )
                        if row.get("notification_type")
                        is not None
                        else None
                    ),
                    is_read=bool(
                        row["is_read"]
                    ),
                    created_at=str(
                        row["created_at"]
                    ),
                )
                for row in rows
            ]

        except SQLAlchemyError as exc:
            raise AppError(
                "NOTIFICATIONS_LOAD_FAILED",
                self._error_message(
                    exc,
                    "Unable to load notifications.",
                ),
                400,
            ) from exc

    async def mark_customer_notification_read(
        self,
        customer_id: UUID,
        notification_id: UUID,
    ) -> None:
        try:
            await self.repository.mark_customer_notification_read(
                customer_id=customer_id,
                notification_id=notification_id,
            )
        except (
            ValueError,
            SQLAlchemyError,
        ) as exc:
            raise AppError(
                "NOTIFICATION_READ_FAILED",
                self._error_message(
                    exc,
                    "Unable to mark notification as read.",
                ),
                400,
            ) from exc

    async def get_unread_customer_notification_count(
        self,
        customer_id: UUID,
    ) -> int:
        try:
            return (
                await self.repository
                .get_unread_customer_notification_count(
                    customer_id=customer_id,
                )
            )
        except SQLAlchemyError as exc:
            raise AppError(
                "NOTIFICATION_COUNT_FAILED",
                self._error_message(
                    exc,
                    "Unable to load unread notification count.",
                ),
                400,
            ) from exc

    async def register_customer_push_token(
        self,
        customer_id: UUID,
        token: str,
        platform: str | None,
    ) -> CustomerPushTokenResponse:
        normalized_token = token.strip()

        if not _EXPO_PUSH_TOKEN_PATTERN.fullmatch(
            normalized_token
        ):
            raise AppError(
                "INVALID_PUSH_TOKEN",
                "Invalid Expo push token.",
                400,
            )

        normalized_platform = (
            platform.strip().lower()
            if platform
            else None
        )

        if normalized_platform not in {
            None,
            "android",
            "ios",
            "web",
        }:
            raise AppError(
                "INVALID_PUSH_TOKEN_PLATFORM",
                "Invalid push token platform.",
                400,
            )

        try:
            row = (
                await self.repository
                .register_customer_push_token(
                    customer_id=customer_id,
                    token=normalized_token,
                    platform=normalized_platform,
                )
            )

            if str(
                row.get("user_id")
            ) != str(customer_id):
                raise AppError(
                    "PUSH_TOKEN_ACCOUNT_MISMATCH",
                    "Push token registration belongs to a different customer account.",
                    403,
                )

            return CustomerPushTokenResponse(
                id=str(row["id"]),
                user_id=str(
                    row["user_id"]
                ),
                token=str(row["token"]),
                platform=(
                    str(row["platform"])
                    if row.get("platform") is not None
                    else None
                ),
                is_active=bool(
                    row["is_active"]
                ),
                created_at=str(
                    row["created_at"]
                ),
                updated_at=str(
                    row["updated_at"]
                ),
            )

        except AppError:
            raise

        except (
            ValueError,
            SQLAlchemyError,
        ) as exc:
            raise AppError(
                "PUSH_TOKEN_REGISTRATION_FAILED",
                self._error_message(
                    exc,
                    "Customer push token could not be registered.",
                ),
                400,
            ) from exc

    async def deactivate_customer_push_tokens(
        self,
        customer_id: UUID,
    ) -> None:
        try:
            await (
                self.repository
                .deactivate_customer_push_tokens(
                    customer_id=customer_id,
                )
            )
        except SQLAlchemyError as exc:
            raise AppError(
                "PUSH_TOKEN_DEACTIVATION_FAILED",
                self._error_message(
                    exc,
                    "Unable to deactivate customer push tokens.",
                ),
                400,
            ) from exc

    @staticmethod
    def _error_message(
        exc: Exception,
        fallback: str,
    ) -> str:
        message = str(exc).strip()

        return (
            message
            or fallback
        )