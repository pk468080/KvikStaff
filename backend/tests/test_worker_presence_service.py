from datetime import datetime, timezone
from uuid import UUID

import pytest

from app.modules.worker_presence.service import (
    WorkerPresenceService,
)


class FakeRepository:
    async def get_latest_location_any_booking(
        self,
        worker_id: UUID,
    ):
        return {
            "latitude": 28.6139,
            "longitude": 77.2090,
            "recorded_at": datetime(
                2026,
                10,
                7,
                8,
                0,
                tzinfo=timezone.utc,
            ),
        }


@pytest.mark.asyncio
async def test_get_latest_worker_location() -> None:
    service = WorkerPresenceService(
        FakeRepository()
    )

    result = await service.get_latest_location(
        UUID("11111111-1111-1111-1111-111111111111")
    )

    assert result is not None
    assert result.latitude == 28.6139
    assert result.longitude == 77.2090
    assert result.recorded_at == datetime(
        2026,
        10,
        7,
        8,
        0,
        tzinfo=timezone.utc,
    )