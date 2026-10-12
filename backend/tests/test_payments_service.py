"""Focused unit tests for KvikStaff's server-side Razorpay verification flow.

Save this file as backend/tests/test_payments_service.py in the repository.
The tests use mocks only; they do not contact Razorpay or the production database.
"""

import hashlib
import hmac
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.config import settings
from app.core.exceptions import AppError
from app.modules.payments.service import PaymentsService


def _signature(secret: str, order_id: str, payment_id: str) -> str:
    message = f"{order_id}|{payment_id}".encode("utf-8")
    return hmac.new(
        secret.encode("utf-8"),
        message,
        hashlib.sha256,
    ).hexdigest()


@pytest.fixture
def payment_context(monkeypatch):
    """A fake payment service, repository, and Razorpay client per test."""
    secret = "unit-test-razorpay-secret"
    monkeypatch.setattr(settings, "razorpay_key_id", "rzp_test_key")
    monkeypatch.setattr(settings, "razorpay_key_secret", secret)

    customer_id = uuid4()
    booking_id = uuid4()
    payment_record_id = uuid4()
    order_id = "order_test_123"
    provider_payment_id = "pay_test_456"

    booking = {
        "id": booking_id,
        "customer_id": customer_id,
        "status": "pending_payment",
        "fulfillment_type": "instant",
        "total_amount": Decimal("100.00"),
        "pricing_snapshot": {"currency": "INR"},
        "scheduled_start": None,
        "total_working_hours": Decimal("2.00"),
    }
    payment = {
        "id": payment_record_id,
        "booking_id": booking_id,
        "provider": "razorpay",
        "provider_order_id": order_id,
        "provider_payment_id": None,
        "amount": Decimal("100.00"),
        "currency": "INR",
        "status": "pending",
    }

    repository = MagicMock()
    repository.get_customer_booking = AsyncMock(return_value=booking)
    repository.get_payment_by_order = AsyncMock(return_value=payment)
    repository.finalize_razorpay_payment = AsyncMock(
        return_value={"success": True, "booking_status": "paid"}
    )

    razorpay = SimpleNamespace(
        get_payment=AsyncMock(
            return_value={
                "id": provider_payment_id,
                "order_id": order_id,
                "currency": "INR",
                "amount": 10000,
                "status": "captured",
                "created_at": 1_791_600_000,
            }
        )
    )

    service = PaymentsService(repository)
    service.razorpay = razorpay

    return SimpleNamespace(
        service=service,
        repository=repository,
        razorpay=razorpay,
        secret=secret,
        customer_id=customer_id,
        booking_id=booking_id,
        payment_record_id=payment_record_id,
        order_id=order_id,
        provider_payment_id=provider_payment_id,
        booking=booking,
        payment=payment,
    )


@pytest.mark.asyncio
async def test_payment_details_returns_404_for_booking_not_owned_or_missing(
    payment_context,
):
    ctx = payment_context
    ctx.repository.get_customer_booking.return_value = None

    with pytest.raises(AppError) as exc:
        await ctx.service.get_booking_payment_details(
            customer_id=ctx.customer_id,
            booking_id=ctx.booking_id,
        )

    assert exc.value.status_code == 404
    assert exc.value.code == "BOOKING_NOT_FOUND"


@pytest.mark.asyncio
async def test_verification_rejects_invalid_signature_before_provider_lookup(
    payment_context,
):
    ctx = payment_context

    with pytest.raises(AppError) as exc:
        await ctx.service.verify_payment(
            customer_id=ctx.customer_id,
            booking_id=ctx.booking_id,
            razorpay_order_id=ctx.order_id,
            razorpay_payment_id=ctx.provider_payment_id,
            razorpay_signature="not-a-valid-signature",
        )

    assert exc.value.status_code == 400
    assert exc.value.code == "INVALID_RAZORPAY_SIGNATURE"
    ctx.razorpay.get_payment.assert_not_awaited()
    ctx.repository.finalize_razorpay_payment.assert_not_awaited()


@pytest.mark.asyncio
async def test_authorized_payment_is_pending_not_finalized(payment_context):
    ctx = payment_context
    ctx.razorpay.get_payment.return_value = {
        "id": ctx.provider_payment_id,
        "order_id": ctx.order_id,
        "currency": "INR",
        "amount": 10000,
        "status": "authorized",
    }

    result = await ctx.service.verify_payment(
        customer_id=ctx.customer_id,
        booking_id=ctx.booking_id,
        razorpay_order_id=ctx.order_id,
        razorpay_payment_id=ctx.provider_payment_id,
        razorpay_signature=_signature(
            ctx.secret, ctx.order_id, ctx.provider_payment_id
        ),
    )

    assert result["success"] is True
    assert result["paymentPending"] is True
    assert result["status"] == "authorized"
    ctx.repository.finalize_razorpay_payment.assert_not_awaited()


@pytest.mark.asyncio
async def test_captured_payment_is_finalized(payment_context):
    ctx = payment_context

    result = await ctx.service.verify_payment(
        customer_id=ctx.customer_id,
        booking_id=ctx.booking_id,
        razorpay_order_id=ctx.order_id,
        razorpay_payment_id=ctx.provider_payment_id,
        razorpay_signature=_signature(
            ctx.secret, ctx.order_id, ctx.provider_payment_id
        ),
    )

    assert result == {
        "success": True,
        "bookingId": ctx.booking_id,
        "paymentId": ctx.provider_payment_id,
        "status": "paid",
        "paymentPending": False,
    }
    ctx.repository.finalize_razorpay_payment.assert_awaited_once()
    finalize_kwargs = (
        ctx.repository.finalize_razorpay_payment.await_args.kwargs
    )
    assert finalize_kwargs["payment_id"] == ctx.payment_record_id
    assert finalize_kwargs["provider_payment_id"] == ctx.provider_payment_id


@pytest.mark.asyncio
async def test_verification_rejects_provider_order_mismatch(payment_context):
    ctx = payment_context
    ctx.razorpay.get_payment.return_value = {
        "id": ctx.provider_payment_id,
        "order_id": "order_someone_else",
        "currency": "INR",
        "amount": 10000,
        "status": "captured",
    }

    with pytest.raises(AppError) as exc:
        await ctx.service.verify_payment(
            customer_id=ctx.customer_id,
            booking_id=ctx.booking_id,
            razorpay_order_id=ctx.order_id,
            razorpay_payment_id=ctx.provider_payment_id,
            razorpay_signature=_signature(
                ctx.secret, ctx.order_id, ctx.provider_payment_id
            ),
        )

    assert exc.value.status_code == 409
    assert exc.value.code == "RAZORPAY_ORDER_MISMATCH"
    ctx.repository.finalize_razorpay_payment.assert_not_awaited()


@pytest.mark.asyncio
async def test_verification_rejects_wrong_provider_amount(payment_context):
    ctx = payment_context
    ctx.razorpay.get_payment.return_value = {
        "id": ctx.provider_payment_id,
        "order_id": ctx.order_id,
        "currency": "INR",
        "amount": 9999,
        "status": "captured",
    }

    with pytest.raises(AppError) as exc:
        await ctx.service.verify_payment(
            customer_id=ctx.customer_id,
            booking_id=ctx.booking_id,
            razorpay_order_id=ctx.order_id,
            razorpay_payment_id=ctx.provider_payment_id,
            razorpay_signature=_signature(
                ctx.secret, ctx.order_id, ctx.provider_payment_id
            ),
        )

    assert exc.value.status_code == 409
    assert exc.value.code == "RAZORPAY_AMOUNT_MISMATCH"
    ctx.repository.finalize_razorpay_payment.assert_not_awaited()


@pytest.mark.asyncio
async def test_failed_or_processing_payment_is_not_finalized(payment_context):
    ctx = payment_context
    ctx.razorpay.get_payment.return_value = {
        "id": ctx.provider_payment_id,
        "order_id": ctx.order_id,
        "currency": "INR",
        "amount": 10000,
        "status": "failed",
    }

    with pytest.raises(AppError) as exc:
        await ctx.service.verify_payment(
            customer_id=ctx.customer_id,
            booking_id=ctx.booking_id,
            razorpay_order_id=ctx.order_id,
            razorpay_payment_id=ctx.provider_payment_id,
            razorpay_signature=_signature(
                ctx.secret, ctx.order_id, ctx.provider_payment_id
            ),
        )

    assert exc.value.status_code == 409
    assert exc.value.code == "RAZORPAY_PAYMENT_NOT_CAPTURED"
    ctx.repository.finalize_razorpay_payment.assert_not_awaited()
