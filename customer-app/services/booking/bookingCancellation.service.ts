import { apiRequest } from '../../lib/api'

export type CustomerRefundRecord = {
  id: string
  booking_id: string
  occurrence_id: string | null
  amount: number | string
  currency: string
  status: string
  requested_at: string | null
  processed_at: string | null
}

function isCustomerRefundRecord(
  value: unknown,
): value is CustomerRefundRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.id === 'string' &&
    typeof record.booking_id === 'string' &&
    (record.occurrence_id === null ||
      typeof record.occurrence_id === 'string') &&
    (typeof record.amount === 'number' ||
      typeof record.amount === 'string') &&
    typeof record.currency === 'string' &&
    typeof record.status === 'string' &&
    (record.requested_at === null ||
      typeof record.requested_at === 'string') &&
    (record.processed_at === null ||
      typeof record.processed_at === 'string')
  )
}

export type CustomerCancellationResult = {
  success: boolean
  booking_id?: string
  occurrence_id?: string
  status?: string
  refund?: {
    hours_before_start?: number
    refund_percentage?: number
    cancellation_fee?: number
    refund_amount?: number
    gross_amount?: number
  }
  refund_amount?: number
  refund_id?: string | null
}

export async function cancelCustomerBooking(
  bookingId: string,
  bookingType?: string | null,
): Promise<CustomerCancellationResult> {
  if (!bookingId) {
    throw new Error('Booking ID is required.')
  }

  const endpoint =
    bookingType === 'recurring'
      ? `/bookings/${bookingId}/cancel-series`
      : `/bookings/${bookingId}/cancel`

  return apiRequest<CustomerCancellationResult>(
    endpoint,
    {
      method: 'POST',
      body: JSON.stringify({
        reason: 'Customer cancellation',
      }),
    },
  )
}

export async function cancelCustomerBookingOccurrence(
  occurrenceId: string,
): Promise<CustomerCancellationResult> {
  if (!occurrenceId) {
    throw new Error('Occurrence ID is required.')
  }

  return apiRequest<CustomerCancellationResult>(
    `/bookings/occurrences/${occurrenceId}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify({
        reason: 'Customer cancellation',
      }),
    },
  )
}

export async function getCustomerBookingRefunds(
  bookingId: string,
): Promise<CustomerRefundRecord[]> {
  if (!bookingId) {
    throw new Error('Booking ID is required.')
  }

  const data = await apiRequest<unknown>(
    `/bookings/${bookingId}/refunds`,
    {
      method: 'GET',
    },
  )

  if (!Array.isArray(data)) {
    throw new Error(
      'Unable to load refund status.',
    )
  }

  if (!data.every(isCustomerRefundRecord)) {
    throw new Error(
      'Refund status response was invalid.',
    )
  }

  return data
}