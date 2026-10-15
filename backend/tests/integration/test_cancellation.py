import uuid

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.asyncio


async def test_cancel_customer_booking_unauthenticated(db_session):
    booking_id = str(uuid.uuid4())

    with pytest.raises(Exception) as excinfo:
        await db_session.execute(
            text(
                "SELECT public.cancel_customer_booking"
                "(:booking_id, 'test reason')"
            ),
            {"booking_id": booking_id},
        )

    assert "Authentication required" in str(excinfo.value)


async def test_cancel_customer_booking_rejects_missing_customer_profile(
    authenticated_session,
):
    user_id = str(uuid.uuid4())
    session = await authenticated_session(user_id)
    booking_id = str(uuid.uuid4())

    with pytest.raises(Exception) as excinfo:
        await session.execute(
            text(
                "SELECT public.cancel_customer_booking"
                "(:booking_id, 'test reason')"
            ),
            {"booking_id": booking_id},
        )

    assert "Customer account is inactive" in str(excinfo.value)
