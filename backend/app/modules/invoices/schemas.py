from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class CustomerInvoiceResponse(BaseModel):
    invoice_reference: str
    booking_id: UUID
    payment_id: UUID
    service_name: str
    booking_type: str | None
    scheduled_start: datetime | None
    scheduled_end: datetime | None
    working_hours: float | None
    completed_at: datetime | None
    subtotal: float
    discount_amount: float
    platform_fee: float
    tax_amount: float
    total_amount: float
    currency: str
    payment_status: str
    payment_provider: str
    provider_payment_id: str | None
    provider_order_id: str | None
    paid_at: datetime | None
    created_at: datetime | None
