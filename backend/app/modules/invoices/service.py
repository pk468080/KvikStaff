from typing import Any
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import AppError
from app.modules.invoices.repository import InvoicesRepository


class InvoicesService:
    def __init__(self, repository: InvoicesRepository) -> None:
        self.repository = repository

    async def get_customer_invoice(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> dict[str, Any]:
        try:
            result = await self.repository.get_customer_invoice(
                customer_id=customer_id,
                booking_id=booking_id,
            )

            if result is None:
                raise AppError(
                    "INVOICE_NOT_FOUND",
                    "Booking not found or unavailable.",
                    404,
                )

            booking = result["booking"]
            payment = result["payment"]

            if booking["status"] != "completed":
                raise AppError(
                    "INVOICE_NOT_AVAILABLE",
                    "A payment receipt is available only for completed bookings.",
                    400,
                )

            if payment is None:
                raise AppError(
                    "PAYMENT_NOT_FOUND",
                    "No valid payment record was found for this booking.",
                    400,
                )

            payment_amount = self._require_money(
                payment["amount"],
                "payment amount",
            )
            total_amount = self._require_money(
                booking["total_amount"],
                "booking total",
            )

            if payment_amount != total_amount:
                raise AppError(
                    "INVOICE_TOTAL_MISMATCH",
                    "The stored payment and booking totals do not match.",
                    409,
                )

            currency = self._require_currency(
                payment["currency"],
            )

            return {
                "invoice_reference": self.create_receipt_reference(
                    booking["id"]
                ),
                "booking_id": booking["id"],
                "payment_id": payment["id"],
                "service_name": (
                    booking["service_name"] or "Service"
                ),
                "booking_type": booking["fulfillment_type"],
                "scheduled_start": booking["scheduled_start"],
                "scheduled_end": booking["scheduled_end"],
                "working_hours": (
                    None
                    if booking["total_working_hours"] is None
                    else self._require_money(
                        booking["total_working_hours"],
                        "working hours",
                    )
                ),
                "completed_at": booking["completed_at"],
                "subtotal": self._require_money(
                    booking["base_amount"],
                    "subtotal",
                ),
                "discount_amount": self._require_money(
                    booking["discount_amount"],
                    "discount",
                ),
                "platform_fee": self._require_money(
                    booking["platform_fee"],
                    "platform fee",
                ),
                "tax_amount": self._require_money(
                    booking["tax_amount"],
                    "tax",
                ),
                "total_amount": total_amount,
                "currency": currency,
                "payment_status": payment["status"],
                "payment_provider": payment["provider"],
                "provider_payment_id": payment["provider_payment_id"],
                "provider_order_id": payment["provider_order_id"],
                "paid_at": payment["paid_at"],
                "created_at": payment["created_at"],
            }
        except AppError:
            raise
        except SQLAlchemyError as exc:
            raise AppError(
                "INVOICE_LOAD_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    @staticmethod
    def create_receipt_reference(
        booking_id: UUID,
    ) -> str:
        return (
            "KvikStaff-REC-"
            f"{str(booking_id)[:8].upper()}"
        )

    @staticmethod
    def _require_money(
        value: Any,
        label: str,
    ) -> float:
        amount = float(value)

        if amount < 0:
            raise AppError(
                "INVALID_INVOICE_DATA",
                f"The stored {label} is invalid.",
                500,
            )

        return amount

    @staticmethod
    def _require_currency(value: Any) -> str:
        if not isinstance(value, str) or not value.strip():
            raise AppError(
                "INVALID_INVOICE_DATA",
                "The stored payment currency is invalid.",
                500,
            )

        return value.strip().upper()

    @staticmethod
    def _database_message(
        exc: SQLAlchemyError,
    ) -> str:
        original = getattr(exc, "orig", None)
        message = str(original or exc).strip()
        return (
            message
            or "Unable to load the payment receipt."
        )
