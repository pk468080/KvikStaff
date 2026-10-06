from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

CustomerSupportCategory = Literal["booking", "payment", "worker", "refund", "technical"]
CustomerSupportStatus = Literal["open", "in_progress", "resolved", "closed"]


class CustomerSupportTicketResponse(BaseModel):
    id: UUID
    category: CustomerSupportCategory
    subject: str
    description: str
    status: CustomerSupportStatus
    booking_id: UUID | None
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None


class CustomerSupportTicketCreateRequest(BaseModel):
    category: CustomerSupportCategory
    subject: str = Field(min_length=1, max_length=500)
    description: str = Field(min_length=1, max_length=5000)
    booking_id: UUID | None = None
    payment_id: UUID | None = None
    worker_id: UUID | None = None
    refund_request_id: UUID | None = None
    payment_refund_id: UUID | None = None

    @field_validator("subject", "description")
    @classmethod
    def normalize_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Subject and description are required.")
        return normalized
