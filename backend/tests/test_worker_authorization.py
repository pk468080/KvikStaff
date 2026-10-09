import pytest
from uuid import uuid4
from unittest.mock import AsyncMock

@pytest.mark.asyncio
async def test_worker_presence_location_idor():
    from app.modules.worker_presence.service import WorkerPresenceService
    from app.modules.worker_presence.repository import WorkerPresenceRepository
    mock_repo = AsyncMock(spec=WorkerPresenceRepository)
    mock_repo.update_location.return_value = {"success": True, "latitude": 10.0, "longitude": 20.0, "recorded_at": "2026-01-01T00:00:00Z"}
    mock_repo.get_presence.return_value = {"worker_id": str(uuid4()), "is_available": True, "expires_at": "2026-01-01T00:00:00Z"}
    service = WorkerPresenceService(repository=mock_repo)
    worker_id = uuid4()
    booking_id = uuid4()
    await service.update_location(worker_id=worker_id, latitude=10.0, longitude=20.0, booking_id=booking_id)
    mock_repo.update_location.assert_called_once_with(worker_id, 10.0, 20.0, booking_id)

@pytest.mark.asyncio
async def test_worker_schedule_idor():
    from app.modules.worker_schedule.service import WorkerScheduleService
    from app.modules.worker_schedule.repository import WorkerScheduleRepository
    mock_repo = AsyncMock(spec=WorkerScheduleRepository)
    mock_repo.delete_weekly_schedule.return_value = True
    service = WorkerScheduleService(repository=mock_repo)
    worker_id = uuid4()
    schedule_id = uuid4()
    await service.delete_weekly_schedule(worker_id=worker_id, schedule_id=schedule_id)
    mock_repo.delete_weekly_schedule.assert_called_once_with(worker_id, schedule_id)
