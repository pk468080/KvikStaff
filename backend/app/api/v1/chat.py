from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends

from app.core.database import get_db
from app.core.security import CurrentUser, get_customer
from app.modules.chat.repository import ChatRepository
from app.modules.chat.schemas import (
    CustomerBookingChatCreateRequest,
    CustomerBookingChatResponse,
    CustomerChatMessageRequest,
    CustomerChatMessageResponse,
)
from app.modules.chat.service import ChatService

router = APIRouter()


def get_chat_service(
    db=Depends(get_db),
) -> ChatService:
    return ChatService(
        ChatRepository(db)
    )


@router.post(
    "/bookings/{booking_id}/conversation",
    response_model=CustomerBookingChatResponse,
)
async def get_or_create_booking_chat(
    booking_id: UUID,
    request: CustomerBookingChatCreateRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: ChatService = Depends(get_chat_service),
) -> dict[str, Any]:
    return await service.get_or_create_customer_booking_chat(
        customer_id=UUID(current_user.id),
        booking_id=booking_id,
        worker_id=request.worker_id,
        occurrence_id=request.occurrence_id,
    )


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[CustomerChatMessageResponse],
)
async def get_booking_chat_messages(
    conversation_id: UUID,
    current_user: CurrentUser = Depends(get_customer),
    service: ChatService = Depends(get_chat_service),
) -> list[dict[str, Any]]:
    return await service.get_customer_chat_messages(
        customer_id=UUID(current_user.id),
        conversation_id=conversation_id,
    )


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=CustomerChatMessageResponse,
)
async def send_booking_chat_message(
    conversation_id: UUID,
    request: CustomerChatMessageRequest,
    current_user: CurrentUser = Depends(get_customer),
    service: ChatService = Depends(get_chat_service),
) -> dict[str, Any]:
    return await service.send_customer_chat_message(
        customer_id=UUID(current_user.id),
        conversation_id=conversation_id,
        body=request.body,
    )
