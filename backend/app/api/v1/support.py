from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import CurrentUser, get_customer
from app.modules.support.repository import SupportRepository
from app.modules.support.schemas import (
    CustomerSupportTicketCreateRequest,
    CustomerSupportTicketResponse,
)
from app.modules.support.service import SupportService

router = APIRouter()


def get_support_service(db=Depends(get_db)) -> SupportService:
    return SupportService(SupportRepository(db))


@router.get(
    "/tickets",
    response_model=list[CustomerSupportTicketResponse],
)
async def get_customer_support_tickets(
    current_user: CurrentUser = Depends(get_customer),
    service: SupportService = Depends(get_support_service),
) -> list[dict[str, Any]]:
    return await service.get_customer_support_tickets(UUID(current_user.id))


@router.post(
    "/tickets",
    response_model=CustomerSupportTicketResponse,
)
async def create_customer_support_ticket(
    request: CustomerSupportTicketCreateRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: SupportService = Depends(get_support_service),
) -> dict[str, Any]:
    return await service.create_customer_support_ticket(
        customer_id=UUID(current_user.id),
        category=request.category,
        subject=request.subject,
        description=request.description,
        booking_id=request.booking_id,
        payment_id=request.payment_id,
        worker_id=request.worker_id,
        refund_request_id=request.refund_request_id,
        payment_refund_id=request.payment_refund_id,
    )
