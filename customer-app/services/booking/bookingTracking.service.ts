import { supabase } from '../../lib/supabase'

export type BookingStatus =
  | 'pending_payment'
  | 'paid'
  | 'searching_worker'
  | 'assigned'
  | 'on_the_way'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'payment_failed'

export type CustomerBooking = {
  id: string
  address_id: string
  status: BookingStatus
  booking_type?: string | null
  service_name: string | null
  service_image_url: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  total_working_hours: number | null
  total_amount: number | null
  worker_id: string | null
  started_at: string | null
  completed_at: string | null
  journey_started_at: string | null
  arrived_at: string | null
  activeOccurrenceId?: string | null
  created_at?: string | null
}

export type CustomerBookingOccurrence = {
  id: string
  booking_id: string
  worker_id: string | null
  occurrence_index: number
  occurrence_date: string
  scheduled_start: string
  scheduled_end: string
  status: string

  journey_started_at: string | null
  arrived_at: string | null
  started_at: string | null
  completed_at: string | null

  start_otp_verified_at: string | null
  end_otp_verified_at: string | null

  created_at: string
  updated_at: string
}

export type BookingStatusHistoryItem = {
  id: string
  booking_id: string
  old_status: BookingStatus | null
  new_status: BookingStatus
  changed_by: string | null
  created_at: string
}

export type WorkerLocation = {
  latitude: number
  longitude: number
  recorded_at: string
}

export type WorkerLocationFreshness =
  | 'unavailable'
  | 'fresh'
  | 'stale'

type BookingRow = {
  id: string
  address_id: string
  status: BookingStatus
  booking_type?: string | null
  service_name?: string | null
  service_image_url?: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  total_working_hours: number | null
  total_amount: number | null
  worker_id: string | null
  started_at: string | null
  completed_at: string | null
  journey_started_at: string | null
  arrived_at: string | null
  created_at?: string | null

  service_variant?: {
    service?: {
      name?: string | null
      image_url?: string | null
    } | null
  } | null
}

function mapBooking(
  row: BookingRow,
): CustomerBooking {
  return {
    id: row.id,

    address_id:
      row.address_id,

    status:
      row.status,

    booking_type:
      row.booking_type ??
      null,

    service_name:
      row.service_variant?.service?.name ??
      row.service_name ??
      null,

    service_image_url:
      row.service_variant?.service?.image_url ??
      row.service_image_url ??
      null,

    scheduled_start:
      row.scheduled_start,

    scheduled_end:
      row.scheduled_end,

    total_working_hours:
      row.total_working_hours,

    total_amount:
      row.total_amount,

    worker_id:
      row.worker_id,

    started_at:
      row.started_at,

    completed_at:
      row.completed_at,

    journey_started_at:
      row.journey_started_at,

    arrived_at:
      row.arrived_at,

    activeOccurrenceId: null,

    created_at:
      row.created_at ??
      null,
  }
}

const BOOKING_SELECT = `
  id,
  status,
  fulfillment_type,
  address_id,
  created_at,
  scheduled_start,
  scheduled_end,
  total_working_hours,
  total_amount,
  worker_id,
  started_at,
  completed_at,
  journey_started_at,
  arrived_at,
  service_variant:service_variants(
    service:services(
      name,
      image_url
    )
  )
`

const OCCURRENCE_LIFECYCLE_STATUSES:
  BookingStatus[] = [
  'assigned',
  'on_the_way',
  'arrived',
  'in_progress',
]

const OCCURRENCE_STATUS_PRIORITY:
  Partial<Record<BookingStatus, number>> = {
  assigned: 1,
  on_the_way: 2,
  arrived: 3,
  in_progress: 4,
}

function selectPreferredOccurrence(
  occurrences: CustomerBookingOccurrence[],
  nowMs = Date.now(),
): CustomerBookingOccurrence | null {
  if (
    occurrences.length === 0
  ) {
    return null
  }

  const lifecycleOccurrences =
    occurrences
      .filter(
        occurrence =>
          Boolean(
            occurrence.worker_id,
          ) &&
          OCCURRENCE_LIFECYCLE_STATUSES.includes(
            occurrence.status as BookingStatus,
          ),
      )
      .sort(
        (
          left,
          right,
        ) => {
          const leftPriority =
            OCCURRENCE_STATUS_PRIORITY[
              left.status as BookingStatus
            ] ?? 0

          const rightPriority =
            OCCURRENCE_STATUS_PRIORITY[
              right.status as BookingStatus
            ] ?? 0

          if (
            leftPriority !==
            rightPriority
          ) {
            return (
              rightPriority -
              leftPriority
            )
          }

          const leftStart =
            Date.parse(
              left.scheduled_start,
            )

          const rightStart =
            Date.parse(
              right.scheduled_start,
            )

          return (
            Math.abs(
              leftStart -
                nowMs,
            ) -
            Math.abs(
              rightStart -
                nowMs,
            )
          )
        },
      )

  if (
    lifecycleOccurrences[0]
  ) {
    return (
      lifecycleOccurrences[0]
    )
  }

  const futureOccurrences =
    occurrences
      .filter(
        occurrence => {
          const start =
            Date.parse(
              occurrence.scheduled_start,
            )

          return (
            Number.isFinite(
              start,
            ) &&
            start >= nowMs
          )
        },
      )
      .sort(
        (
          left,
          right,
        ) =>
          Date.parse(
            left.scheduled_start,
          ) -
          Date.parse(
            right.scheduled_start,
          ),
      )

  if (
    futureOccurrences[0]
  ) {
    return (
      futureOccurrences[0]
    )
  }

  return [...occurrences]
    .sort(
      (
        left,
        right,
      ) =>
        Date.parse(
          right.scheduled_start,
        ) -
        Date.parse(
          left.scheduled_start,
        ),
    )[0] ?? null
}

function applyActiveOccurrenceToBooking(
  booking: CustomerBooking,
  occurrence:
    | CustomerBookingOccurrence
    | null,
): CustomerBooking {
  if (!occurrence) {
    return booking
  }

  /*
   * Scheduled/recurring bookings can keep
   * worker assignment on the active occurrence.
   */
  if (!occurrence.worker_id) {
    return booking
  }

  if (
    booking.worker_id &&
    occurrence.worker_id !==
      booking.worker_id
  ) {
    return booking
  }

  if (
    !OCCURRENCE_LIFECYCLE_STATUSES.includes(
      occurrence.status as BookingStatus,
    )
  ) {
    return booking
  }

  return {
    ...booking,

    status:
      occurrence.status as BookingStatus,

    scheduled_start:
      occurrence.scheduled_start,

    scheduled_end:
      occurrence.scheduled_end,

    journey_started_at:
      occurrence.journey_started_at,

    arrived_at:
      occurrence.arrived_at,

    started_at:
      occurrence.started_at,

    completed_at:
      occurrence.completed_at,

    worker_id:
      occurrence.worker_id,

    activeOccurrenceId:
      occurrence.id,
  }
}

export async function getCustomerBooking(
  bookingId: string,
): Promise<CustomerBooking> {
  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select(
      BOOKING_SELECT,
    )
    .eq(
      'id',
      bookingId,
    )
    .single()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'Booking could not be loaded.',
    )
  }

  const booking =
    mapBooking(
      data as unknown as BookingRow,
    )

  if (
    booking.booking_type !==
    'recurring'
  ) {
    return booking
  }

  const occurrence =
    await getCustomerActiveBookingOccurrence(
      bookingId,
    )

  return applyActiveOccurrenceToBooking(
    booking,
    occurrence,
  )
}

export async function getCustomerBookings(): Promise<
  CustomerBooking[]
> {
  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select(
      BOOKING_SELECT,
    )
    .order(
      'created_at',
      {
        ascending: false,
      },
    )

  if (error) {
    throw error
  }

  const bookings =
    (
      (data ?? []) as unknown as BookingRow[]
    ).map(
      mapBooking,
    )

  const occurrenceBookingIds =
    bookings
      .filter(
        booking =>
          booking.booking_type ===
          'recurring',
      )
      .map(
        booking =>
          booking.id,
      )

  if (
    occurrenceBookingIds.length ===
    0
  ) {
    return bookings
  }

  const {
    data: occurrenceRows,
    error:
      occurrenceError,
  } = await supabase
    .from(
      'booking_schedule_occurrences',
    )
    .select(
      `
        id,
        booking_id,
        worker_id,
        occurrence_index,
        occurrence_date,
        scheduled_start,
        scheduled_end,
        status,
        journey_started_at,
        arrived_at,
        started_at,
        completed_at,
        start_otp_verified_at,
        end_otp_verified_at,
        created_at,
        updated_at
      `,
    )
    .in(
      'booking_id',
      occurrenceBookingIds,
    )
    .not(
      'status',
      'in',
      '("completed","cancelled")',
    )
    .order(
      'scheduled_start',
      {
        ascending: true,
      },
    )

  if (occurrenceError) {
    throw occurrenceError
  }

  const occurrencesByBooking =
    new Map<
      string,
      CustomerBookingOccurrence[]
    >()

  for (
    const row of (
      occurrenceRows ??
      []
    ) as unknown as CustomerBookingOccurrence[]
  ) {
    const existing =
      occurrencesByBooking.get(
        row.booking_id,
      ) ?? []

    existing.push(
      row,
    )

    occurrencesByBooking.set(
      row.booking_id,
      existing,
    )
  }

  return bookings.map(
    booking =>
      applyActiveOccurrenceToBooking(
        booking,
        selectPreferredOccurrence(
          occurrencesByBooking.get(
            booking.id,
          ) ?? [],
        ),
      ),
  )
}

export async function getCustomerBookingStatusHistory(
  bookingId: string,
): Promise<BookingStatusHistoryItem[]> {
  const {
    data,
    error,
  } = await supabase
    .from(
      'booking_status_history',
    )
    .select(
      'id, booking_id, old_status, new_status, changed_by, created_at',
    )
    .eq(
      'booking_id',
      bookingId,
    )
    .order(
      'created_at',
      {
        ascending: true,
      },
    )

  if (error) {
    throw error
  }

  return (
    (data ?? []) as unknown as
      BookingStatusHistoryItem[]
  )
}

export async function getCustomerActiveBookingOccurrence(
  bookingId: string,
): Promise<CustomerBookingOccurrence | null> {
  const {
    data,
    error,
  } = await supabase
    .from(
      'booking_schedule_occurrences',
    )
    .select(
      `
        id,
        booking_id,
        worker_id,
        occurrence_index,
        occurrence_date,
        scheduled_start,
        scheduled_end,
        status,
        journey_started_at,
        arrived_at,
        started_at,
        completed_at,
        start_otp_verified_at,
        end_otp_verified_at,
        created_at,
        updated_at
      `,
    )
    .eq(
      'booking_id',
      bookingId,
    )
    .not(
      'status',
      'in',
      '("completed","cancelled")',
    )
    .order(
      'scheduled_start',
      {
        ascending: true,
      },
    )

  if (error) {
    throw error
  }

  return selectPreferredOccurrence(
    (
      data ?? []
    ) as unknown as CustomerBookingOccurrence[],
  )
}

export async function getCustomerBookingOccurrences(
  bookingId: string,
): Promise<
  CustomerBookingOccurrence[]
> {
  const {
    data,
    error,
  } = await supabase
    .from(
      'booking_schedule_occurrences',
    )
    .select(
      `
        id,
        booking_id,
        worker_id,
        occurrence_index,
        occurrence_date,
        scheduled_start,
        scheduled_end,
        status,
        journey_started_at,
        arrived_at,
        started_at,
        completed_at,
        start_otp_verified_at,
        end_otp_verified_at,
        created_at,
        updated_at
      `,
    )
    .eq(
      'booking_id',
      bookingId,
    )
    .order(
      'occurrence_index',
      {
        ascending: true,
      },
    )

  if (error) {
    throw error
  }

  return (
    (data ?? []) as unknown as
      CustomerBookingOccurrence[]
  )
}

export async function getLatestWorkerLocation(
  bookingId: string,
): Promise<WorkerLocation | null> {
  const {
    data,
    error,
  } = await supabase
    .from(
      'worker_locations',
    )
    .select(
      'latitude, longitude, recorded_at',
    )
    .eq(
      'booking_id',
      bookingId,
    )
    .order(
      'recorded_at',
      {
        ascending: false,
      },
    )
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return {
    latitude:
      Number(
        data.latitude,
      ),

    longitude:
      Number(
        data.longitude,
      ),

    recorded_at:
      data.recorded_at,
  }
}

export function getWorkerLocationFreshness(
  location: WorkerLocation | null,
  nowMs = Date.now(),
): WorkerLocationFreshness {
  if (!location) {
    return 'unavailable'
  }

  const recordedAt =
    Date.parse(
      location.recorded_at,
    )

  if (
    !Number.isFinite(
      recordedAt,
    )
  ) {
    return 'stale'
  }

  const ageMs =
    Math.max(
      0,
      nowMs -
        recordedAt,
    )

  return ageMs <=
    60_000
    ? 'fresh'
    : 'stale'
}

export function getWorkerLocationAgeSeconds(
  location: WorkerLocation | null,
  nowMs = Date.now(),
): number | null {
  if (!location) {
    return null
  }

  const recordedAt =
    Date.parse(
      location.recorded_at,
    )

  if (
    !Number.isFinite(
      recordedAt,
    )
  ) {
    return null
  }

  return Math.max(
    0,
    Math.floor(
      (nowMs -
        recordedAt) /
        1000,
    ),
  )
}

async function resolveOccurrenceIdForOtp(
  bookingId: string,
): Promise<
  string | undefined
> {
  const {
    data,
    error,
  } = await supabase
    .from('bookings')
    .select(
      'id, fulfillment_type, worker_id',
    )
    .eq(
      'id',
      bookingId,
    )
    .single()

  if (error) {
    throw error
  }

  const bookingType =
    String(
      data?.fulfillment_type ??
        '',
    )

  if (
    bookingType !==
    'recurring'
  ) {
    return undefined
  }

  const occurrence =
    await getCustomerActiveBookingOccurrence(
      bookingId,
    )

  if (
    !occurrence ||
    !occurrence.worker_id
  ) {
    return undefined
  }

  if (
    data?.worker_id &&
    occurrence.worker_id !==
      data.worker_id
  ) {
    return undefined
  }

  return occurrence.id
}

export async function requestBookingOtp(
  bookingId: string,
  otpType:
    | 'start'
    | 'end',
  occurrenceId?: string,
) {
  let resolvedOccurrenceId =
    occurrenceId

  if (
    !resolvedOccurrenceId
  ) {
    resolvedOccurrenceId =
      await resolveOccurrenceIdForOtp(
        bookingId,
      )
  }

  const body: {
    bookingId: string
    otpType:
      | 'start'
      | 'end'
    occurrenceId?: string
  } = {
    bookingId,
    otpType,
  }

  if (
    resolvedOccurrenceId
  ) {
    body.occurrenceId =
      resolvedOccurrenceId
  }

  const {
    data,
    error,
  } =
    await supabase.functions.invoke(
      'create-booking-otp',
      {
        body,
      },
    )

  if (error) {
    throw error
  }

  const result =
    data as {
      success?: boolean
      otp?: string
      expiresAt?: string
      occurrence_id?: string | null
    }

  if (
    result.success !== true
  ) {
    throw new Error(
      'Unable to generate the booking OTP.',
    )
  }

  return result
}
