import { supabase } from '../../lib/supabase'

export type WorkerBookingChatMessage = {
  id: string
  senderId: string
  senderRole: 'customer' | 'worker'
  body: string
  createdAt: string
}

export type WorkerBookingChatSession = {
  conversationId: string
  currentUserId: string
}

type WorkerBookingChatMessageRow = {
  id: string
  sender_id: string
  sender_role: 'customer' | 'worker'
  body: string
  created_at: string
}

function mapMessage(
  row: WorkerBookingChatMessageRow,
): WorkerBookingChatMessage {
  return {
    id: row.id,
    senderId: row.sender_id,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  }
}

async function getCurrentWorkerId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error(
      'A worker authentication session is required to use chat.',
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

export async function getOrCreateWorkerBookingChat(
  bookingId: string,
  customerId: string,
  occurrenceId: string | null = null,
): Promise<WorkerBookingChatSession> {
  validateId(
    bookingId,
    'Booking id',
  )

  validateId(
    customerId,
    'Customer id',
  )

  const workerId =
    await getCurrentWorkerId()

  const existingConversationId =
    await findConversation(
      bookingId,
      occurrenceId,
    )

  if (existingConversationId) {
    return {
      conversationId:
        existingConversationId,
      currentUserId: workerId,
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
      currentUserId: workerId,
    }
  }

  if (error?.code === '23505') {
    const conversationId =
      await findConversation(
        bookingId,
        occurrenceId,
      )

    if (conversationId) {
      return {
        conversationId,
        currentUserId: workerId,
      }
    }
  }

  throw error ?? new Error(
    'Unable to start the booking chat.',
  )
}

export async function getWorkerBookingChatMessages(
  conversationId: string,
): Promise<WorkerBookingChatMessage[]> {
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
        row as WorkerBookingChatMessageRow,
      ),
  )
}

export async function sendWorkerBookingChatMessage(
  conversationId: string,
  value: string,
): Promise<WorkerBookingChatMessage> {
  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: workerId,
      sender_role: 'worker',
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
    data as WorkerBookingChatMessageRow,
  )
}
