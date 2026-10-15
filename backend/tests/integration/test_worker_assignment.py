import json
import uuid

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.asyncio


async def _worker_response(session, offer_id):
    result = await session.execute(
        text(
            "SELECT public.worker_respond_to_offer"
            "(:offer_id, 'accept')"
        ),
        {"offer_id": offer_id},
    )

    response = result.scalar_one()

    # Handle either decoded JSONB or a JSON string.
    if isinstance(response, str):
        response = json.loads(response)

    return response


async def test_worker_respond_to_offer_requires_auth(db_session):
    offer_id = str(uuid.uuid4())

    response = await _worker_response(db_session, offer_id)

    assert response["success"] is False
    assert response["error"] == "Authentication required"


async def test_worker_respond_to_offer_rejects_missing_worker_profile(
    authenticated_session,
):
    worker_id = str(uuid.uuid4())
    session = await authenticated_session(worker_id, "worker")
    offer_id = str(uuid.uuid4())

    response = await _worker_response(session, offer_id)

    assert response["success"] is False
    assert response["error"] == (
        "Worker account is not active and verified"
    )
