import { apiRequest } from '../../lib/api'

import type {
  BookingCreationResult,
  MultiOccurrenceBookingInput,
} from '../../types/booking'

export async function createCustomerScheduledBooking(
  input: Omit<
    MultiOccurrenceBookingInput,
    'selectedWeekdays'
  > & {
    selectedWeekdays?: number[]
  },
): Promise<BookingCreationResult> {
  const result =
    await apiRequest<BookingCreationResult>(
      '/bookings/scheduled',
      {
        method: 'POST',
        body: JSON.stringify({
          service_variant_id:
            input.serviceVariantId,

          address_id:
            input.addressId,

          schedule_start_date:
            input.startDate,

          schedule_end_date:
            input.endDate,

          daily_start_time:
            input.startTime,

          daily_end_time:
            input.endTime,

          selected_weekdays:
            input.selectedWeekdays ?? [
              0,
              1,
              2,
              3,
              4,
              5,
              6,
            ],

          off_dates:
            input.excludedDates,

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