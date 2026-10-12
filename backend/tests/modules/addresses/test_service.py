from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID

import pytest

from app.core.exceptions import AppError
from app.modules.addresses.repository import AddressesRepository, CustomerAddressRow
from app.modules.addresses.schemas import CustomerAddressCreateRequest
from app.modules.addresses.service import AddressesService

@pytest.fixture
def repository():
    repo = MagicMock(spec=AddressesRepository)
    repo.db = MagicMock()
    repo.db.commit = AsyncMock()
    repo.db.rollback = AsyncMock()
    return repo


@pytest.fixture
def service(repository):
    return AddressesService(repository)



@pytest.mark.asyncio
async def test_get_addresses_failure(service, repository):
    customer_id = UUID("11111111-1111-1111-1111-111111111111")

    repository.get_customer_addresses = AsyncMock(side_effect=Exception("Database error"))

    with pytest.raises(AppError) as exc_info:
        await service.get_addresses(customer_id)

    assert exc_info.value.code == "ADDRESS_FETCH_FAILED"
    assert exc_info.value.status_code == 400
