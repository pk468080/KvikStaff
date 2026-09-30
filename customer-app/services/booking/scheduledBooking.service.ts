import { supabase } from '../../lib/supabase'
import type {
  BookingCreationResult,
  MultiOccurrenceBookingInput,
} from '../../types/booking'



function normalizeSupabaseError(
  error: unknown,
): Error {
  if (error instanceof Error) {
    return error
  }

  if (
    typeof error === 'object' &&
    error !== null
  ) {
    const value =
      error as Record<string, unknown>

    const message =
      typeof value.message === 'string'
        ? value.message
        : 'Unable to create the booking.'

    const code =
      typeof value.code === 'string'
        ? value.code
        : null

    const details =
      typeof value.details === 'string'
        ? value.details
        : null

    const hint =
      typeof value.hint === 'string'
        ? value.hint
        : null

    const parts = [message]

    if (code) {
      parts.push(`Code: ${code}`)
    }

    if (details) {
      parts.push(`Details: ${details}`)
    }

    if (hint) {
      parts.push(`Hint: ${hint}`)
    }

    return new Error(
      parts.join('\n'),
    )
  }

  return new Error(
    'Unable to create the booking.',
  )
}

export async function createCustomerScheduledBooking(
  input: Omit<MultiOccurrenceBookingInput, 'selectedWeekdays'> & {
    selectedWeekdays?: number[]
  },
): Promise<BookingCreationResult> {
  try {
    const {
      data,
      error,
    } = await supabase.rpc(
      'create_customer_scheduled_booking',
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

        p_selected_weekdays: input.selectedWeekdays ?? [
          0,
          1,
          2,
          3,
          4,
          5,
          6,
        ],

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
  } catch (error) {
    console.error(
      'Scheduled booking RPC failed:',
      error,
    )

    throw normalizeSupabaseError(
      error,
    )
  }
}