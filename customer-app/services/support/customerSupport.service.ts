import { apiRequest } from '../../lib/api'

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

type CustomerSupportTicketApi = {
  id: string
  category: CustomerSupportCategory
  subject: string
  description: string
  status:
    | 'open'
    | 'in_progress'
    | 'resolved'
    | 'closed'
  booking_id: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
}

function mapTicket(
  row: CustomerSupportTicketApi,
): CustomerSupportTicket {
  return {
    id: row.id,
    category: row.category,
    subject: row.subject,
    description: row.description,
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

  const response =
    await apiRequest<CustomerSupportTicketApi>(
      '/support/tickets',
      {
        method: 'POST',
        body: JSON.stringify({
          category:
            input.category,
          subject,
          description,
          booking_id:
            input.bookingId ?? null,
          payment_id:
            input.paymentId ?? null,
          worker_id:
            input.workerId ?? null,
          refund_request_id:
            input.refundRequestId ?? null,
          payment_refund_id:
            input.paymentRefundId ?? null,
        }),
      },
    )

  return mapTicket(response)
}

export async function getCustomerSupportTickets(): Promise<
  CustomerSupportTicket[]
> {
  const response =
    await apiRequest<
      CustomerSupportTicketApi[]
    >('/support/tickets')

  return (response ?? []).map(
    mapTicket,
  )
}