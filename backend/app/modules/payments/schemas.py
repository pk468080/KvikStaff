from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class BookingPaymentDetailsResponse(BaseModel):
    bookingId: UUID
    amount: Decimal
    currency: str
    occurrenceCount: int
    totalWorkingHours: Decimal


class CreateRazorpayOrderRequest(BaseModel):
    booking_id: UUID


class RazorpayOrderResponse(BaseModel):
    success: bool = True
    keyId: str = ""
    orderId: str = ""
    amount: int = 0
    currency: str = ""
    receipt: str | None = None
    bookingId: UUID
    alreadyPaid: bool = False
    paymentPending: bool = False
    paymentId: str | None = None
    status: str | None = None
    assigned: bool | None = None
    workerId: UUID | None = None


class VerifyRazorpayPaymentRequest(BaseModel):
    booking_id: UUID
    razorpay_order_id: str = Field(
        min_length=1,
        max_length=255,
    )
    razorpay_payment_id: str = Field(
        min_length=1,
        max_length=255,
    )
    razorpay_signature: str = Field(
        min_length=1,
        max_length=255,
    )

    @field_validator(
        "razorpay_order_id",
        "razorpay_payment_id",
        "razorpay_signature",
    )
    @classmethod
    def normalize_value(
        cls,
        value: str,
    ) -> str:
        return value.strip()


class RazorpayPaymentVerificationResponse(BaseModel):
    success: bool = True
    bookingId: UUID
    paymentId: str
    status: str
    paymentPending: bool = False


class MarkPaymentFailedRequest(BaseModel):
    booking_id: UUID


class BookingPaymentRecord(BaseModel):
    id: UUID
    booking_id: UUID
    provider: str
    provider_order_id: str | None
    provider_payment_id: str | None
    amount: Decimal
    currency: str
    status: str
    paid_at: datetime | None
    created_at: datetime
    updated_at: datetime


class _BookingPaymentQuery(BaseModel):
    id: UUID
    customer_id: UUID
    status: str
    fulfillment_type: str
    service_variant_id: UUID
    total_amount: Decimal
    pricing_snapshot: object | None
    scheduled_start: datetime
    schedule_start_date: date | None
    schedule_end_date: date | None
    selected_weekdays: list[int] | None
    off_dates: list[date] | None
    total_working_hours: Decimal | None