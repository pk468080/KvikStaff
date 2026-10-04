from uuid import UUID

from pydantic import BaseModel, Field


class ServiceResponse(BaseModel):
    id: UUID
    service_variant_id: UUID
    name: str
    description: str | None
    hourly_price: float
    currency: str | None
    image_url: str | None
    display_order: int
    is_featured: bool
    category_id: UUID | None
    category_name: str | None


class ServiceListResponse(BaseModel):
    services: list[ServiceResponse]


class ServiceLocationQuery(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)