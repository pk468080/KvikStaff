from unittest.mock import AsyncMock
from uuid import uuid4
import pytest
from sqlalchemy.exc import SQLAlchemyError
from app.modules.account.service import AccountDeletionService
from app.modules.account.repository import AccountDeletionRepository
from app.core.exceptions import AppError

@pytest.mark.asyncio
async def test_request_account_deletion_handles_value_error():
    # Arrange
    mock_repo = AsyncMock(spec=AccountDeletionRepository)
    mock_repo.request_account_deletion.side_effect = ValueError("Some validation error")

    service = AccountDeletionService(repository=mock_repo)
    customer_id = uuid4()

    # Act & Assert
    with pytest.raises(AppError) as exc_info:
        await service.request_account_deletion(customer_id=customer_id, reason="No longer need it")

    assert exc_info.value.code == "ACCOUNT_DELETION_REQUEST_FAILED"
    assert exc_info.value.status_code == 400
    assert "Some validation error" in str(exc_info.value.message)

@pytest.mark.asyncio
async def test_request_account_deletion_handles_sqlalchemy_error():
    # Arrange
    mock_repo = AsyncMock(spec=AccountDeletionRepository)
    class MockSQLAlchemyError(SQLAlchemyError):
        def __init__(self):
            super().__init__("Database error")

    mock_repo.request_account_deletion.side_effect = MockSQLAlchemyError()

    service = AccountDeletionService(repository=mock_repo)
    customer_id = uuid4()

    # Act & Assert
    with pytest.raises(AppError) as exc_info:
        await service.request_account_deletion(customer_id=customer_id, reason="No longer need it")

    assert exc_info.value.code == "ACCOUNT_DELETION_REQUEST_FAILED"
    assert exc_info.value.status_code == 400

@pytest.mark.asyncio
async def test_request_account_deletion_success():
    # Arrange
    mock_repo = AsyncMock(spec=AccountDeletionRepository)
    expected_response = {"id": str(uuid4()), "status": "pending"}
    mock_repo.request_account_deletion.return_value = expected_response

    service = AccountDeletionService(repository=mock_repo)
    customer_id = uuid4()

    # Act
    result = await service.request_account_deletion(customer_id=customer_id, reason="No longer need it")

    # Assert
    assert result == expected_response
    mock_repo.request_account_deletion.assert_called_once_with(
        customer_id=customer_id,
        reason="No longer need it"
    )
