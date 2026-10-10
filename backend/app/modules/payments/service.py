import hashlib
import hmac
import json
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.core.config import settings
from app.core.exceptions import AppError
from app.integrations.razorpay import (
    RazorpayApiError,
    RazorpayClient,
)
from app.modules.payments.repository import (
    PaymentsRepository,
)


class PaymentsService:
    def __init__(
        self,
        repository: PaymentsRepository,
    ) -> None:
        self.repository = repository

        if (
            settings.razorpay_key_id
            and settings.razorpay_key_secret
        ):
            self.razorpay = RazorpayClient(
                key_id=settings.razorpay_key_id,
                key_secret=settings.razorpay_key_secret,
            )
        else:
            self.razorpay = None

    async def get_booking_payment_details(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> dict[str, Any]:
        booking = await self.repository.get_customer_booking(
            customer_id=customer_id,
            booking_id=booking_id,
        )

        if booking is None:
            raise AppError(
                "BOOKING_NOT_FOUND",
                "Booking not found.",
                404,
            )

        amount = self._decimal(
            booking.get("total_amount")
        )

        if amount <= 0:
            raise AppError(
                "INVALID_PAYMENT_AMOUNT",
                "The booking payment amount is invalid.",
                400,
            )

        currency = self._booking_currency(
            booking.get("pricing_snapshot")
        )

        if not currency:
            raise AppError(
                "MISSING_PAYMENT_CURRENCY",
                "The booking payment currency is missing.",
                400,
            )

        total_working_hours = self._decimal(
            booking.get("total_working_hours")
        )

        if total_working_hours <= 0:
            raise AppError(
                "INVALID_WORKING_HOURS",
                "The booking working hours are invalid.",
                400,
            )

        fulfillment_type = str(
            booking.get("fulfillment_type")
        )

        if fulfillment_type in {
            "instant",
            "scheduled",
        }:
            occurrence_count = 1
        elif fulfillment_type == "recurring":
            occurrence_count = (
                self._count_occurrences(
                    booking
                )
            )
        else:
            raise AppError(
                "UNSUPPORTED_PAYMENT_BOOKING",
                "This booking type is not supported for Razorpay payments.",
                400,
            )

        return {
            "bookingId": booking["id"],
            "amount": amount,
            "currency": currency,
            "occurrenceCount": occurrence_count,
            "totalWorkingHours": total_working_hours,
        }

    async def mark_payment_failed(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> dict[str, Any]:
        try:
            status_value = (
                await self.repository.mark_payment_failed(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )
            )
        except SQLAlchemyError as exc:
            raise AppError(
                "PAYMENT_STATUS_UPDATE_FAILED",
                self._error_message(
                    exc,
                    "Unable to update the booking payment status.",
                ),
                500,
            ) from exc

        if status_value is None:
            raise AppError(
                "BOOKING_NOT_FOUND",
                "Booking not found.",
                404,
            )

        return {
            "success": True,
            "bookingId": booking_id,
            "status": status_value,
        }

    async def create_order(
        self,
        customer_id: UUID,
        booking_id: UUID,
    ) -> dict[str, Any]:
        razorpay = self._require_razorpay()


        booking = await self.repository.get_customer_booking(
            customer_id=customer_id,
            booking_id=booking_id,
            for_update=True,
        )


        if booking is None:
            raise AppError(
                "BOOKING_NOT_FOUND",
                "Booking not found.",
                404,
            )

        fulfillment_type = str(
            booking.get("fulfillment_type")
        )

        if fulfillment_type not in {
            "instant",
            "scheduled",
            "recurring",
        }:
            raise AppError(
                "UNSUPPORTED_PAYMENT_BOOKING",
                "This booking type is not supported for Razorpay payments.",
                400,
            )

        status_value = str(
            booking.get("status")
        )

        if fulfillment_type in {
            "instant",
            "scheduled",
        } and status_value in {
            "pending_payment",
            "payment_failed",
        }:
            scheduled_start = booking.get(
                "scheduled_start"
            )

            if (
                isinstance(
                    scheduled_start,
                    datetime,
                )
                and scheduled_start
                <= datetime.now(timezone.utc)
            ):
                await self.repository.expire_payment_booking(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )

                raise AppError(
                    "BOOKING_EXPIRED",
                    "This booking has expired because its scheduled time has passed.",
                    409,
                )

        if status_value == "paid":
            payment = (
                await self.repository.get_latest_payment(
                    booking_id
                )
            )

            return {
                "success": True,
                "alreadyPaid": True,
                "bookingId": booking_id,
                "status": "paid",
                "paymentId": (
                    payment.get("provider_payment_id")
                    if payment
                    else None
                ),
            }

        if status_value not in {
            "pending_payment",
            "payment_failed",
        }:
            raise AppError(
                "BOOKING_NOT_PAYABLE",
                "This booking is not available for payment.",
                409,
            )

        amount = self._decimal(
            booking.get("total_amount")
        )

        if amount <= 0:
            raise AppError(
                "INVALID_PAYMENT_AMOUNT",
                "Booking has an invalid payment amount.",
                400,
            )

        currency = self._booking_currency(
            booking.get("pricing_snapshot")
        )

        if not currency:
            raise AppError(
                "MISSING_PAYMENT_CURRENCY",
                "Booking payment currency is missing.",
                400,
            )

        if status_value == "payment_failed":
           
            await self.repository.reset_payment_failed(
                customer_id=customer_id,
                booking_id=booking_id,
                commit=False,
            )


        existing_payment = (
            await self.repository.get_latest_payment(
                booking_id
            )
        )

        if existing_payment is not None:
            existing_amount = self._decimal(
                existing_payment.get("amount")
            )

            existing_currency = str(
                existing_payment.get("currency")
            )

            if (
                existing_amount != amount
                or existing_currency != currency
            ):
                raise AppError(
                    "PAYMENT_AMOUNT_MISMATCH",
                    "Existing payment does not match the booking amount.",
                    409,
                )

            existing_order_id = (
                existing_payment.get(
                    "provider_order_id"
                )
            )

            if (
                isinstance(
                    existing_order_id,
                    str,
                )
                and existing_order_id
            ):
                try:
                    order_payments = (
                        await razorpay.list_order_payments(
                            existing_order_id
                        )
                    )
                except RazorpayApiError as exc:
                    raise AppError(
                        "RAZORPAY_ORDER_LOOKUP_FAILED",
                        exc.message,
                        502,
                    ) from exc

                captured_payment = next(
                    (
                        payment
                        for payment in order_payments
                        if payment.get("status")
                        == "captured"
                    ),
                    None,
                )

                if captured_payment is not None:
                    provider_payment_id = (
                        captured_payment.get("id")
                    )

                    if not isinstance(
                        provider_payment_id,
                        str,
                    ) or not provider_payment_id:
                        raise AppError(
                            "INVALID_RAZORPAY_PAYMENT",
                            "Razorpay returned an invalid captured payment.",
                            502,
                        )

                    finalization = (
                        await self._finalize_captured_payment(
                            existing_payment,
                            provider_payment_id,
                            captured_payment.get(
                                "created_at"
                            ),
                        )
                    )

                    return {
                        "success": True,
                        "alreadyPaid": True,
                        "bookingId": booking_id,
                        "paymentId":
                            provider_payment_id,
                        "status":
                            finalization.get(
                                "booking_status"
                            )
                            or "paid",
                        "assigned":
                            finalization.get(
                                "assigned",
                                False,
                            ),
                        "workerId":
                            self._uuid_or_none(
                                finalization.get(
                                    "worker_id"
                                )
                            ),
                    }
                await self.repository.commit_transaction()               

                return {
                    "success": True,
                    "keyId":
                        settings.razorpay_key_id
                        or "",
                    "orderId":
                        existing_order_id,
                    "amount":
                        self._to_paise(
                            amount
                        ),
                    "currency":
                        currency,
                    "bookingId":
                        booking_id,
                }

        amount_paise = self._to_paise(
            amount
        )

        try:
            razorpay_order = (
                await razorpay.create_order(
                    amount_paise=amount_paise,
                    currency=currency,
                    receipt=f"ts_{booking_id}",
                    notes={
                        "KvikStaff_booking_id":
                            str(booking_id),
                        "fulfillment_type":
                            fulfillment_type,
                    },
                )
            )
        except RazorpayApiError as exc:
            await self.repository.mark_payment_failed(
                customer_id=customer_id,
                booking_id=booking_id,
            )

            raise AppError(
                "RAZORPAY_ORDER_FAILED",
                exc.message,
                502,
            ) from exc

        provider_order_id = (
            razorpay_order.get("id")
        )

        if (
            not isinstance(
                provider_order_id,
                str,
            )
            or not provider_order_id
        ):
            await self.repository.mark_payment_failed(
                customer_id=customer_id,
                booking_id=booking_id,
            )

            raise AppError(
                "RAZORPAY_ORDER_INVALID",
                "Razorpay returned an invalid order.",
                502,
            )

        try:
            payment = (
                await self.repository.insert_payment_if_missing(
                    booking_id=booking_id,
                    provider_order_id=
                        provider_order_id,
                    amount=amount,
                    currency=currency,
                )
            )
        except SQLAlchemyError as exc:
            raise AppError(
                "PAYMENT_RECORD_FAILED",
                self._error_message(
                    exc,
                    "Unable to create payment record.",
                ),
                500,
            ) from exc
        except ValueError as exc:
            raise AppError(
                "PAYMENT_RECORD_FAILED",
                str(exc),
                500,
            ) from exc

        final_order_id = (
            payment.get("provider_order_id")
            or provider_order_id
        )

        return {
            "success": True,
            "keyId":
                settings.razorpay_key_id
                or "",
            "orderId":
                final_order_id,
            "amount":
                int(
                    razorpay_order.get(
                        "amount",
                        amount_paise,
                    )
                ),
            "currency":
                str(
                    razorpay_order.get(
                        "currency",
                        currency,
                    )
                ),
            "receipt":
                razorpay_order.get(
                    "receipt"
                ),
            "bookingId":
                booking_id,
        }

    async def verify_payment(
        self,
        customer_id: UUID,
        booking_id: UUID,
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str,
    ) -> dict[str, Any]:
        razorpay = self._require_razorpay()

        booking = await self.repository.get_customer_booking(
            customer_id=customer_id,
            booking_id=booking_id,
        )

        if booking is None:
            raise AppError(
                "BOOKING_NOT_FOUND",
                "Booking not found.",
                404,
            )

        fulfillment_type = str(
            booking.get("fulfillment_type")
        )

        if fulfillment_type not in {
            "instant",
            "scheduled",
            "recurring",
        }:
            raise AppError(
                "UNSUPPORTED_PAYMENT_BOOKING",
                "This booking type is not supported for Razorpay payments.",
                400,
            )

        payment = (
            await self.repository.get_payment_by_order(
                customer_id=customer_id,
                booking_id=booking_id,
                provider_order_id=
                    razorpay_order_id,
            )
        )

        if payment is None:
            raise AppError(
                "PAYMENT_ORDER_NOT_FOUND",
                "Payment order was not found.",
                404,
            )

        if (
            payment.get("status") == "paid"
            and payment.get(
                "provider_payment_id"
            ) == razorpay_payment_id
        ):
            return {
                "success": True,
                "bookingId": booking_id,
                "paymentId":
                    razorpay_payment_id,
                "status": "paid",
            }

        expected_amount = self._decimal(
            booking.get("total_amount")
        )

        payment_amount = self._decimal(
            payment.get("amount")
        )

        if (
            expected_amount <= 0
            or payment_amount <= 0
        ):
            raise AppError(
                "INVALID_PAYMENT_AMOUNT",
                "The booking payment amount is invalid.",
                400,
            )

        if (
            self._to_paise(
                expected_amount
            )
            != self._to_paise(
                payment_amount
            )
        ):
            raise AppError(
                "PAYMENT_AMOUNT_MISMATCH",
                "Payment amount does not match booking amount.",
                409,
            )

        expected_currency = (
            self._booking_currency(
                booking.get(
                    "pricing_snapshot"
                )
            )
        )

        if not expected_currency:
            raise AppError(
                "MISSING_PAYMENT_CURRENCY",
                "The booking payment currency is missing.",
                400,
            )

        if (
            str(
                payment.get("currency")
            )
            != expected_currency
        ):
            raise AppError(
                "PAYMENT_CURRENCY_MISMATCH",
                "Payment currency does not match booking currency.",
                409,
            )

        if not self._verify_signature(
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        ):
            raise AppError(
                "INVALID_RAZORPAY_SIGNATURE",
                "Invalid Razorpay payment signature.",
                400,
            )

        try:
            razorpay_payment = (
                await razorpay.get_payment(
                    razorpay_payment_id
                )
            )
        except RazorpayApiError as exc:
            raise AppError(
                "RAZORPAY_PAYMENT_LOOKUP_FAILED",
                exc.message,
                502,
            ) from exc

        if (
            razorpay_payment.get("order_id")
            != razorpay_order_id
        ):
            raise AppError(
                "RAZORPAY_ORDER_MISMATCH",
                "Razorpay payment does not belong to this order.",
                409,
            )

        if (
            razorpay_payment.get("currency")
            != expected_currency
        ):
            raise AppError(
                "RAZORPAY_CURRENCY_MISMATCH",
                "Razorpay currency does not match booking currency.",
                409,
            )

        razorpay_amount = self._integer_amount(
            razorpay_payment.get("amount")
        )

        if (
            razorpay_amount
            != self._to_paise(
                expected_amount
            )
        ):
            raise AppError(
                "RAZORPAY_AMOUNT_MISMATCH",
                "Razorpay amount does not match booking amount.",
                409,
            )

        provider_status = str(
            razorpay_payment.get(
                "status",
                ""
            )
        )

        if provider_status == "authorized":
            return {
                "success": True,
                "paymentPending": True,
                "bookingId": booking_id,
                "paymentId":
                    razorpay_payment_id,
                "status": "authorized",
            }

        if provider_status != "captured":
            message = (
                "Razorpay payment failed."
                if provider_status == "failed"
                else
                "Razorpay payment is still being processed."
            )

            raise AppError(
                "RAZORPAY_PAYMENT_NOT_CAPTURED",
                message,
                409,
            )

        finalization = (
            await self._finalize_captured_payment(
                payment,
                razorpay_payment_id,
                razorpay_payment.get(
                    "created_at"
                ),
            )
        )

        return {
            "success": True,
            "bookingId": booking_id,
            "paymentId":
                razorpay_payment_id,
            "status":
                str(
                    finalization.get(
                        "booking_status"
                    )
                    or "paid"
                ),
            "paymentPending": False,
        }

    async def _finalize_captured_payment(
        self,
        payment: dict[str, Any],
        provider_payment_id: str,
        created_at: Any,
    ) -> dict[str, Any]:
        try:
            finalization = (
                await self.repository.finalize_razorpay_payment(
                    payment_id=payment["id"],
                    provider_payment_id=
                        provider_payment_id,
                    paid_at=self._paid_at(
                        created_at
                    ),
                )
            )
        except (
            ValueError,
            SQLAlchemyError,
        ) as exc:
            raise AppError(
                "PAYMENT_FINALIZATION_FAILED",
                self._error_message(
                    exc,
                    "Payment was verified, but could not be finalized.",
                ),
                500,
            ) from exc

        if (
            finalization.get("success")
            is not True
        ):
            raise AppError(
                "PAYMENT_FINALIZATION_FAILED",
                "Payment was verified, but could not be finalized.",
                500,
            )

        return finalization

    def _require_razorpay(
        self,
    ) -> RazorpayClient:
        if self.razorpay is None:
            raise AppError(
                "RAZORPAY_NOT_CONFIGURED",
                "Razorpay is not configured on the server.",
                500,
            )

        return self.razorpay

    @staticmethod
    def _decimal(
        value: Any,
    ) -> Decimal:
        if value is None:
            return Decimal("0")

        try:
            if isinstance(
                value,
                Decimal,
            ):
                return value

            return Decimal(
                str(value)
            )
        except (
            InvalidOperation,
            TypeError,
            ValueError,
        ):
            return Decimal("0")

    @staticmethod
    def _to_paise(
        amount: Decimal,
    ) -> int:
        value = (
            amount * Decimal("100")
        ).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )

        result = int(value)

        if result <= 0:
            raise AppError(
                "INVALID_PAYMENT_AMOUNT",
                "Invalid payment amount.",
                400,
            )

        return result

    @staticmethod
    def _integer_amount(
        value: Any,
    ) -> int:
        if isinstance(
            value,
            bool,
        ):
            raise AppError(
                "INVALID_RAZORPAY_AMOUNT",
                "Razorpay returned an invalid payment amount.",
                502,
            )

        try:
            result = int(value)
        except (
            TypeError,
            ValueError,
        ) as exc:
            raise AppError(
                "INVALID_RAZORPAY_AMOUNT",
                "Razorpay returned an invalid payment amount.",
                502,
            ) from exc

        if result <= 0:
            raise AppError(
                "INVALID_RAZORPAY_AMOUNT",
                "Razorpay returned an invalid payment amount.",
                502,
            )

        return result

    @staticmethod
    def _booking_currency(
        pricing_snapshot: Any,
    ) -> str | None:
        value = pricing_snapshot

        if isinstance(
            value,
            str,
        ):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                return None

        if not isinstance(
            value,
            dict,
        ):
            return None

        currency = value.get(
            "currency"
        )

        if not isinstance(
            currency,
            str,
        ):
            return None

        currency = currency.strip()

        return currency or None

    @staticmethod
    def _count_occurrences(
        booking: dict[str, Any],
    ) -> int:
        start_date = booking.get(
            "schedule_start_date"
        )

        end_date = booking.get(
            "schedule_end_date"
        )

        selected_weekdays = booking.get(
            "selected_weekdays"
        )

        off_dates = booking.get(
            "off_dates"
        )

        if not isinstance(
            start_date,
            date,
        ) or not isinstance(
            end_date,
            date,
        ):
            raise AppError(
                "INVALID_BOOKING_SCHEDULE",
                "The booking schedule is incomplete.",
                400,
            )

        if start_date > end_date:
            raise AppError(
                "INVALID_BOOKING_SCHEDULE",
                "The booking schedule is invalid.",
                400,
            )

        weekdays: set[int] = set()

        for day in (
            selected_weekdays or []
        ):
            try:
                weekdays.add(
                    int(day)
                )
            except (
                TypeError,
                ValueError,
            ):
                continue

        if not weekdays:
            raise AppError(
                "INVALID_BOOKING_SCHEDULE",
                "The booking schedule has no selected weekdays.",
                400,
            )

        excluded: set[date] = set()

        for value in (
            off_dates or []
        ):
            if isinstance(
                value,
                date,
            ):
                excluded.add(
                    value
                )

        count = 0
        cursor = start_date

        while cursor <= end_date:
            # PostgreSQL/JavaScript weekday numbering:
            # Sunday=0 ... Saturday=6.
            day_of_week = (
                cursor.weekday() + 1
            ) % 7

            if (
                day_of_week in weekdays
                and cursor not in excluded
            ):
                count += 1

            cursor = date.fromordinal(
                cursor.toordinal() + 1
            )

        if count <= 0:
            raise AppError(
                "INVALID_BOOKING_SCHEDULE",
                "The booking has no payable occurrences.",
                400,
            )

        return count

    @staticmethod
    def _verify_signature(
        order_id: str,
        payment_id: str,
        signature: str,
    ) -> bool:
        secret = (
            settings.razorpay_key_secret
        )

        if not secret:
            return False

        message = (
            f"{order_id}|{payment_id}"
        )

        expected = hmac.new(
            secret.encode("utf-8"),
            message.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(
            expected,
            signature,
        )

    @staticmethod
    def _paid_at(
        created_at: Any,
    ) -> datetime:
        if isinstance(
            created_at,
            (int, float),
        ):
            return datetime.fromtimestamp(
                created_at,
                tz=timezone.utc,
            )

        return datetime.now(
            timezone.utc
        )

    @staticmethod
    def _uuid_or_none(
        value: Any,
    ) -> UUID | None:
        if value is None:
            return None

        try:
            return UUID(
                str(value)
            )
        except (
            TypeError,
            ValueError,
        ):
            return None

    @staticmethod
    def _error_message(
        exc: Exception,
        fallback: str,
    ) -> str:
        message = str(
            exc
        ).strip()

        return message or fallback