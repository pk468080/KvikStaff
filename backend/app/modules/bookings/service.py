from datetime import datetime, timezone
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


OCCURRENCE_LIFECYCLE_STATUSES = {
    "assigned",
    "on_the_way",
    "arrived",
    "in_progress",
}

OCCURRENCE_STATUS_PRIORITY = {
    "assigned": 1,
    "on_the_way": 2,
    "arrived": 3,
    "in_progress": 4,
}


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

    async def list_customer_bookings(
        self,
        customer_id: UUID,
    ) -> list[dict[str, Any]]:
        try:
            bookings = (
                await self.repository.get_customer_bookings(
                    customer_id
                )
            )

            recurring_booking_ids = [
                UUID(str(booking["id"]))
                for booking in bookings
                if booking.get("fulfillment_type")
                == "recurring"
            ]

            for booking in bookings:
                booking["active_occurrence"] = None

            for booking_id in recurring_booking_ids:
                occurrence_rows = (
                    await self.repository.get_customer_booking_occurrences(
                        customer_id=customer_id,
                        booking_id=booking_id,
                    )
                )

                active_occurrence = (
                    self.select_preferred_occurrence(
                        occurrence_rows
                    )
                )

                if active_occurrence is None:
                    continue

                for booking in bookings:
                    if (
                        UUID(str(booking["id"]))
                        == booking_id
                    ):
                        self.apply_active_occurrence(
                            booking,
                            active_occurrence,
                        )
                        booking[
                            "active_occurrence"
                        ] = active_occurrence
                        break

            return bookings

        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "BOOKINGS_LOAD_FAILED",
                self._error_message(
                    exc,
                    "Unable to load bookings.",
                ),
                400,
            ) from exc

    async def get_customer_booking(
        self,
        booking_id: UUID,
        customer_id: UUID,
    ) -> dict[str, Any]:
        try:
            booking = (
                await self.repository.get_customer_booking(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )
            )

            if booking is None:
                raise AppError(
                    "BOOKING_NOT_FOUND",
                    "Booking not found.",
                    404,
                )

            booking["active_occurrence"] = None

            if (
                booking.get("fulfillment_type")
                == "recurring"
            ):
                occurrences = (
                    await self.repository.get_customer_booking_occurrences(
                        customer_id=customer_id,
                        booking_id=booking_id,
                    )
                )

                active_occurrence = (
                    self.select_preferred_occurrence(
                        occurrences
                    )
                )

                if active_occurrence is not None:
                    self.apply_active_occurrence(
                        booking,
                        active_occurrence,
                    )
                    booking[
                        "active_occurrence"
                    ] = active_occurrence

            return booking

        except AppError:
            raise
        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "BOOKING_LOAD_FAILED",
                self._error_message(
                    exc,
                    "Unable to load booking.",
                ),
                400,
            ) from exc

    async def get_customer_booking_occurrences(
        self,
        booking_id: UUID,
        customer_id: UUID,
    ) -> list[dict[str, Any]]:
        try:
            booking = (
                await self.repository.get_customer_booking(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )
            )

            if booking is None:
                raise AppError(
                    "BOOKING_NOT_FOUND",
                    "Booking not found.",
                    404,
                )

            return (
                await self.repository.get_customer_booking_occurrences(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )
            )

        except AppError:
            raise
        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "BOOKING_OCCURRENCES_FAILED",
                self._error_message(
                    exc,
                    "Unable to load booking occurrences.",
                ),
                400,
            ) from exc

    async def get_customer_active_booking_occurrence(
        self,
        booking_id: UUID,
        customer_id: UUID,
    ) -> dict[str, Any] | None:
        try:
            booking = (
                await self.repository.get_customer_booking(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )
            )

            if booking is None:
                raise AppError(
                    "BOOKING_NOT_FOUND",
                    "Booking not found.",
                    404,
                )

            if (
                booking.get("fulfillment_type")
                != "recurring"
            ):
                return None

            occurrences = (
                await self.repository.get_customer_booking_occurrences(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )
            )

            return self.select_preferred_occurrence(
                occurrences
            )

        except AppError:
            raise
        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "ACTIVE_OCCURRENCE_FAILED",
                self._error_message(
                    exc,
                    "Unable to load the active occurrence.",
                ),
                400,
            ) from exc

    async def get_customer_booking_status_history(
        self,
        booking_id: UUID,
        customer_id: UUID,
    ) -> list[dict[str, Any]]:
        try:
            booking = (
                await self.repository.get_customer_booking(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )
            )

            if booking is None:
                raise AppError(
                    "BOOKING_NOT_FOUND",
                    "Booking not found.",
                    404,
                )

            return self.sort_status_history(
                await self.repository.get_customer_booking_history(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )
            )

        except AppError:
            raise
        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "BOOKING_HISTORY_FAILED",
                self._error_message(
                    exc,
                    "Unable to load booking history.",
                ),
                400,
            ) from exc

    async def get_customer_booking_latest_worker_location(
        self,
        booking_id: UUID,
        customer_id: UUID,
    ) -> dict[str, Any] | None:
        try:
            booking = (
                await self.repository.get_customer_booking(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )
            )

            if booking is None:
                raise AppError(
                    "BOOKING_NOT_FOUND",
                    "Booking not found.",
                    404,
                )

            return (
                await self.repository.get_customer_booking_latest_worker_location(
                    customer_id=customer_id,
                    booking_id=booking_id,
                )
            )

        except AppError:
            raise
        except (ValueError, SQLAlchemyError) as exc:
            raise AppError(
                "BOOKING_LOCATION_FAILED",
                self._error_message(
                    exc,
                    "Unable to load worker location.",
                ),
                400,
            ) from exc

    async def create_customer_booking_otp(
        self,
        booking_id: UUID,
        customer_id: UUID,
        otp_type: str,
        occurrence_id: UUID | None,
    ) -> dict[str, Any]:
        try:
            return (
                await self.repository.create_customer_booking_otp(
                    customer_id=customer_id,
                    booking_id=booking_id,
                    otp_type=otp_type,
                    occurrence_id=occurrence_id,
                )
            )
        except ValueError as exc:
            message = str(exc)

            status = (
                404
                if "not found" in message.lower()
                else 409
                if (
                    "can only be generated"
                    in message.lower()
                    or "assignment is invalid"
                    in message.lower()
                )
                else 400
            )

            raise AppError(
                "BOOKING_OTP_FAILED",
                message,
                status,
            ) from exc
        except SQLAlchemyError as exc:
            raise AppError(
                "BOOKING_OTP_FAILED",
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
                reason=request.reason
                or "Customer cancellation",
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
    def apply_active_occurrence(
        booking: dict[str, Any],
        occurrence: dict[str, Any],
    ) -> None:
        occurrence_worker_id = occurrence.get(
            "worker_id"
        )

        if occurrence_worker_id is None:
            return

        booking_worker_id = booking.get(
            "worker_id"
        )

        if (
            booking_worker_id is not None
            and str(occurrence_worker_id)
            != str(booking_worker_id)
        ):
            return

        status = str(
            occurrence.get("status") or ""
        )

        if (
            status
            not in OCCURRENCE_LIFECYCLE_STATUSES
        ):
            return

        booking["status"] = status
        booking["scheduled_start"] = (
            occurrence.get("scheduled_start")
        )
        booking["scheduled_end"] = (
            occurrence.get("scheduled_end")
        )
        booking["journey_started_at"] = (
            occurrence.get("journey_started_at")
        )
        booking["arrived_at"] = (
            occurrence.get("arrived_at")
        )
        booking["started_at"] = (
            occurrence.get("started_at")
        )
        booking["completed_at"] = (
            occurrence.get("completed_at")
        )
        booking["worker_id"] = (
            occurrence_worker_id
        )

    @staticmethod
    def select_preferred_occurrence(
        occurrences: list[dict[str, Any]],
    ) -> dict[str, Any] | None:
        if not occurrences:
            return None

        now = datetime.now(timezone.utc)

        lifecycle = [
            occurrence
            for occurrence in occurrences
            if (
                occurrence.get("worker_id")
                is not None
                and str(
                    occurrence.get("status")
                    or ""
                )
                in OCCURRENCE_LIFECYCLE_STATUSES
            )
        ]

        if lifecycle:
            def lifecycle_key(
                occurrence: dict[str, Any],
            ):
                priority = OCCURRENCE_STATUS_PRIORITY.get(
                    str(
                        occurrence.get("status")
                        or ""
                    ),
                    0,
                )

                scheduled_start = (
                    occurrence.get(
                        "scheduled_start"
                    )
                )

                distance = float("inf")

                if isinstance(
                    scheduled_start,
                    datetime,
                ):
                    start = scheduled_start

                    if start.tzinfo is None:
                        start = start.replace(
                            tzinfo=timezone.utc
                        )

                    distance = abs(
                        (
                            start
                            - now
                        ).total_seconds()
                    )

                return (
                    -priority,
                    distance,
                )

            return sorted(
                lifecycle,
                key=lifecycle_key,
            )[0]

        future = []

        for occurrence in occurrences:
            scheduled_start = occurrence.get(
                "scheduled_start"
            )

            if not isinstance(
                scheduled_start,
                datetime,
            ):
                continue

            start = scheduled_start

            if start.tzinfo is None:
                start = start.replace(
                    tzinfo=timezone.utc
                )

            if start >= now:
                future.append(
                    occurrence
                )

        if future:
            return sorted(
                future,
                key=lambda occurrence: (
                    occurrence.get(
                        "scheduled_start"
                    )
                )
            )[0]

        return sorted(
            occurrences,
            key=lambda occurrence: (
                occurrence.get(
                    "scheduled_start"
                )
                or datetime.min.replace(
                    tzinfo=timezone.utc
                )
            ),
            reverse=True,
        )[0]

    @staticmethod
    def sort_status_history(
        history: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        if len(history) <= 1:
            return history

        items = sorted(
            history,
            key=lambda item: (
                item.get("created_at")
                or datetime.min.replace(
                    tzinfo=timezone.utc
                ),
                str(item.get("id") or ""),
            ),
        )

        result: list[dict[str, Any]] = []
        previous_status: str | None = None
        cursor = 0

        while cursor < len(items):
            first = items[cursor]
            first_time = first.get("created_at")

            group: list[dict[str, Any]] = []

            while cursor < len(items):
                current = items[cursor]

                if current.get(
                    "created_at"
                ) != first_time:
                    break

                group.append(current)
                cursor += 1

            remaining = list(group)

            while remaining:
                next_index = -1

                if previous_status is not None:
                    for index, item in enumerate(
                        remaining
                    ):
                        if (
                            item.get("old_status")
                            == previous_status
                        ):
                            next_index = index
                            break
                else:
                    for index, item in enumerate(
                        remaining
                    ):
                        if (
                            item.get("old_status")
                            is None
                        ):
                            next_index = index
                            break

                if next_index == -1:
                    remaining.sort(
                        key=lambda item: str(
                            item.get("id") or ""
                        )
                    )

                    result.extend(
                        remaining
                    )

                    if remaining:
                        previous_status = (
                            remaining[-1].get(
                                "new_status"
                            )
                        )

                    remaining.clear()
                    break

                selected = remaining.pop(
                    next_index
                )

                result.append(selected)
                previous_status = selected.get(
                    "new_status"
                )

        return result

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
            return "Unable to complete the booking operation."

        return message

    @staticmethod
    def _error_message(
        exc: Exception,
        fallback: str,
    ) -> str:
        message = str(exc).strip()

        return message or fallback