import { supabase } from '../../lib/supabase'

export type CustomerSupportCategory =
  | 'booking'
  | 'payment'
  | 'worker'
  | 'refund'
  | 'technical'

export type CustomerSupportTicket = {
  id: string
  category: CustomerSupportCategory
  subject: string
  description: string
  status:
    | 'open'
    | 'in_progress'
    | 'resolved'
    | 'closed'
  bookingId: string | null
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
}

async function getAuthenticatedUserId() {
  const {
    data,
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!data.user) {
    throw new Error(
      'A customer authentication session is required.',
    )
  }

  return data.user.id
}

export async function createCustomerSupportTicket(
  input: {
    category: CustomerSupportCategory
    subject: string
    description: string
    bookingId?: string | null
    paymentId?: string | null
    workerId?: string | null
    refundRequestId?: string | null
    paymentRefundId?: string | null
  },
): Promise<CustomerSupportTicket> {
  await getAuthenticatedUserId()

  const subject =
    input.subject.trim()
  const description =
    input.description.trim()

  if (!subject) {
    throw new Error(
      'Please enter a subject.',
    )
  }

  if (!description) {
    throw new Error(
      'Please describe the issue.',
    )
  }

  const {
    data,
    error,
  } = await supabase.rpc(
    'create_support_ticket',
    {
      p_category: input.category,
      p_subject: subject,
      p_description:
        description,
      p_booking_id:
        input.bookingId ?? null,
      p_payment_id:
        input.paymentId ?? null,
      p_worker_id:
        input.workerId ?? null,
      p_refund_request_id:
        input.refundRequestId ??
        null,
      p_payment_refund_id:
        input.paymentRefundId ??
        null,
    },
  )

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'The support request was not created.',
    )
  }

  return mapTicket(data)
}

export async function getCustomerSupportTickets(): Promise<
  CustomerSupportTicket[]
> {
  await getAuthenticatedUserId()

  const {
    data,
    error,
  } = await supabase
    .from('support_tickets')
    .select(
      `
        id,
        category,
        subject,
        description,
        status,
        booking_id,
        created_at,
        updated_at,
        resolved_at
      `,
    )
    .order(
      'created_at',
      {
        ascending: false,
      },
    )

  if (error) {
    throw error
  }

  return (data ?? []).map(
    row => mapTicket(row),
  )
}

function mapTicket(
  row: Record<string, any>,
): CustomerSupportTicket {
  return {
    id: row.id,
    category:
      row.category as CustomerSupportCategory,
    subject: row.subject,
    description:
      row.description,
    status: row.status,
    bookingId:
      row.booking_id ?? null,
    createdAt:
      row.created_at,
    updatedAt:
      row.updated_at,
    resolvedAt:
      row.resolved_at ?? null,
  }
}
