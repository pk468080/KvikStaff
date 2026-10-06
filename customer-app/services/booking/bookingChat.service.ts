import { apiRequest } from '../../lib/api'

export type BookingChatMessage = {
  id: string
  senderId: string
  senderRole: 'customer' | 'worker'
  body: string
  createdAt: string
}

export type CustomerBookingChatSession = {
  conversationId: string
  currentUserId: string
}

function validateId(
  value: string,
  label: string,
): void {
  if (!value.trim()) {
    throw new Error(`${label} is required.`)
  }
}

function normalizeMessage(
  value: string,
): string {
  const body = value.trim()

  if (!body) {
    throw new Error(
      'Enter a message before sending.',
    )
  }

  if (body.length > 4000) {
    throw new Error(
      'Messages cannot be longer than 4,000 characters.',
    )
  }

  return body
}

function mapMessage(
  row: Record<string, unknown>,
): BookingChatMessage {
  if (
    typeof row.id !== 'string' ||
    typeof row.sender_id !== 'string' ||
    typeof row.body !== 'string' ||
    typeof row.created_at !== 'string'
  ) {
    throw new Error(
      'The backend returned an invalid chat message.',
    )
  }

  const senderRole =
    row.sender_role === 'customer' ||
    row.sender_role === 'worker'
      ? row.sender_role
      : null

  if (!senderRole) {
    throw new Error(
      'The backend returned an invalid chat sender role.',
    )
  }

  return {
    id: row.id,
    senderId: row.sender_id,
    senderRole,
    body: row.body,
    createdAt: row.created_at,
  }
}

export async function getOrCreateCustomerBookingChat(
  bookingId: string,
  workerId: string,
  occurrenceId: string | null = null,
): Promise<CustomerBookingChatSession> {
  validateId(bookingId, 'Booking id')
  validateId(workerId, 'Worker id')

  const result =
    await apiRequest<{
      conversation_id: string
      current_user_id: string
    }>(
      `/chat/bookings/${encodeURIComponent(
        bookingId.trim(),
      )}/conversation`,
      {
        method: 'POST',
        body: JSON.stringify({
          worker_id: workerId.trim(),
          occurrence_id: occurrenceId ?? null,
        }),
      },
    )

  if (
    typeof result.conversation_id !== 'string' ||
    typeof result.current_user_id !== 'string'
  ) {
    throw new Error(
      'The backend returned an invalid chat session.',
    )
  }

  return {
    conversationId: result.conversation_id,
    currentUserId: result.current_user_id,
  }
}

export async function getBookingChatMessages(
  conversationId: string,
): Promise<BookingChatMessage[]> {
  validateId(conversationId, 'Conversation id')

  const result =
    await apiRequest<unknown[]>(
      `/chat/conversations/${encodeURIComponent(
        conversationId.trim(),
      )}/messages`,
    )

  return result.map(
    row =>
      mapMessage(
        row as Record<string, unknown>,
      ),
  )
}

export async function sendCustomerBookingChatMessage(
  conversationId: string,
  value: string,
): Promise<BookingChatMessage> {
  validateId(conversationId, 'Conversation id')

  const result =
    await apiRequest<unknown>(
      `/chat/conversations/${encodeURIComponent(
        conversationId.trim(),
      )}/messages`,
      {
        method: 'POST',
        body: JSON.stringify({
          body: normalizeMessage(value),
        }),
      },
    )

  return mapMessage(
    result as Record<string, unknown>,
  )
}
