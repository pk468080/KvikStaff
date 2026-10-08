import pytest
import uuid
import json
from datetime import datetime, date, time
from typing import Any
from fastapi import HTTPException
from unittest.mock import AsyncMock, MagicMock
from app.modules.bookings.service import BookingsService
from app.modules.bookings.schemas import MultiOccurrenceBookingPriceRequest
from app.modules.bookings.repository import BookingsRepository

class MockRow:
    def __init__(self, data):
        self.data = data
    def first(self):
        return self.data
    def mappings(self):
        class MappingRow:
            def first(self_inner):
                return self.data
        return MappingRow()

class MockResult:
    def __init__(self, row):
        self.row = row
    def first(self):
        return self.row
    def scalar_one(self):
        if self.row is None:
            raise RuntimeError("Unable to complete")
        return self.row
    def mappings(self):
        class MappingRow:
            def first(self_inner):
                return self.row
        return MappingRow()

class AsyncContextManagerMock:
    def __init__(self, test_mock):
        self.test_mock = test_mock
    async def __aenter__(self):
        return self.test_mock
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

class FakeSession:
    def __init__(self):
        self.execute = AsyncMock()

    def begin(self):
        return AsyncContextManagerMock(self)
@pytest.mark.asyncio
async def test_multi_occurrence_pricing_does_not_require_idempotency(
    monkeypatch,
):
    repository = MagicMock()
    repository.calculate_customer_multi_occurrence_booking_price = (
        AsyncMock(
            return_value={
                "total_amount": 1000,
                "total_working_hours": 2,
            }
        )
    )

    service = BookingsService(repository)

    request = MultiOccurrenceBookingPriceRequest(
        service_variant_id=uuid.uuid4(),
        schedule_start_date=date(2026, 10, 10),
        schedule_end_date=date(2026, 10, 10),
        daily_start_time=time(9, 0),
        daily_end_time=time(11, 0),
        selected_weekdays=[5],
        off_dates=[],
        booking_type="scheduled",
    )

    result = await service.calculate_customer_multi_occurrence_booking_price(
        customer_id=uuid.uuid4(),
        request=request,
    )

    assert result["total_amount"] == 1000

    repository.calculate_customer_multi_occurrence_booking_price.assert_awaited_once()

    call_kwargs = (
        repository.calculate_customer_multi_occurrence_booking_price
        .await_args.kwargs
    )

    assert "idempotency_key" not in call_kwargs
    assert "request_hash" not in call_kwargs
@pytest.fixture
def fake_db():
    return FakeSession()

@pytest.fixture
def repo(fake_db):
    return BookingsRepository(fake_db)

@pytest.mark.asyncio
async def test_atomic_idempotency_first_request_acquires_key(repo, fake_db):
    fake_db.execute = AsyncMock(side_effect=[
        MockResult(None), # auth context
        MockResult({"id": 1}), # insert idempotency (claim_or_replay acquire)
        MockResult('{"id": "123e4567-e89b-12d3-a456-426614174000"}'), # scalar_one for booking
        MockResult({"id": 1}), # complete_idempotency update
    ])

    result = await repo.create_hourly_booking(
        customer_id=uuid.uuid4(),
        service_variant_id=uuid.uuid4(),
        address_id=uuid.uuid4(),
        booking_type="instant",
        scheduled_start=datetime.now(),
        scheduled_end=datetime.now(),
        notes=None,
        idempotency_key="key1",
        request_hash="hash1"
    )

    assert result == {"id": "123e4567-e89b-12d3-a456-426614174000"}
    assert fake_db.execute.call_count == 4

@pytest.mark.asyncio
async def test_atomic_idempotency_duplicate_request_replays(repo, fake_db):
    stored_response = {"id": "123e4567-e89b-12d3-a456-426614174000", "status": "completed"}

    fake_db.execute = AsyncMock(side_effect=[
        MockResult(None), # auth context
        MockResult(None), # insert idempotency conflict
        MockResult({
            "status": "completed",
            "request_hash": "hash1",
            "response_body": json.dumps(stored_response)
        }),
    ])

    result = await repo.create_hourly_booking(
        customer_id=uuid.uuid4(),
        service_variant_id=uuid.uuid4(),
        address_id=uuid.uuid4(),
        booking_type="instant",
        scheduled_start=datetime.now(),
        scheduled_end=datetime.now(),
        notes=None,
        idempotency_key="key1",
        request_hash="hash1"
    )

    assert result == stored_response
    assert fake_db.execute.call_count == 3

@pytest.mark.asyncio
async def test_atomic_idempotency_different_payload_returns_409(repo, fake_db):
    stored_response = {"id": "123e4567-e89b-12d3-a456-426614174000"}

    fake_db.execute = AsyncMock(side_effect=[
        MockResult(None), # auth context
        MockResult(None), # insert idempotency conflict
        MockResult({
            "status": "completed",
            "request_hash": "different_hash",
            "response_body": json.dumps(stored_response)
        }),
    ])

    with pytest.raises(HTTPException) as exc:
        await repo.create_hourly_booking(
            customer_id=uuid.uuid4(),
            service_variant_id=uuid.uuid4(),
            address_id=uuid.uuid4(),
            booking_type="instant",
            scheduled_start=datetime.now(),
            scheduled_end=datetime.now(),
            notes=None,
            idempotency_key="key1",
            request_hash="hash1"
        )

    assert exc.value.status_code == 409
    assert fake_db.execute.call_count == 3

@pytest.mark.asyncio
async def test_atomic_idempotency_concurrent_duplicate_returns_409(repo, fake_db):
    fake_db.execute = AsyncMock(side_effect=[
        MockResult(None), # auth context
        MockResult(None), # insert idempotency conflict
        MockResult({
            "status": "in_progress",
            "request_hash": "hash1",
            "response_body": None
        }),
    ])

    with pytest.raises(HTTPException) as exc:
        await repo.create_hourly_booking(
            customer_id=uuid.uuid4(),
            service_variant_id=uuid.uuid4(),
            address_id=uuid.uuid4(),
            booking_type="instant",
            scheduled_start=datetime.now(),
            scheduled_end=datetime.now(),
            notes=None,
            idempotency_key="key1",
            request_hash="hash1"
        )

    assert exc.value.status_code == 409
    assert fake_db.execute.call_count == 3
