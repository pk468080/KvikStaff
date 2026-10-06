from typing import Any
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import AppError
from app.modules.chat.repository import ChatRepository


class ChatService:
    def __init__(self, repository: ChatRepository) -> None:
        self.repository = repository

    async def get_or_create_customer_booking_chat(
        self,
        customer_id: UUID,
        booking_id: UUID,
        worker_id: UUID,
        occurrence_id: UUID | None,
    ) -> dict[str, Any]:
        try:
            return await self.repository.get_or_create_customer_booking_chat(
                customer_id=customer_id,
                booking_id=booking_id,
                worker_id=worker_id,
                occurrence_id=occurrence_id,
            )
        except ValueError as exc:
            raise AppError(
                "CHAT_OPEN_FAILED",
                str(exc),
                400,
            ) from exc
        except SQLAlchemyError as exc:
            raise AppError(
                "CHAT_OPEN_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    async def get_customer_chat_messages(
        self,
        customer_id: UUID,
        conversation_id: UUID,
    ) -> list[dict[str, Any]]:
        try:
            return await self.repository.get_customer_chat_messages(
                customer_id=customer_id,
                conversation_id=conversation_id,
            )
        except ValueError as exc:
            raise AppError(
                "CHAT_LOAD_FAILED",
                str(exc),
                404,
            ) from exc
        except SQLAlchemyError as exc:
            raise AppError(
                "CHAT_LOAD_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    async def send_customer_chat_message(
        self,
        customer_id: UUID,
        conversation_id: UUID,
        body: str,
    ) -> dict[str, Any]:
        try:
            return await self.repository.send_customer_chat_message(
                customer_id=customer_id,
                conversation_id=conversation_id,
                body=body,
            )
        except ValueError as exc:
            raise AppError(
                "CHAT_SEND_FAILED",
                str(exc),
                404,
            ) from exc
        except SQLAlchemyError as exc:
            raise AppError(
                "CHAT_SEND_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    @staticmethod
    def _database_message(exc: SQLAlchemyError) -> str:
        original = getattr(exc, "orig", None)
        message = str(original or exc).strip()
        return message or "Unable to complete the chat operation."
