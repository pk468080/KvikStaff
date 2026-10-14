import {
  apiRequest,
} from '../../lib/api'

import type { BookingCreationResult, BookingLocationInput } from '../../types/booking'

export type CreateInstantBookingInput = {
  serviceVariantId: string
  location: BookingLocationInput
  startTime: string
  endTime: string
  notes?: string | null
}

export async function createCustomerInstantBooking(
  input: CreateInstantBookingInput,
  idempotencyKey: string,
): Promise<BookingCreationResult> {
  const result =
    await apiRequest<BookingCreationResult>(
      '/bookings/instant',
      {
        method: 'POST',
        idempotencyKey,
        body: JSON.stringify({
          service_variant_id:
            input.serviceVariantId,
          location: {
            latitude: input.location.latitude,
            longitude: input.location.longitude,
            address: input.location.address,
          },
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