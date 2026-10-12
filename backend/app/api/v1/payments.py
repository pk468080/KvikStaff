from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header

from app.core.database import get_db
from app.core.idempotency import idempotent
from app.core.security import (
    CurrentUser,
    get_customer,
)
from app.modules.payments.repository import (
    PaymentsRepository,
)
from app.modules.payments.schemas import (
    BookingPaymentDetailsResponse,
    CreateRazorpayOrderRequest,
    MarkPaymentFailedRequest,
    RazorpayOrderResponse,
    RazorpayPaymentVerificationResponse,
    VerifyRazorpayPaymentRequest,
)
from app.modules.payments.service import (
    PaymentsService,
)

router = APIRouter()


def get_payments_service(
    db=Depends(get_db),
) -> PaymentsService:
    return PaymentsService(
        PaymentsRepository(db),
    )


@router.get(
    "/bookings/{booking_id}",
    response_model=BookingPaymentDetailsResponse,
)
async def get_booking_payment_details(
    booking_id: UUID,
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: PaymentsService = Depends(
        get_payments_service
    ),
) -> dict[str, Any]:
    return await service.get_booking_payment_details(
        customer_id=UUID(
            current_user.id
        ),
        booking_id=booking_id,
    )


@router.post(
    "/order",
    response_model=RazorpayOrderResponse,
)
@idempotent(action="create_razorpay_order")
async def create_razorpay_order(
    request: CreateRazorpayOrderRequest,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: PaymentsService = Depends(
        get_payments_service
    ),
) -> dict[str, Any]:
    return await service.create_order(
        customer_id=UUID(
            current_user.id
        ),
        booking_id=request.booking_id,
    )


@router.post(
    "/verify",
    response_model=RazorpayPaymentVerificationResponse,
)
async def verify_razorpay_payment(
    request: VerifyRazorpayPaymentRequest,
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: PaymentsService = Depends(
        get_payments_service
    ),
) -> dict[str, Any]:
    return await service.verify_payment(
        customer_id=UUID(
            current_user.id
        ),
        booking_id=request.booking_id,
        razorpay_order_id=
            request.razorpay_order_id,
        razorpay_payment_id=
            request.razorpay_payment_id,
        razorpay_signature=
            request.razorpay_signature,
    )


@router.post(
    "/mark-failed",
)
async def mark_payment_failed(
    request: MarkPaymentFailedRequest,
    current_user: CurrentUser = Depends(
        get_customer
    ),
    service: PaymentsService = Depends(
        get_payments_service
    ),
) -> dict[str, Any]:
    return await service.mark_payment_failed(
        customer_id=UUID(
            current_user.id
        ),
        booking_id=request.booking_id,
    )