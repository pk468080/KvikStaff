from typing import Literal

from pydantic import BaseModel, Field


class CustomerNotificationResponse(BaseModel):
    id: str
    booking_id: str | None
    title: str
    message: str
    notification_type: str | None
    is_read: bool
    created_at: str


class CustomerPushTokenRequest(BaseModel):
    token: str = Field(
        min_length=1,
        max_length=255,
    )
    platform: Literal[
        "android",
        "ios",
        "web",
    ] | None = None


class CustomerPushTokenResponse(BaseModel):
    id: str
    user_id: str
    token: str
    platform: str | None
    is_active: bool
    created_at: str
    updated_at: str