import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError
from starlette.responses import Response

from app.api.v1 import health
from app.main import app


def test_liveness() -> None:
    client = TestClient(app)

    response = client.get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "data": {"status": "ok"},
        "error": None,
    }


def test_auth_requires_bearer() -> None:
    client = TestClient(app)

    response = client.get("/api/v1/auth/me")

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_readiness_logs_database_failure_without_returning_details(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    class FailedConnection:
        async def __aenter__(self):
            raise OperationalError(
                "select 1",
                {},
                RuntimeError(
                    "password authentication failed"
                ),
            )

        async def __aexit__(self, *_args: object) -> None:
            return None

    monkeypatch.setattr(
        health.engine,
        "connect",
        lambda: FailedConnection(),
    )

    response = Response()

    with caplog.at_level(
        logging.ERROR,
        logger="app.api.v1.health",
    ):
        payload = await health.readiness(response)

    assert response.status_code == 503
    assert payload["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert (
        "Readiness check failed: PostgreSQL"
        in caplog.text
    )
    assert (
        "password authentication failed"
        not in str(payload)
    )