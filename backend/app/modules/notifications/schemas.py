from typing import Literal

from pydantic import BaseModel, Field


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
