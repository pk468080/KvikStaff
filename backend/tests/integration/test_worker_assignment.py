import pytest
import uuid
import asyncio
from sqlalchemy import text

pytestmark = pytest.mark.asyncio

async def test_concurrent_worker_acceptance_requires_auth(db_session):
    offer_id = str(uuid.uuid4())

    with pytest.raises(Exception) as excinfo:
        await db_session.execute(
            text("SELECT public.worker_respond_to_offer(:offer_id, 'accept')"),
            {"offer_id": offer_id}
        )

    assert "Authentication required" in str(excinfo.value) or "permission denied" in str(excinfo.value)

async def test_worker_assignment_requires_valid_offer(authenticated_session):
    worker_id = str(uuid.uuid4())
    session = await authenticated_session(worker_id, "worker")
    offer_id = str(uuid.uuid4())

    with pytest.raises(Exception) as excinfo:
        await session.execute(
            text("SELECT public.worker_respond_to_offer(:offer_id, 'accept')"),
            {"offer_id": offer_id}
        )

    assert "not found" in str(excinfo.value).lower() or "denied" in str(excinfo.value).lower()
