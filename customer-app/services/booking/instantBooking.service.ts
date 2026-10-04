import { apiRequest } from '../../lib/api'

import type { BookingCreationResult } from '../../types/booking'

export type CreateInstantBookingInput = {
  serviceVariantId: string
  addressId: string
  startTime: string
  endTime: string
  notes?: string | null
}

export async function createCustomerInstantBooking(
  input: CreateInstantBookingInput,
): Promise<BookingCreationResult> {
  const result =
    await apiRequest<BookingCreationResult>(
      '/bookings/instant',
      {
        method: 'POST',
        body: JSON.stringify({
          service_variant_id:
            input.serviceVariantId,
          address_id:
            input.addressId,
          scheduled_start:
            input.startTime,
          scheduled_end:
            input.endTime,
          notes:
            input.notes?.trim() || null,
        }),
      },
    )

  if (!result) {
    throw new Error(
      'The backend did not return a booking result.',
    )
  }

  return result
}