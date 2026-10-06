from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class CustomerBookingChatResponse(BaseModel):
    conversation_id: UUID
    current_user_id: UUID


class CustomerChatMessageResponse(BaseModel):
    id: UUID
    sender_id: UUID
    sender_role: str
    body: str
    created_at: str


class CustomerBookingChatCreateRequest(BaseModel):
    worker_id: UUID
    occurrence_id: UUID | None = None


class CustomerChatMessageRequest(BaseModel):
    body: str = Field(min_length=1, max_length=4000)

    @field_validator("body")
    @classmethod
    def normalize_body(cls, value: str) -> str:
        normalized = value.strip()

        if not normalized:
            raise ValueError(
                "Enter a message before sending."
            )

        return normalized
