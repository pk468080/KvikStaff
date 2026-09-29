import { supabase } from '../../lib/supabase'

export type WorkerBookingContext = {
  bookingId: string
  customerId: string
  customerName: string | null
  serviceId: string
  serviceName: string | null
  variantId: string | null
  variantName: string | null
  addressId: string
  addressLabel: string | null
  addressLine: string | null
  latitude: number | null
  longitude: number | null
}

type WorkerBookingContextRaw = {
  booking_id?: unknown
  customer_id?: unknown
  customer_name?: unknown
  service_id?: unknown
  service_name?: unknown
  variant_id?: unknown
  variant_name?: unknown
  address_id?: unknown
  address_label?: unknown
  address_line?: unknown
  latitude?: unknown
  longitude?: unknown
}

function validateBookingId(bookingId: string): void {
  if (!bookingId.trim()) {
    throw new Error('Booking id is required.')
  }
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function parseWorkerBookingContext(
  value: unknown,
): WorkerBookingContext {
  if (!value || typeof value !== 'object') {
    throw new Error('Booking context response is invalid.')
  }

  const row = value as WorkerBookingContextRaw

  const bookingId = asString(row.booking_id)
  const customerId = asString(row.customer_id)
  const serviceId = asString(row.service_id)
  const addressId = asString(row.address_id)

  if (!bookingId || !customerId || !serviceId || !addressId) {
    throw new Error('Booking context is incomplete.')
  }

  return {
    bookingId,
    customerId,
    customerName: asString(row.customer_name),
    serviceId,
    serviceName: asString(row.service_name),
    variantId: asString(row.variant_id),
    variantName: asString(row.variant_name),
    addressId,
    addressLabel: asString(row.address_label),
    addressLine: asString(row.address_line),
    latitude: asNumber(row.latitude),
    longitude: asNumber(row.longitude),
  }
}

export async function getWorkerBookingContext(
  bookingId: string,
): Promise<WorkerBookingContext | null> {
  validateBookingId(bookingId)

  const { data, error } = await supabase.rpc(
    'worker_get_booking_context',
    {
      p_booking_id: bookingId,
    },
  )

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return parseWorkerBookingContext(data)
}
