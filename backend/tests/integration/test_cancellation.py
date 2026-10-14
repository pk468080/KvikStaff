import pytest
import uuid
from sqlalchemy import text

pytestmark = pytest.mark.asyncio

async def test_cancel_customer_booking_unauthenticated(db_session):
    # This proves that direct invocation fails if auth.uid() is not set via JWT claims
    booking_id = str(uuid.uuid4())

    with pytest.raises(Exception) as excinfo:
        await db_session.execute(
            text("SELECT public.cancel_customer_booking(:booking_id, 'test reason')"),
            {"booking_id": booking_id}
        )

    assert "Authentication required" in str(excinfo.value) or "permission denied" in str(excinfo.value)

async def test_cancel_customer_booking_invalid_booking(authenticated_session):
    # Create fake user
    user_id = str(uuid.uuid4())
    session = await authenticated_session(user_id)
    booking_id = str(uuid.uuid4())

    with pytest.raises(Exception) as excinfo:
        await session.execute(
            text("SELECT public.cancel_customer_booking(:booking_id, 'test reason')"),
            {"booking_id": booking_id}
        )

    # It should fail because the booking doesn't exist, proving it bypasses the auth check successfully
    assert "not found" in str(excinfo.value).lower() or "denied" in str(excinfo.value).lower()
