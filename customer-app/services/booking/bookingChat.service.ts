import { supabase } from '../../lib/supabase'

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

type BookingChatMessageRow = {
  id: string
  sender_id: string
  sender_role: 'customer' | 'worker'
  body: string
  created_at: string
}

function mapMessage(
  row: BookingChatMessageRow,
): BookingChatMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  }
}

async function getCurrentCustomerId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error(
      'A customer authentication session is required to use chat.',
    )
  }

  return user.id
}

function validateId(
  value: string,
  label: string,
): void {
  if (!value.trim()) {
    throw new Error(
      `${label} is required.`,
    )
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

async function findConversation(
  bookingId: string,
  occurrenceId: string | null,
): Promise<string | null> {
  let query = supabase
    .from('conversations')
    .select('id')
    .eq('booking_id', bookingId)

  query = occurrenceId
    ? query.eq('occurrence_id', occurrenceId)
    : query.is('occurrence_id', null)

  const {
    data,
    error,
  } = await query.maybeSingle()

  if (error) {
    throw error
  }

  return data?.id ?? null
}

export async function getOrCreateCustomerBookingChat(
  bookingId: string,
  workerId: string,
  occurrenceId: string | null = null,
): Promise<CustomerBookingChatSession> {
  validateId(
    bookingId,
    'Booking id',
  )

  validateId(
    workerId,
    'Worker id',
  )

  const customerId =
    await getCurrentCustomerId()

  const existingConversationId =
    await findConversation(
      bookingId,
      occurrenceId,
    )

  if (existingConversationId) {
    return {
      conversationId:
        existingConversationId,
      currentUserId: customerId,
    }
  }

  const {
    data,
    error,
  } = await supabase
    .from('conversations')
    .insert({
      booking_id: bookingId,
      occurrence_id: occurrenceId,
      customer_id: customerId,
      worker_id: workerId,
    })
    .select('id')
    .single()

  if (!error && data?.id) {
    return {
      conversationId: data.id,
      currentUserId: customerId,
    }
  }

  /*
   * Customer and worker can open chat at
   * the same time. The database's unique
   * booking/occurrence index resolves that race.
   */
  if (error?.code === '23505') {
    const conversationId =
      await findConversation(
        bookingId,
        occurrenceId,
      )

    if (conversationId) {
      return {
        conversationId,
        currentUserId: customerId,
      }
    }
  }

  throw error ?? new Error(
    'Unable to start the booking chat.',
  )
}

export async function getBookingChatMessages(
  conversationId: string,
): Promise<BookingChatMessage[]> {
  validateId(
    conversationId,
    'Conversation id',
  )

  const {
    data,
    error,
  } = await supabase
    .from('messages')
    .select(
      'id, sender_id, sender_role, body, created_at',
    )
    .eq(
      'conversation_id',
      conversationId,
    )
    .is('deleted_at', null)
    .order('created_at', {
      ascending: true,
    })
    .limit(100)

  if (error) {
    throw error
  }

  return (data ?? []).map(
    row =>
      mapMessage(
        row as BookingChatMessageRow,
      ),
  )
}

export async function sendCustomerBookingChatMessage(
  conversationId: string,
  value: string,
): Promise<BookingChatMessage> {
  const customerId =
    await getCurrentCustomerId()

  const {
    data,
    error,
  } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: customerId,
      sender_role: 'customer',
      body: normalizeMessage(value),
    })
    .select(
      'id, sender_id, sender_role, body, created_at',
    )
    .single()

  if (error) {
    throw error
  }

  return mapMessage(
    data as BookingChatMessageRow,
  )
}
