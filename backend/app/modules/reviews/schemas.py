from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class CustomerReviewResponse(BaseModel):
    id: UUID
    booking_id: UUID
    occurrence_id: UUID | None
    customer_id: UUID
    worker_id: UUID
    rating: int
    comment: str | None
    created_at: datetime


class CustomerReviewableOccurrenceResponse(BaseModel):
    id: UUID
    worker_id: UUID | None
    occurrence_index: int
    status: str


class CustomerReviewSubmissionRequest(BaseModel):
    occurrence_id: UUID | None = None
    rating: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)

    @field_validator("comment")
    @classmethod
    def normalize_comment(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None
