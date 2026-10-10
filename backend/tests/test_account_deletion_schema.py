from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.modules.account.schemas import AccountDeletionRequestResponse


@pytest.mark.parametrize(
    "status",
    ["pending", "processing", "approved", "rejected", "cancelled"],
)
def test_account_deletion_response_accepts_supported_lifecycle_statuses(
    status: str,
) -> None:
    now = datetime.now(UTC)

    response = AccountDeletionRequestResponse(
        id=uuid4(),
        reason=None,
        status=status,
        requested_at=now,
        reviewed_at=now if status != "pending" else None,
    )

    assert response.status == status


def test_account_deletion_response_rejects_unknown_status() -> None:
    with pytest.raises(ValidationError):
        AccountDeletionRequestResponse(
            id=uuid4(),
            reason=None,
            status="erased",
            requested_at=datetime.now(UTC),
            reviewed_at=None,
        )