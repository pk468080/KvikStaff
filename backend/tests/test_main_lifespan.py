from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app, lifespan


@pytest.mark.asyncio
async def test_lifespan():
    with (
        patch("app.main.configure_logging") as mock_log,
        patch("app.main.close_redis_client", new_callable=AsyncMock) as mock_close,
    ):
        async with lifespan(app):
            mock_log.assert_called_once()
            mock_close.assert_not_called()

        mock_close.assert_called_once()


@pytest.mark.asyncio
async def test_lifespan_error_handling():
    with (
        patch("app.main.configure_logging"),
        patch("app.main.close_redis_client", new_callable=AsyncMock) as mock_close,
    ):
        try:
            async with lifespan(app):
                raise ValueError("Simulated error during app running")
        except ValueError:
            pass

        mock_close.assert_called_once()


def test_app_startup():
    with (
        patch("app.main.configure_logging") as mock_log,
        patch("app.main.close_redis_client", new_callable=AsyncMock),TestClient(app)
    ):
        mock_log.assert_called_once()

        # TestClient creates a new event loop so the await close_redis_client() runs
