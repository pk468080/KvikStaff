export type BookingType =
  | 'instant'
  | 'scheduled'
  | 'recurring'

export type BookingLocationInput = {
  latitude: number
  longitude: number
  address: string
}

export type BookingDraft = {
  bookingType: BookingType

  location: BookingLocationInput

  startDate: string | null
  endDate: string | null

  startTime: string
  endTime: string

  selectedWeekdays: string[]
  excludedDates: string[]
}

export type BookingCreationResult = {
  booking_id: string
  occurrence_count: number
  total_working_hours: number
  gross_amount: number
  discount_amount: number
  platform_fee?: number
  tax_amount?: number
  tax?: number
  final_amount: number
  currency: string
  timezone: string
  instant_available?: boolean
  fallback_to_scheduled?: boolean
}

export type BookingScheduleInput = {
  serviceVariantId: string
  startDate: string
  endDate: string
  startTime: string
  endTime: string
  selectedWeekdays: number[]
  excludedDates: string[]
}

export type MultiOccurrenceBookingInput =
  BookingScheduleInput & {
    location: BookingLocationInput
    notes?: string | null
  }

export type MultiOccurrencePricingInput =
  BookingScheduleInput & {
    bookingType: 'scheduled' | 'recurring'
  }