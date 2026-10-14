import { supabase } from '../../lib/supabase'

import type {
  BookingStatus,
  BookingType,
  WorkerBooking,
} from '../../types/booking'

type WorkerBookingRow = {
  id: string
  customer_id: string
  worker_id: string | null
  service_id: string
  service_variant_id: string
  address_id: string

  status: BookingStatus
  fulfillment_type: BookingType

  duration_value: number
  duration_unit: string

  scheduled_start: string
  scheduled_end: string

  total_working_hours: number | null
  total_amount: number
  pricing_snapshot: unknown

  notes: string | null

  worker_accepted_at: string | null
  journey_started_at: string | null
  arrived_at: string | null
  started_at: string | null
  start_otp_verified_at: string | null
  completed_at: string | null
  end_otp_verified_at: string | null

  schedule_start_date: string | null
  schedule_end_date: string | null
  daily_start_time: string | null
  daily_end_time: string | null

  selected_weekdays: number[] | null
  off_dates: string[] | null

  created_at: string
  updated_at: string
}

const BOOKING_SELECT = `
  id,
  customer_id,
  worker_id,
  service_id,
  service_variant_id,
  address_id,
  status,
  fulfillment_type,
  duration_value,
  duration_unit,
  scheduled_start,
  scheduled_end,
  total_working_hours,
  total_amount,
  pricing_snapshot,
  notes,
  worker_accepted_at,
  journey_started_at,
  arrived_at,
  started_at,
  start_otp_verified_at,
  completed_at,
  end_otp_verified_at,
  schedule_start_date,
  schedule_end_date,
  daily_start_time,
  daily_end_time,
  selected_weekdays,
  off_dates,
  created_at,
  updated_at
`

function getBookingCurrency(
  pricingSnapshot: unknown,
): string | null {
  if (
    pricingSnapshot &&
    typeof pricingSnapshot === 'object' &&
    'currency' in pricingSnapshot &&
    typeof pricingSnapshot.currency === 'string'
  ) {
    return pricingSnapshot.currency
  }

  return null
}

function mapWorkerBooking(
  row: WorkerBookingRow,
): WorkerBooking {
  return {
    id: row.id,

    customerId:
      row.customer_id,

    workerId:
      row.worker_id,

    serviceId:
      row.service_id,

    serviceVariantId:
      row.service_variant_id,

    addressId:
      row.address_id,

    status:
      row.status,

    bookingType:
      row.fulfillment_type,

    durationValue:
      Number(
        row.duration_value,
      ),

    durationUnit:
      row.duration_unit,

    scheduledStart:
      row.scheduled_start,

    scheduledEnd:
      row.scheduled_end,

    totalWorkingHours:
      row.total_working_hours === null
        ? null
        : Number(
            row.total_working_hours,
          ),

    totalAmount:
      Number(
        row.total_amount,
      ),
currency: getBookingCurrency(row.pricing_snapshot),

    notes:
      row.notes,

    workerAcceptedAt:
      row.worker_accepted_at,

    journeyStartedAt:
      row.journey_started_at,

    arrivedAt:
      row.arrived_at,

    startedAt:
      row.started_at,

    startOtpVerifiedAt:
      row.start_otp_verified_at,

    completedAt:
      row.completed_at,

    endOtpVerifiedAt:
      row.end_otp_verified_at,

    scheduleStartDate:
      row.schedule_start_date,

    scheduleEndDate:
      row.schedule_end_date,

    dailyStartTime:
      row.daily_start_time,

    dailyEndTime:
      row.daily_end_time,

    selectedWeekdays:
      row.selected_weekdays ?? [],

    offDates:
      row.off_dates ?? [],

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
}

async function getCurrentWorkerId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error(
      'A worker authentication session is required.',
    )
  }

  return user.id
}

function validateBookingId(
  bookingId: string,
): void {
  if (!bookingId.trim()) {
    throw new Error(
      'Booking id is required.',
    )
  }
}

export async function getWorkerBookings(): Promise<
  WorkerBooking[]
> {
  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select(
      BOOKING_SELECT,
    )
    .eq('worker_id', workerId)
    .order('scheduled_start', {
      ascending: true,
    })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      mapWorkerBooking(
        row as WorkerBookingRow,
      ),
  )
}

export async function getWorkerBooking(
  bookingId: string,
): Promise<WorkerBooking | null> {
  validateBookingId(
    bookingId,
  )

  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select(
      BOOKING_SELECT,
    )
    .eq('id', bookingId)
    .eq('worker_id', workerId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
    ? mapWorkerBooking(
        data as WorkerBookingRow,
      )
    : null
}

export async function getWorkerBookingForOffer(
  offerId: string,
): Promise<WorkerBooking | null> {
  if (!offerId.trim()) {
    throw new Error('Offer id is required.')
  }

  const { data, error } = await supabase.rpc(
    'worker_get_booking_offer_details',
    { p_offer_id: offerId },
  )

  if (error) {
    throw error
  }

  if (!data || typeof data !== 'object') {
    return null
  }

  const payload = data as unknown as { booking?: unknown }
  if (!payload.booking || typeof payload.booking !== 'object') {
    return null
  }

  return mapWorkerBooking(payload.booking as unknown as WorkerBookingRow)
}

export async function requireWorkerBooking(
  bookingId: string,
): Promise<WorkerBooking> {
  const booking =
    await getWorkerBooking(
      bookingId,
    )

  if (!booking) {
    throw new Error(
      'Booking not found or not assigned to this worker.',
    )
  }

  return booking
}

export async function getWorkerBookingsByStatus(
  status: BookingStatus,
): Promise<WorkerBooking[]> {
  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select(
      BOOKING_SELECT,
    )
    .eq('worker_id', workerId)
    .eq('status', status)
    .order('scheduled_start', {
      ascending: true,
    })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      mapWorkerBooking(
        row as WorkerBookingRow,
      ),
  )
}

export async function getUpcomingWorkerBookings(
  limit = 10,
): Promise<WorkerBooking[]> {
  const workerId =
    await getCurrentWorkerId()

  const safeLimit =
    Math.max(
      1,
      Math.min(
        Math.trunc(limit),
        50,
      ),
    )

  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select(
      BOOKING_SELECT,
    )
    .eq('worker_id', workerId)
    .in('status', [
      'assigned',
      'on_the_way',
      'arrived',
      'in_progress',
    ])
    .gte(
      'scheduled_end',
      new Date().toISOString(),
    )
    .order('scheduled_start', {
      ascending: true,
    })
    .limit(safeLimit)

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      mapWorkerBooking(
        row as WorkerBookingRow,
      ),
  )
}

export async function getActiveWorkerBookings(): Promise<
  WorkerBooking[]
> {
  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select(
      BOOKING_SELECT,
    )
    .eq('worker_id', workerId)
    .in('status', [
      'assigned',
      'on_the_way',
      'arrived',
      'in_progress',
    ])
    .order('scheduled_start', {
      ascending: true,
    })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      mapWorkerBooking(
        row as WorkerBookingRow,
      ),
  )
}

export async function getCompletedWorkerBookings(
  limit = 25,
): Promise<WorkerBooking[]> {
  const workerId =
    await getCurrentWorkerId()

  const safeLimit =
    Math.max(
      1,
      Math.min(
        Math.trunc(limit),
        100,
      ),
    )

  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select(
      BOOKING_SELECT,
    )
    .eq('worker_id', workerId)
    .eq(
      'status',
      'completed',
    )
    .order('completed_at', {
      ascending: false,
      nullsFirst: false,
    })
    .limit(safeLimit)

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      mapWorkerBooking(
        row as WorkerBookingRow,
      ),
  )
}

export async function hasWorkerBooking(
  bookingId: string,
): Promise<boolean> {
  validateBookingId(
    bookingId,
  )

  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select('id')
    .eq('id', bookingId)
    .eq('worker_id', workerId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return Boolean(data)
}