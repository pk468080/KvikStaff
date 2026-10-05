import { apiRequest } from '../../lib/api'

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
  discount_amount: number
  platform_fee: number
  tax_amount: number
  total_amount: number | null
  worker_id: string | null
  started_at: string | null
  completed_at: string | null
  journey_started_at: string | null
  arrived_at: string | null
  activeOccurrenceId?: string | null
  created_at?: string | null
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

type BookingApiRow = {
  id: string
  address_id: string
  status: BookingStatus
  fulfillment_type: string | null
  service_name: string | null
  service_image_url: string | null
  scheduled_start: string | null
  scheduled_end: string | null
  total_working_hours: number | string | null
  discount_amount: number | string | null
  platform_fee: number | string | null
  tax_amount: number | string | null
  total_amount: number | string | null
  worker_id: string | null
  started_at: string | null
  completed_at: string | null
  journey_started_at: string | null
  arrived_at: string | null
  active_occurrence?: CustomerBookingOccurrence | null
  created_at: string | null
}

function toNumber(
  value: number | string | null | undefined,
  fallback = 0,
): number {
  if (value === null || value === undefined) {
    return fallback
  }

  const result = Number(value)

  return Number.isFinite(result)
    ? result
    : fallback
}

function mapBooking(
  row: BookingApiRow,
): CustomerBooking {
  return {
    id: row.id,
    address_id: row.address_id,
    status: row.status,
    booking_type:
      row.fulfillment_type ?? null,
    service_name:
      row.service_name ?? null,
    service_image_url:
      row.service_image_url ?? null,
    scheduled_start:
      row.scheduled_start,
    scheduled_end:
      row.scheduled_end,
    total_working_hours:
      row.total_working_hours === null
        ? null
        : toNumber(
            row.total_working_hours,
          ),
    discount_amount:
      toNumber(
        row.discount_amount,
      ),
    platform_fee:
      toNumber(
        row.platform_fee,
      ),
    tax_amount:
      toNumber(
        row.tax_amount,
      ),
    total_amount:
      row.total_amount === null
        ? null
        : toNumber(
            row.total_amount,
          ),
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
    activeOccurrenceId:
      row.active_occurrence?.id ??
      null,
    created_at:
      row.created_at ?? null,
  }
}

export async function getCustomerBooking(
  bookingId: string,
): Promise<CustomerBooking> {
  if (!bookingId.trim()) {
    throw new Error(
      'Booking ID is required.',
    )
  }

  const row =
    await apiRequest<BookingApiRow>(
      `/bookings/${bookingId}`,
      {
        method: 'GET',
      },
    )

  return mapBooking(row)
}

export async function getCustomerBookings(): Promise<
  CustomerBooking[]
> {
  const rows =
    await apiRequest<BookingApiRow[]>(
      '/bookings',
      {
        method: 'GET',
      },
    )

  if (!Array.isArray(rows)) {
    throw new Error(
      'Unable to load bookings.',
    )
  }

  return rows.map(mapBooking)
}

export function sortBookingStatusHistory(
  history: BookingStatusHistoryItem[],
): BookingStatusHistoryItem[] {
  if (history.length <= 1) {
    return [...history]
  }

  const items = [...history].sort(
    (left, right) => {
      const leftTime =
        Date.parse(
          left.created_at,
        )

      const rightTime =
        Date.parse(
          right.created_at,
        )

      if (
        Number.isFinite(leftTime) &&
        Number.isFinite(rightTime) &&
        leftTime !== rightTime
      ) {
        return (
          leftTime - rightTime
        )
      }

      if (
        Number.isFinite(leftTime) &&
        !Number.isFinite(rightTime)
      ) {
        return -1
      }

      if (
        !Number.isFinite(leftTime) &&
        Number.isFinite(rightTime)
      ) {
        return 1
      }

      return left.id.localeCompare(
        right.id,
      )
    },
  )

  const result: BookingStatusHistoryItem[] = []

  let cursor = 0
  let previousStatus:
    | BookingStatus
    | null = null

  while (
    cursor < items.length
  ) {
    const firstItem =
      items[cursor]

    const firstTime =
      Date.parse(
        firstItem.created_at,
      )

    const group: BookingStatusHistoryItem[] =
      []

    while (
      cursor < items.length
    ) {
      const currentItem =
        items[cursor]

      const currentTime =
        Date.parse(
          currentItem.created_at,
        )

      const sameTimestamp =
        (
          Number.isFinite(
            firstTime,
          ) &&
          Number.isFinite(
            currentTime,
          ) &&
          firstTime ===
            currentTime
        ) ||
        (
          firstItem.created_at ===
          currentItem.created_at
        )

      if (!sameTimestamp) {
        break
      }

      group.push(
        currentItem,
      )

      cursor += 1
    }

    const remaining = [
      ...group,
    ]

    while (
      remaining.length > 0
    ) {
      let nextIndex = -1

      if (
        previousStatus !== null
      ) {
        nextIndex =
          remaining.findIndex(
            item =>
              item.old_status ===
              previousStatus,
          )
      }

      if (
        nextIndex === -1 &&
        previousStatus === null
      ) {
        nextIndex =
          remaining.findIndex(
            item =>
              item.old_status ===
              null,
          )
      }

      if (
        nextIndex === -1
      ) {
        remaining.sort(
          (left, right) =>
            left.id.localeCompare(
              right.id,
            ),
        )

        result.push(
          ...remaining,
        )

        previousStatus =
          remaining[
            remaining.length - 1
          ]?.new_status ??
          previousStatus

        remaining.length = 0

        break
      }

      const [
        nextItem,
      ] =
        remaining.splice(
          nextIndex,
          1,
        )

      result.push(
        nextItem,
      )

      previousStatus =
        nextItem.new_status
    }
  }

  return result
}

export async function getCustomerBookingStatusHistory(
  bookingId: string,
): Promise<BookingStatusHistoryItem[]> {
  if (!bookingId.trim()) {
    throw new Error(
      'Booking ID is required.',
    )
  }

  const rows =
    await apiRequest<
      BookingStatusHistoryItem[]
    >(
      `/bookings/${bookingId}/history`,
      {
        method: 'GET',
      },
    )

  if (!Array.isArray(rows)) {
    throw new Error(
      'Unable to load booking history.',
    )
  }

  return sortBookingStatusHistory(
    rows,
  )
}

export async function getCustomerBookingOccurrences(
  bookingId: string,
): Promise<
  CustomerBookingOccurrence[]
> {
  if (!bookingId.trim()) {
    throw new Error(
      'Booking ID is required.',
    )
  }

  const rows =
    await apiRequest<
      CustomerBookingOccurrence[]
    >(
      `/bookings/${bookingId}/occurrences`,
      {
        method: 'GET',
      },
    )

  if (!Array.isArray(rows)) {
    throw new Error(
      'Unable to load booking occurrences.',
    )
  }

  return rows
}

export async function getCustomerActiveBookingOccurrence(
  bookingId: string,
): Promise<
  CustomerBookingOccurrence | null
> {
  if (!bookingId.trim()) {
    throw new Error(
      'Booking ID is required.',
    )
  }

  return apiRequest<
    CustomerBookingOccurrence | null
  >(
    `/bookings/${bookingId}/occurrences/active`,
    {
      method: 'GET',
    },
  )
}

export async function getLatestWorkerLocation(
  bookingId: string,
): Promise<WorkerLocation | null> {
  if (!bookingId.trim()) {
    throw new Error(
      'Booking ID is required.',
    )
  }

  const location =
    await apiRequest<
      WorkerLocation | null
    >(
      `/bookings/${bookingId}/tracking/location`,
      {
        method: 'GET',
      },
    )

  if (!location) {
    return null
  }

  return {
    latitude: Number(
      location.latitude,
    ),
    longitude: Number(
      location.longitude,
    ),
    recorded_at:
      location.recorded_at,
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
      (
        nowMs -
        recordedAt
      ) /
        1000,
    ),
  )
}

export async function requestBookingOtp(
  bookingId: string,
  otpType:
    | 'start'
    | 'end',
  occurrenceId?: string,
) {
  if (!bookingId.trim()) {
    throw new Error(
      'Booking ID is required.',
    )
  }

  if (
    otpType !== 'start' &&
    otpType !== 'end'
  ) {
    throw new Error(
      'OTP type must be start or end.',
    )
  }

  const result =
    await apiRequest<{
      success?: boolean
      message?: string
      otp?: string
      expiresAt?: string
      occurrence_id?: string | null
    }>(
      `/bookings/${bookingId}/otp`,
      {
        method: 'POST',
        body: JSON.stringify({
          otp_type: otpType,
          ...(occurrenceId
            ? {
                occurrence_id:
                  occurrenceId,
              }
            : {}),
        }),
      },
    )

  if (
    result.success !== true
  ) {
    throw new Error(
      'Unable to generate the booking OTP.',
    )
  }

  return result
}