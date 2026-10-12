from uuid import UUID

from pydantic import BaseModel


class HomePromotionResponse(BaseModel):
    id: UUID
    title: str
    subtitle: str | None
    cta_text: str | None
    service_id: UUID | None
    image_url: str | None
    sort_order: int


class HomeFavouriteResponse(BaseModel):
    service_id: UUID
    is_favourite: bool


class HomeRebookResponse(BaseModel):
    service_id: UUID
    created_at: str
    duration_value: float | None
    duration_unit: str | None
    scheduled_start: str | None