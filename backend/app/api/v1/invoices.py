from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import CurrentUser, get_customer
from app.modules.invoices.repository import InvoicesRepository
from app.modules.invoices.schemas import CustomerInvoiceResponse
from app.modules.invoices.service import InvoicesService

router = APIRouter()


def get_invoices_service(
    db=Depends(get_db),
) -> InvoicesService:
    return InvoicesService(
        InvoicesRepository(db)
    )


@router.get(
    "/bookings/{booking_id}",
    response_model=CustomerInvoiceResponse,
)
async def get_customer_booking_invoice(
    booking_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: InvoicesService = Depends(
        get_invoices_service
    ),
) -> dict[str, Any]:
    return await service.get_customer_invoice(
        customer_id=UUID(current_user.id),
        booking_id=booking_id,
    )
