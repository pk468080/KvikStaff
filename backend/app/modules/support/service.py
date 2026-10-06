from typing import Any
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import AppError
from app.modules.support.repository import SupportRepository


class SupportService:
    def __init__(self, repository: SupportRepository) -> None:
        self.repository = repository

    async def create_customer_support_ticket(
        self,
        customer_id: UUID,
        category: str,
        subject: str,
        description: str,
        booking_id: UUID | None,
        payment_id: UUID | None,
        worker_id: UUID | None,
        refund_request_id: UUID | None,
        payment_refund_id: UUID | None,
    ) -> dict[str, Any]:
        try:
            return await self.repository.create_customer_support_ticket(
                customer_id=customer_id,
                category=category,
                subject=subject,
                description=description,
                booking_id=booking_id,
                payment_id=payment_id,
                worker_id=worker_id,
                refund_request_id=refund_request_id,
                payment_refund_id=payment_refund_id,
            )
        except ValueError as exc:
            raise AppError("SUPPORT_TICKET_CREATE_FAILED", str(exc), 400) from exc
        except SQLAlchemyError as exc:
            raise AppError(
                "SUPPORT_TICKET_CREATE_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    async def get_customer_support_tickets(
        self,
        customer_id: UUID,
    ) -> list[dict[str, Any]]:
        try:
            return await self.repository.get_customer_support_tickets(customer_id)
        except SQLAlchemyError as exc:
            raise AppError(
                "SUPPORT_TICKETS_LOAD_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    @staticmethod
    def _database_message(exc: SQLAlchemyError) -> str:
        original = getattr(exc, "orig", None)
        message = str(original or exc).strip()
        return message or "Unable to complete the support operation."
