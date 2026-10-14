from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest

from app.modules.bookings.repository import BookingsRepository


@pytest.mark.asyncio
async def test_resolve_location_reuses_existing_owned_address():
    session = AsyncMock()
    existing_id = uuid4()
    result = Mock()
    result.scalar_one_or_none.return_value = existing_id
    session.execute.return_value = result
    repository = BookingsRepository(session)

    resolved = await repository._resolve_customer_address_id(
        customer_id=uuid4(),
        address_id=None,
        location={
            "latitude": 28.6139,
            "longitude": 77.2090,
            "address": "Connaught Place, New Delhi",
        },
    )

    assert resolved == (existing_id, False)
    assert session.execute.await_count == 1
    assert "FROM public.addresses" in str(session.execute.await_args.args[0])


@pytest.mark.asyncio
async def test_resolve_location_inserts_new_address_for_booking_transaction():
    session = AsyncMock()
    created_id = uuid4()
    no_match = Mock()
    no_match.scalar_one_or_none.return_value = None
    inserted = Mock()
    inserted.scalar_one.return_value = created_id
    session.execute.side_effect = [no_match, inserted]
    repository = BookingsRepository(session)

    resolved = await repository._resolve_customer_address_id(
        customer_id=uuid4(),
        address_id=None,
        location={
            "latitude": 28.6139,
            "longitude": 77.2090,
            "address": "Connaught Place, New Delhi",
        },
    )

    assert resolved == (created_id, True)
    assert session.execute.await_count == 2
    insert_sql = str(session.execute.await_args_list[1].args[0])
    assert "INSERT INTO public.addresses" in insert_sql
