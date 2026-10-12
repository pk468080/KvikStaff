import pytest
from datetime import datetime, timedelta, timezone, time
from uuid import uuid4

from app.modules.availability.service import AvailabilityService
from app.modules.availability.schemas import InstantAvailabilitySlotsResponse
from app.modules.availability.repository import AvailabilityRepository


class MockAddress:
    def __init__(self):
        self.latitude = 12.9716
        self.longitude = 77.5946


class MockServiceContext:
    def __init__(self):
        self.service_id = uuid4()


class MockRepository(AvailabilityRepository):
    def __init__(self):
        self.call_count = 0
        self.bulk_call_count = 0

    async def get_active_hourly_service_variant(self, variant_id):
        return MockServiceContext()

    async def get_customer_address(self, address_id, customer_id):
        return MockAddress()

    async def is_service_area_available(self, service_id, lat, lng):
        return True

    async def get_platform_setting_value(self, key, default):
        # We want to force a larger time window to get more cursor iterations
        if key == "operations.default_start_time":
            return "00:00:00"
        if key == "operations.default_end_time":
            return "23:59:59"
        return default

    async def count_instant_slot_workers(
        self, service_id, latitude, longitude, start, end
    ):
        self.call_count += 1
        return 1

    async def count_instant_slot_workers_bulk(
        self, service_id, latitude, longitude, slots
    ):
        self.bulk_call_count += 1
        return {slot: 1 for slot in slots}


@pytest.mark.asyncio
async def test_instant_availability_slots_performance():
    mock_repo = MockRepository()
    service = AvailabilityService(repository=mock_repo)

    import time

    start_time = time.time()
    await service.get_instant_availability_slots(
        service_variant_id=uuid4(),
        address_id=uuid4(),
        duration_hours=1.0,
        customer_id=uuid4(),
    )
    end_time = time.time()

    print(f"\nExecution time: {end_time - start_time:.4f}s")
    print(f"Number of individual repository calls: {mock_repo.call_count}")
    print(f"Number of bulk repository calls: {mock_repo.bulk_call_count}")
