from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

AccountDeletionStatus = Literal[
    "pending",
    "approved",
    "rejected",
]


class AccountDeletionRequestResponse(BaseModel):
    id: UUID
    reason: str | None
    status: AccountDeletionStatus
    requested_at: datetime
    reviewed_at: datetime | None


class AccountDeletionRequestCreateRequest(BaseModel):
    reason: str | None = Field(
        default=None,
        max_length=1000,
    )

    @field_validator("reason")
    @classmethod
    def normalize_reason(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        normalized = value.strip()
        return normalized or None