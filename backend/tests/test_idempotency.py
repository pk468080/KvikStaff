from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

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
    async def __aenter__(self):
        return self
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

@pytest.fixture
def mock_db():
    db = AsyncMock()
    db.begin = MagicMock(return_value=AsyncContextManagerMock())
    return db

@pytest.fixture
def dummy_user():
    return CurrentUser(id="123e4567-e89b-12d3-a456-426614174000", role="customer", email="test@test.com")

@pytest.mark.asyncio
async def test_idempotent_missing_key(mock_db, dummy_user):
    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        return {"status": "ok"}

    with pytest.raises(HTTPException) as exc:
        await my_func(current_user=dummy_user, db=mock_db)

    assert exc.value.status_code == 400
    assert "Idempotency-Key header is missing" in exc.value.detail

@pytest.mark.asyncio
async def test_idempotent_duplicate_successful_request(mock_db, dummy_user):
    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        return {"status": "ok"}

    mock_db.execute = AsyncMock(side_effect=[
        MockResult(None),
        MockResult({"status": "completed", "response_body": '{"status": "ok"}'})
    ])

    res = await my_func(idempotency_key="key1", current_user=dummy_user, db=mock_db)
    assert res == {"status": "ok"}
    assert mock_db.execute.call_count == 2

@pytest.mark.asyncio
async def test_idempotent_concurrent_duplicate_request(mock_db, dummy_user):
    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        return {"status": "ok"}

    side_effects = [MockResult(None)]
    for _ in range(10):
        side_effects.append(MockResult({"status": "in_progress", "response_body": None}))
        side_effects.append(MockResult(None))

    mock_db.execute = AsyncMock(side_effect=side_effects)

    with pytest.raises(HTTPException) as exc:
        await my_func(idempotency_key="key1", current_user=dummy_user, db=mock_db)

    assert exc.value.status_code == 409
    assert "Concurrent request processing" in exc.value.detail

@pytest.mark.asyncio
async def test_idempotent_failed_request_followed_by_retry(mock_db, dummy_user):
    calls = []

    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        calls.append(1)
        return {"status": "ok"}

    mock_db.execute = AsyncMock(side_effect=[
        MockResult({"status": "in_progress"}),
        MockResult(None)
    ])

    res = await my_func(idempotency_key="key1", current_user=dummy_user, db=mock_db)
    assert res == {"status": "ok"}
    assert len(calls) == 1

@pytest.mark.asyncio
async def test_idempotent_new_request_saves_failure(mock_db, dummy_user):
    @idempotent(action="test_action")
    async def my_func(*args, **kwargs):
        raise ValueError("Something broke")

    mock_db.execute = AsyncMock(side_effect=[
        MockResult({"status": "in_progress"}),
        MockResult(None)
    ])

    with pytest.raises(ValueError):
        await my_func(idempotency_key="key1", current_user=dummy_user, db=mock_db)

    last_call = mock_db.execute.call_args_list[-1]
    query = last_call[0][0].text
    assert "UPDATE idempotency_keys" in query
    assert "SET status = 'failed'" in query
