import asyncio
import json
import uuid

import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from app.core.idempotency import idempotent
from app.core.security import CurrentUser


class MockRow:
    def __init__(self, data):
        self.data = data
    def first(self):
        return self.data

class MockResult:
    def __init__(self, row):
        self.row = row
    def mappings(self):
        return MockRow(self.row)

class AsyncContextManagerMock:
    def __init__(self, test_mock):
        self.test_mock = test_mock
    async def __aenter__(self):
        return self.test_mock
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

# Fake session mimicking AsyncSession for the test
class FakeSession:
    def __init__(self):
        self.execute = asyncio.Future() # Will be replaced by AsyncMock per test

    def begin(self):
        return AsyncContextManagerMock(self)

@pytest.fixture
def dummy_user():
    return CurrentUser(id="123e4567-e89b-12d3-a456-426614174000", role="customer", email="test@test.com")

class ResponseModel(BaseModel):
    id: uuid.UUID
    status: str

@pytest.mark.asyncio
async def test_idempotent_missing_key(dummy_user):
    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        return {"status": "ok"}

    with pytest.raises(HTTPException) as exc:
        await my_func(current_user=dummy_user)

    assert exc.value.status_code == 400
    assert "Idempotency-Key header is missing" in exc.value.detail

@pytest.mark.asyncio
async def test_idempotent_invalid_key_length(dummy_user):
    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        return {"status": "ok"}

    with pytest.raises(HTTPException) as exc:
        await my_func(current_user=dummy_user, idempotency_key="a" * 256)

    assert exc.value.status_code == 400
    assert "maximum length" in exc.value.detail

@pytest.mark.asyncio
async def test_idempotent_hash_mismatch(dummy_user, monkeypatch):
    import app.core.idempotency.decorator as dec

    fake_session = FakeSession()

    def get_fake_session():
        class FakeSessionLocal:
            async def __aenter__(self):
                return fake_session
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
        return FakeSessionLocal()

    monkeypatch.setattr(dec, "AsyncSessionLocal", get_fake_session)

    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        return {"status": "ok"}

    # The current request has a hash based on the payload.
    # The existing record in the DB will return a DIFFERENT hash, causing a 409 conflict.

    from unittest.mock import AsyncMock
    fake_session.execute = AsyncMock(side_effect=[
        MockResult(None), # Insert fails (Conflict)
        MockResult({"status": "completed", "request_hash": "different_hash", "response_body": '{"status": "ok"}'})
    ])

    with pytest.raises(HTTPException) as exc:
        await my_func(idempotency_key="key1", current_user=dummy_user, request={"data": "test"})

    assert exc.value.status_code == 409
    assert "Idempotency key reuse detected" in exc.value.detail

@pytest.mark.asyncio
async def test_idempotent_success_and_response_serialization(dummy_user, monkeypatch):
    import app.core.idempotency.decorator as dec

    fake_session = FakeSession()

    def get_fake_session():
        class FakeSessionLocal:
            async def __aenter__(self):
                return fake_session
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
        return FakeSessionLocal()

    monkeypatch.setattr(dec, "AsyncSessionLocal", get_fake_session)

    test_uuid = uuid.uuid4()

    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        return ResponseModel(id=test_uuid, status="created")

    from unittest.mock import AsyncMock
    fake_session.execute = AsyncMock(side_effect=[
        MockResult({"status": "in_progress"}), # Acquired
        MockResult(None) # Final update
    ])

    res = await my_func(idempotency_key="key1", current_user=dummy_user)
    assert res.id == test_uuid
    assert res.status == "created"

    last_call = fake_session.execute.call_args_list[-1]
    query = last_call[0][0].text
    params = last_call[0][1]

    assert "UPDATE public.idempotency_keys" in query
    assert "status = 'completed'" in query

    saved_body = json.loads(params["response_body"])
    assert saved_body["id"] == str(test_uuid)
    assert saved_body["status"] == "created"

@pytest.mark.asyncio
async def test_idempotent_duplicate_successful_request(dummy_user, monkeypatch):
    import app.core.idempotency.decorator as dec
    from app.core.idempotency.decorator import _hash_request

    fake_session = FakeSession()

    def get_fake_session():
        class FakeSessionLocal:
            async def __aenter__(self):
                return fake_session
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
        return FakeSessionLocal()

    monkeypatch.setattr(dec, "AsyncSessionLocal", get_fake_session)

    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        return {"status": "ok"}

    req_payload = {"test": "data"}
    expected_hash = _hash_request(req_payload)

    from unittest.mock import AsyncMock
    fake_session.execute = AsyncMock(side_effect=[
        MockResult(None), # Conflict
        MockResult({"status": "completed", "request_hash": expected_hash, "response_body": '{"status": "ok"}'})
    ])

    res = await my_func(idempotency_key="key1", current_user=dummy_user, request=req_payload)
    assert res == {"status": "ok"}
    assert fake_session.execute.call_count == 2

@pytest.mark.asyncio
async def test_idempotent_concurrent_duplicate_request_timeout(dummy_user, monkeypatch):
    import app.core.idempotency.decorator as dec
    from app.core.idempotency.decorator import _hash_request

    fake_session = FakeSession()

    def get_fake_session():
        class FakeSessionLocal:
            async def __aenter__(self):
                return fake_session
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
        return FakeSessionLocal()

    monkeypatch.setattr(dec, "AsyncSessionLocal", get_fake_session)
    monkeypatch.setattr(dec, "MAX_WAIT_TIME", 1) # Reduce wait time for test

    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        return {"status": "ok"}

    req_payload = {"test": "data"}
    expected_hash = _hash_request(req_payload)

    from unittest.mock import AsyncMock
    side_effects = []
    # 2 loops if wait is 1 sec and interval is 0.5 sec
    for _ in range(2):
        side_effects.append(MockResult(None)) # Insert fails
        side_effects.append(MockResult({"status": "in_progress", "request_hash": expected_hash, "response_body": None})) # Select shows in progress

    fake_session.execute = AsyncMock(side_effect=side_effects)

    with pytest.raises(HTTPException) as exc:
        await my_func(idempotency_key="key1", current_user=dummy_user, request=req_payload)

    assert exc.value.status_code == 409
    assert "Concurrent request processing" in exc.value.detail

@pytest.mark.asyncio
async def test_idempotent_business_failure_saves_failed_state(dummy_user, monkeypatch):
    import app.core.idempotency.decorator as dec

    fake_session = FakeSession()

    def get_fake_session():
        class FakeSessionLocal:
            async def __aenter__(self):
                return fake_session
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
        return FakeSessionLocal()

    monkeypatch.setattr(dec, "AsyncSessionLocal", get_fake_session)

    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        raise ValueError("Business validation failed")

    from unittest.mock import AsyncMock
    fake_session.execute = AsyncMock(side_effect=[
        MockResult({"status": "in_progress"}), # Acquired
        MockResult(None) # Final failed update
    ])

    with pytest.raises(ValueError, match="Business validation failed"):
        await my_func(idempotency_key="key1", current_user=dummy_user)

    last_call = fake_session.execute.call_args_list[-1]
    query = last_call[0][0].text

    assert "UPDATE public.idempotency_keys" in query
    assert "status = 'failed'" in query
