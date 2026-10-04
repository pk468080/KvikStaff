from datetime import date, datetime, time
from typing import Any
from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError

from app.core.exceptions import AppError
from app.modules.bookings.repository import (
    BookingsRepository,
)
from app.modules.bookings.schemas import (
    CustomerBookingCancellationRequest,
    CustomerBookingOccurrenceCancellationRequest,
    CustomerBookingRescheduleRequest,
    InstantBookingCreateRequest,
    MultiOccurrenceBookingCreateRequest,
)


class BookingsService:
    def __init__(
        self,
        repository: BookingsRepository,
    ) -> None:
        self.repository = repository

    async def create_instant_booking(
        self,
        request: InstantBookingCreateRequest,
        customer_id: UUID,
    ) -> dict[str, Any]:
        try:
            return await self.repository.create_hourly_booking(
                customer_id=customer_id,
                service_variant_id=request.service_variant_id,
                address_id=request.address_id,
                booking_type="instant",
                scheduled_start=request.scheduled_start,
                scheduled_end=request.scheduled_end,
                notes=request.notes,
            )
        except ValueError as exc:
            raise AppError(
                "BOOKING_CREATE_FAILED",
                str(exc),
                400,
            ) from exc
        except SQLAlchemyError as exc:
            raise AppError(
                "BOOKING_CREATE_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    async def create_scheduled_booking(
        self,
        request: MultiOccurrenceBookingCreateRequest,
        customer_id: UUID,
    ) -> dict[str, Any]:
        if (
            request.schedule_start_date
            != request.schedule_end_date
        ):
            raise AppError(
                "INVALID_SCHEDULE",
                "Scheduled booking must use a single date.",
                400,
            )

        try:
            return await (
                self.repository.create_multi_occurrence_booking(
                    customer_id=customer_id,
                    service_variant_id=request.service_variant_id,
                    address_id=request.address_id,
                    schedule_start_date=request.schedule_start_date,
                    schedule_end_date=request.schedule_end_date,
                    daily_start_time=request.daily_start_time,
                    daily_end_time=request.daily_end_time,
                    selected_weekdays=request.selected_weekdays,
                    off_dates=request.off_dates,
                    notes=request.notes,
                    booking_type="scheduled",
                )
            )
        except ValueError as exc:
            raise AppError(
                "BOOKING_CREATE_FAILED",
                str(exc),
                400,
            ) from exc
        except SQLAlchemyError as exc:
            raise AppError(
                "BOOKING_CREATE_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    async def create_recurring_booking(
        self,
        request: MultiOccurrenceBookingCreateRequest,
        customer_id: UUID,
    ) -> dict[str, Any]:
        try:
            return await (
                self.repository.create_multi_occurrence_booking(
                    customer_id=customer_id,
                    service_variant_id=request.service_variant_id,
                    address_id=request.address_id,
                    schedule_start_date=request.schedule_start_date,
                    schedule_end_date=request.schedule_end_date,
                    daily_start_time=request.daily_start_time,
                    daily_end_time=request.daily_end_time,
                    selected_weekdays=request.selected_weekdays,
                    off_dates=request.off_dates,
                    notes=request.notes,
                    booking_type="recurring",
                )
            )
        except ValueError as exc:
            raise AppError(
                "BOOKING_CREATE_FAILED",
                str(exc),
                400,
            ) from exc
        except SQLAlchemyError as exc:
            raise AppError(
                "BOOKING_CREATE_FAILED",
                self._database_message(exc),
                400,
            ) from exc

    async def cancel_booking(
        self,
        booking_id: UUID,
        request: CustomerBookingCancellationRequest,
        customer_id: UUID,
    ) -> dict[str, Any]:
        try:
            return await self.repository.cancel_customer_booking(
                customer_id=customer_id,
                booking_id=booking_id,
                reason=request.reason or "Customer cancellation",
            )
        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "BOOKING_CANCEL_FAILED",
                self._error_message(
                    exc,
                    "Unable to cancel the booking.",
                ),
                400,
            ) from exc

    async def cancel_booking_series(
        self,
        booking_id: UUID,
        request: CustomerBookingCancellationRequest,
        customer_id: UUID,
    ) -> dict[str, Any]:
        try:
            return await (
                self.repository.cancel_customer_booking_series(
                    customer_id=customer_id,
                    booking_id=booking_id,
                    reason=request.reason
                    or "Customer cancellation",
                )
            )
        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "BOOKING_SERIES_CANCEL_FAILED",
                self._error_message(
                    exc,
                    "Unable to cancel the booking series.",
                ),
                400,
            ) from exc

    async def cancel_booking_occurrence(
        self,
        occurrence_id: UUID,
        request: CustomerBookingOccurrenceCancellationRequest,
        customer_id: UUID,
    ) -> dict[str, Any]:
        try:
            return await (
                self.repository.cancel_customer_booking_occurrence(
                    customer_id=customer_id,
                    occurrence_id=occurrence_id,
                    reason=request.reason
                    or "Customer cancellation",
                )
            )
        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "BOOKING_OCCURRENCE_CANCEL_FAILED",
                self._error_message(
                    exc,
                    "Unable to cancel the booking occurrence.",
                ),
                400,
            ) from exc

    async def get_booking_refunds(
        self,
        booking_id: UUID,
        customer_id: UUID,
    ) -> list[dict[str, Any]]:
        try:
            return await self.repository.get_customer_booking_refunds(
                customer_id=customer_id,
                booking_id=booking_id,
            )
        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "BOOKING_REFUNDS_FAILED",
                self._error_message(
                    exc,
                    "Unable to load refund status.",
                ),
                400,
            ) from exc

    async def reschedule_booking(
        self,
        booking_id: UUID,
        request: CustomerBookingRescheduleRequest,
        customer_id: UUID,
    ) -> dict[str, Any]:
        try:
            return await self.repository.reschedule_customer_booking(
                customer_id=customer_id,
                booking_id=booking_id,
                new_start=request.new_start,
                new_end=request.new_end,
            )
        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "BOOKING_RESCHEDULE_FAILED",
                self._error_message(
                    exc,
                    "Unable to reschedule the booking.",
                ),
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

        if not message:
            return "Unable to create the booking."

        return message

    @staticmethod
    def _error_message(
        exc: Exception,
        fallback: str,
    ) -> str:
        message = str(exc).strip()

        return message or fallback