from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator


class CustomerAddressCreateRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address: str = Field(min_length=1, max_length=500)
    label: str | None = Field(default=None, max_length=100)

    @field_validator("address")
    @classmethod
    def validate_address(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("A customer address is required.")

        return value

    @field_validator("label")
    @classmethod
    def normalize_label(cls, value: str | None) -> str | None:
        if value is None:
            return None

        value = value.strip()

        return value or None


class CustomerAddressResponse(BaseModel):
    id: UUID
    label: str | None
    address_line: str
    latitude: float
    longitude: float
    created_at: datetime


class CustomerAddressCreateResponse(BaseModel):
    address: CustomerAddressResponse