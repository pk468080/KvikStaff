from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession


class ChatRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_or_create_customer_booking_chat(
        self,
        customer_id: UUID,
        booking_id: UUID,
        worker_id: UUID,
        occurrence_id: UUID | None,
    ) -> dict[str, Any]:
        async with self.db.begin():
            booking_result = await self.db.execute(
                text(
                    '''
                    SELECT
                        id,
                        customer_id,
                        worker_id,
                        status::text AS status,
                        fulfillment_type::text AS fulfillment_type
                    FROM public.bookings
                    WHERE id = :booking_id
                      AND customer_id = :customer_id
                    FOR UPDATE
                    '''
                ),
                {
                    "booking_id": str(booking_id),
                    "customer_id": str(customer_id),
                },
            )
            booking = booking_result.mappings().first()

            if booking is None:
                raise ValueError(
                    "Booking not found or unavailable."
                )

            booking_worker_id = booking["worker_id"]

            if booking_worker_id is None:
                raise ValueError(
                    "A worker must be assigned before chat can be started."
                )

            if str(booking_worker_id) != str(worker_id):
                raise ValueError(
                    "The selected worker is not assigned to this booking."
                )

            resolved_occurrence_id = occurrence_id

            if booking["fulfillment_type"] == "recurring":
                if resolved_occurrence_id is None:
                    raise ValueError(
                        "Occurrence ID is required for recurring booking chat."
                    )

                occurrence_result = await self.db.execute(
                    text(
                        '''
                        SELECT
                            id,
                            worker_id,
                            status::text AS status
                        FROM public.booking_schedule_occurrences
                        WHERE id = :occurrence_id
                          AND booking_id = :booking_id
                        FOR UPDATE
                        '''
                    ),
                    {
                        "occurrence_id": str(resolved_occurrence_id),
                        "booking_id": str(booking_id),
                    },
                )
                occurrence = occurrence_result.mappings().first()

                if occurrence is None:
                    raise ValueError(
                        "Booking occurrence not found."
                    )

                if occurrence["worker_id"] is None:
                    raise ValueError(
                        "A worker must be assigned to this occurrence before chat can be started."
                    )

                if str(occurrence["worker_id"]) != str(worker_id):
                    raise ValueError(
                        "The selected worker is not assigned to this occurrence."
                    )
            elif resolved_occurrence_id is not None:
                raise ValueError(
                    "Occurrence ID is only valid for recurring bookings."
                )

            existing_result = await self.db.execute(
                text(
                    '''
                    SELECT
                        id,
                        customer_id,
                        worker_id
                    FROM public.conversations
                    WHERE booking_id = :booking_id
                      AND (
                          (:occurrence_id IS NULL AND occurrence_id IS NULL)
                          OR occurrence_id = :occurrence_id
                      )
                    LIMIT 1
                    '''
                ),
                {
                    "booking_id": str(booking_id),
                    "occurrence_id": (
                        str(resolved_occurrence_id)
                        if resolved_occurrence_id is not None
                        else None
                    ),
                },
            )
            existing = existing_result.mappings().first()

            if existing is not None:
                if str(existing["customer_id"]) != str(customer_id):
                    raise ValueError(
                        "You do not have access to this booking chat."
                    )

                if str(existing["worker_id"]) != str(worker_id):
                    raise ValueError(
                        "The existing chat worker assignment does not match this booking."
                    )

                return {
                    "conversation_id": existing["id"],
                    "current_user_id": customer_id,
                }

            try:
                insert_result = await self.db.execute(
                    text(
                        '''
                        INSERT INTO public.conversations (
                            booking_id,
                            occurrence_id,
                            customer_id,
                            worker_id
                        )
                        VALUES (
                            :booking_id,
                            :occurrence_id,
                            :customer_id,
                            :worker_id
                        )
                        RETURNING id
                        '''
                    ),
                    {
                        "booking_id": str(booking_id),
                        "occurrence_id": (
                            str(resolved_occurrence_id)
                            if resolved_occurrence_id is not None
                            else None
                        ),
                        "customer_id": str(customer_id),
                        "worker_id": str(worker_id),
                    },
                )
            except IntegrityError:
                existing_result = await self.db.execute(
                    text(
                        '''
                        SELECT
                            id,
                            customer_id,
                            worker_id
                        FROM public.conversations
                        WHERE booking_id = :booking_id
                          AND (
                              (:occurrence_id IS NULL AND occurrence_id IS NULL)
                              OR occurrence_id = :occurrence_id
                          )
                        LIMIT 1
                        '''
                    ),
                    {
                        "booking_id": str(booking_id),
                        "occurrence_id": (
                            str(resolved_occurrence_id)
                            if resolved_occurrence_id is not None
                            else None
                        ),
                    },
                )
                existing = existing_result.mappings().first()

                if existing is None:
                    raise ValueError(
                        "Unable to start the booking chat."
                    )

                if str(existing["customer_id"]) != str(customer_id):
                    raise ValueError(
                        "You do not have access to this booking chat."
                    )

                if str(existing["worker_id"]) != str(worker_id):
                    raise ValueError(
                        "The existing chat worker assignment does not match this booking."
                    )

                return {
                    "conversation_id": existing["id"],
                    "current_user_id": customer_id,
                }

            row = insert_result.mappings().one()

            return {
                "conversation_id": row["id"],
                "current_user_id": customer_id,
            }

    async def get_customer_chat_messages(
        self,
        customer_id: UUID,
        conversation_id: UUID,
    ) -> list[dict[str, Any]]:
        async with self.db.begin():
            access_result = await self.db.execute(
                text(
                    '''
                    SELECT id
                    FROM public.conversations
                    WHERE id = :conversation_id
                      AND customer_id = :customer_id
                    LIMIT 1
                    '''
                ),
                {
                    "conversation_id": str(conversation_id),
                    "customer_id": str(customer_id),
                },
            )

            if access_result.scalar_one_or_none() is None:
                raise ValueError(
                    "Chat conversation not found or unavailable."
                )

            result = await self.db.execute(
                text(
                    '''
                    SELECT
                        id,
                        sender_id,
                        sender_role,
                        body,
                        created_at
                    FROM public.messages
                    WHERE conversation_id = :conversation_id
                      AND deleted_at IS NULL
                    ORDER BY created_at ASC
                    LIMIT 100
                    '''
                ),
                {
                    "conversation_id": str(conversation_id),
                },
            )

            return [
                dict(row)
                for row in result.mappings().all()
            ]

    async def send_customer_chat_message(
        self,
        customer_id: UUID,
        conversation_id: UUID,
        body: str,
    ) -> dict[str, Any]:
        async with self.db.begin():
            access_result = await self.db.execute(
                text(
                    '''
                    SELECT id
                    FROM public.conversations
                    WHERE id = :conversation_id
                      AND customer_id = :customer_id
                    FOR UPDATE
                    '''
                ),
                {
                    "conversation_id": str(conversation_id),
                    "customer_id": str(customer_id),
                },
            )

            if access_result.scalar_one_or_none() is None:
                raise ValueError(
                    "Chat conversation not found or unavailable."
                )

            insert_result = await self.db.execute(
                text(
                    '''
                    INSERT INTO public.messages (
                        conversation_id,
                        sender_id,
                        sender_role,
                        message_type,
                        body
                    )
                    VALUES (
                        :conversation_id,
                        :sender_id,
                        'customer',
                        'text',
                        :body
                    )
                    RETURNING
                        id,
                        sender_id,
                        sender_role,
                        body,
                        created_at
                    '''
                ),
                {
                    "conversation_id": str(conversation_id),
                    "sender_id": str(customer_id),
                    "body": body,
                },
            )

            await self.db.execute(
                text(
                    '''
                    UPDATE public.conversations
                    SET
                        last_message_at = now(),
                        updated_at = now()
                    WHERE id = :conversation_id
                    '''
                ),
                {
                    "conversation_id": str(conversation_id),
                },
            )

            return dict(insert_result.mappings().one())
