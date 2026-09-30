import { supabase } from '../../lib/supabase'
import type {
  BookingCreationResult,
  MultiOccurrenceBookingInput,
} from '../../types/booking'



export async function createCustomerRecurringBooking(
  input: MultiOccurrenceBookingInput,
): Promise<BookingCreationResult> {
  const { data, error } = await supabase.rpc(
    'create_customer_recurring_booking',
    {
      p_service_variant_id:
        input.serviceVariantId,

      p_address_id:
        input.addressId,

      p_schedule_start_date:
        input.startDate,

      p_schedule_end_date:
        input.endDate,

      p_daily_start_time:
        input.startTime,

      p_daily_end_time:
        input.endTime,

      p_selected_weekdays:
        input.selectedWeekdays,

      p_off_dates:
        input.excludedDates,

            ...(input.notes?.trim()
        ? {
            p_notes:
              input.notes.trim(),
          }
        : {}),
    },
  )

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'The backend did not return a booking result.',
    )
  }

  return data as BookingCreationResult
}