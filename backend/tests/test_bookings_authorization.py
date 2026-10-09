import pytest
from uuid import uuid4
from unittest.mock import AsyncMock
from app.modules.bookings.service import BookingsService
from app.modules.bookings.repository import BookingsRepository
from app.core.exceptions import AppError

@pytest.mark.asyncio
async def test_get_customer_booking_idor():
    mock_repo = AsyncMock(spec=BookingsRepository)
    mock_repo.get_customer_booking.return_value = None
    service = BookingsService(repository=mock_repo)
    booking_id = uuid4()
    customer_id = uuid4()
    with pytest.raises(AppError) as exc:
        await service.get_customer_booking(booking_id=booking_id, customer_id=customer_id)
    assert exc.value.status_code == 404
    assert "Booking not found" in exc.value.message
    mock_repo.get_customer_booking.assert_called_once_with(customer_id=customer_id, booking_id=booking_id)

@pytest.mark.asyncio
async def test_cancel_booking_idor():
    mock_repo = AsyncMock(spec=BookingsRepository)
    service = BookingsService(repository=mock_repo)
    booking_id = uuid4()
    customer_id = uuid4()
    from app.modules.bookings.schemas import CustomerBookingCancellationRequest
    request = CustomerBookingCancellationRequest(reason="Test cancellation")
    await service.cancel_booking(booking_id=booking_id, request=request, customer_id=customer_id)
    mock_repo.cancel_customer_booking.assert_called_once_with(
        customer_id=customer_id,
        booking_id=booking_id,
        reason="Test cancellation"
    )
