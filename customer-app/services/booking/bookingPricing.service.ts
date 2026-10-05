import { apiRequest } from '../../lib/api'
import type {
  MultiOccurrencePricingInput,
} from '../../types/booking'

export type BookingPriceResult = {
  success: boolean
  pricing_engine?: string

  hourly_price?: number

  service_id: string
  service_variant_id: string
  booking_type: string

  occurrence_count: number
  hours_per_occurrence: number
  total_working_hours: number

  gross_amount: number
  discount_amount: number
  platform_fee: number
  tax_amount: number
  final_amount: number
  currency: string
  timezone: string

  tax?: number
  commitment_days?: number | null

  discount_tier_id?: string | null
  discount_tier_name?: string | null
  discount_percent?: number

  service_discount_percent?: number
  service_discount_amount?: number

  promotion_id?: string | null
  promotion_title?: string | null
  promotion_discount_type?:
    | 'percent'
    | 'fixed'
    | null

  promotion_discount_value?: number
  promotion_discount_amount?: number
  promotion_stackable_with_duration_discount?: boolean

  recurring_commitment_discount_amount?: number

  recurring_discount_tier_id?: string | null
  recurring_discount_tier_name?: string | null
  recurring_discount_percent?: number
  recurring_discount_amount?: number

  discount_source?: string
  occurrences?: unknown[]
}

function normalizePriceResult(
  data: unknown,
  fallbackBookingType?: string,
): BookingPriceResult {
  if (
    !data ||
    typeof data !== 'object'
  ) {
    throw new Error(
      'The backend did not return valid booking pricing.',
    )
  }

  const result =
    data as Record<string, unknown>

  if (
    typeof result.service_id !== 'string' ||
    typeof result.service_variant_id !== 'string'
  ) {
    throw new Error(
      'The booking pricing response is missing service information.',
    )
  }

  return {
    ...(result as unknown as BookingPriceResult),

    booking_type:
      typeof result.booking_type === 'string'
        ? result.booking_type
        : fallbackBookingType ?? '',

    occurrence_count:
      Number(
        result.occurrence_count ?? 1,
      ),

    hours_per_occurrence:
      Number(
        result.hours_per_occurrence ?? 0,
      ),

    total_working_hours:
      Number(
        result.total_working_hours ?? 0,
      ),
  }
}

export async function calculateInstantBookingPrice(
  serviceVariantId: string,
  totalWorkingHours: number,
): Promise<BookingPriceResult> {
  if (!serviceVariantId.trim()) {
    throw new Error(
      'Service variant ID is required.',
    )
  }

  if (
    !Number.isFinite(totalWorkingHours) ||
    totalWorkingHours <= 0
  ) {
    throw new Error(
      'Total working hours must be greater than zero.',
    )
  }

  const data =
    await apiRequest<unknown>(
      '/bookings/pricing/instant',
      {
        method: 'POST',
        body: JSON.stringify({
          service_variant_id:
            serviceVariantId,
          total_working_hours:
            totalWorkingHours,
        }),
      },
    )

  return normalizePriceResult(
    data,
    'instant',
  )
}

export async function calculateMultiOccurrenceBookingPrice(
  input: MultiOccurrencePricingInput,
): Promise<BookingPriceResult> {
  if (!input.serviceVariantId.trim()) {
    throw new Error(
      'Service variant ID is required.',
    )
  }

  if (!input.startDate) {
    throw new Error(
      'Start date is required.',
    )
  }

  if (!input.endDate) {
    throw new Error(
      'End date is required.',
    )
  }

  if (
    !input.startTime ||
    !input.endTime
  ) {
    throw new Error(
      'Start and end time are required.',
    )
  }

  if (
    !Array.isArray(
      input.selectedWeekdays,
    ) ||
    input.selectedWeekdays.length === 0
  ) {
    throw new Error(
      'At least one weekday must be selected.',
    )
  }

  return normalizePriceResult(
    await apiRequest<unknown>(
      '/bookings/pricing/multi',
      {
        method: 'POST',
        body: JSON.stringify({
          service_variant_id:
            input.serviceVariantId,
          schedule_start_date:
            input.startDate,
          schedule_end_date:
            input.endDate,
          daily_start_time:
            input.startTime,
          daily_end_time:
            input.endTime,
          selected_weekdays:
            input.selectedWeekdays,
          off_dates:
            input.excludedDates ?? [],
          booking_type:
            input.bookingType,
        }),
      },
    ),
  )
}

export async function calculateScheduledBookingPrice(
  input: Omit<
    MultiOccurrencePricingInput,
    'selectedWeekdays' | 'bookingType'
  >,
): Promise<BookingPriceResult> {
  return calculateMultiOccurrenceBookingPrice({
    ...input,
    selectedWeekdays: [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ],
    bookingType:
      'scheduled',
  })
}