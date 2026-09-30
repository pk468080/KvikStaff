import { supabase } from '../../lib/supabase'

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
  refund_id?: string
}

export async function cancelCustomerBooking(
  bookingId: string,
  bookingType?: string | null,
): Promise<CustomerCancellationResult> {
  const functionName =
    bookingType === 'recurring'
      ? 'cancel_customer_booking_series'
      : 'cancel_customer_booking'

  const { data, error } = await supabase.rpc(
    functionName,
    {
      p_booking_id: bookingId,
      p_reason: 'Customer cancellation',
    },
  )

  if (error) {
    throw new Error(error.message)
  }

  const result = data as CustomerCancellationResult | null

  if (!result?.success) {
    throw new Error('Unable to cancel the booking.')
  }

  return result
}

export async function getCustomerBookingRefunds(
  bookingId: string,
): Promise<CustomerRefundRecord[]> {
  const rpc = supabase.rpc as unknown as (
    functionName: string,
    args: { p_booking_id: string },
  ) => Promise<{
    data: unknown
    error: { message: string } | null
  }>

  const { data, error } = await rpc(
    'get_customer_booking_refunds',
    {
      p_booking_id: bookingId,
    },
  )

  if (error) {
    throw new Error(error.message)
  }

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

