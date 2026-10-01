import { supabase } from '../../lib/supabase'

export const REVIEW_TEXT_MAX_LENGTH = 2000

export type ReviewEligibilityInput = {
  bookingStatus: string | null
  hasWorker: boolean
  hasExistingReview: boolean
}

export type ReviewOccurrenceValidationInput = {
  bookingStatus: string | null
  occurrenceStatus: string | null
  occurrenceWorkerId: string | null
  expectedWorkerId?: string | null
}

export type CustomerReview = {
  id: string
  booking_id: string
  occurrence_id: string | null
  customer_id: string
  worker_id: string
  rating: number
  comment: string | null
  created_at: string
}

export type ReviewSubmissionInput = {
  bookingId: string
  occurrenceId?: string | null
  rating: number
  reviewText?: string | null
}

export function normalizeReviewSubmission({
  rating,
  reviewText,
}: {
  rating: number
  reviewText?: string | null
}): {
  rating: number
  reviewText: string
} {
  if (!Number.isInteger(rating)) {
    throw new Error(
      'Rating must be an integer between 1 and 5.',
    )
  }

  if (rating < 1 || rating > 5) {
    throw new Error(
      'Rating must be between 1 and 5.',
    )
  }

  const nextText =
    typeof reviewText === 'string'
      ? reviewText.trim()
      : ''

  if (nextText.length > REVIEW_TEXT_MAX_LENGTH) {
    throw new Error(
      'Review text must be 2000 characters or fewer.',
    )
  }

  return {
    rating,
    reviewText: nextText,
  }
}

export function getReviewEligibilityError({
  bookingStatus,
  hasWorker,
  hasExistingReview,
}: ReviewEligibilityInput): string | null {
  if (hasExistingReview) {
    return 'You have already reviewed this booking.'
  }

  if (
    bookingStatus !== 'completed' ||
    !hasWorker
  ) {
    return 'This booking is not eligible for a review.'
  }

  return null
}

export function validateReviewOccurrenceTarget({
  bookingStatus,
  occurrenceStatus,
  occurrenceWorkerId,
  expectedWorkerId,
}: ReviewOccurrenceValidationInput): string | null {
  if (bookingStatus !== 'completed') {
    return 'This booking is not eligible for a review.'
  }

  if (occurrenceStatus !== 'completed') {
    return 'This booking is not eligible for a review.'
  }

  if (!occurrenceWorkerId) {
    return 'This booking does not have an assigned worker to review.'
  }

  if (
    expectedWorkerId &&
    occurrenceWorkerId !== expectedWorkerId
  ) {
    return 'This worker did not complete this occurrence.'
  }

  return null
}

export async function getCustomerReviewForBooking(
  bookingId: string,
  occurrenceId?: string | null,
): Promise<CustomerReview | null> {
  let query = supabase
    .from('reviews')
    .select(
      'id, booking_id, occurrence_id, customer_id, worker_id, rating, comment, created_at',
    )
    .eq('booking_id', bookingId)

  if (occurrenceId) {
    query = query.eq('occurrence_id', occurrenceId)
  } else {
    query = query.is('occurrence_id', null)
  }

  const {
    data,
    error,
  } = await query.maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return data as CustomerReview
}

export async function getReviewableOccurrencesForBooking(
  bookingId: string,
): Promise<Array<{
  id: string
  worker_id: string | null
  occurrence_index: number
  status: string
}>> {
  const {
    data,
    error,
  } = await supabase
    .from('booking_schedule_occurrences')
    .select(
      'id, worker_id, status, occurrence_index',
    )
    .eq('booking_id', bookingId)
    .eq('status', 'completed')
    .order('occurrence_index', {
      ascending: true,
    })

  if (error) {
    throw error
  }

  return (data ?? []) as Array<{
    id: string
    worker_id: string | null
    occurrence_index: number
    status: string
  }>
}

export async function resolveCompletedOccurrenceForReview(
  bookingId: string,
  occurrenceId?: string | null,
): Promise<{
  occurrenceId: string | null
  workerId: string | null
}> {
  const {
    data: booking,
    error: bookingError,
  } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, status, worker_id, fulfillment_type',
    )
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingError) {
    throw bookingError
  }

  if (!booking) {
    return {
      occurrenceId: null,
      workerId: null,
    }
  }

  if (booking.status !== 'completed') {
    return {
      occurrenceId: null,
      workerId: booking.worker_id ?? null,
    }
  }

  if (booking.fulfillment_type !== 'recurring') {
    return {
      occurrenceId: null,
      workerId: booking.worker_id ?? null,
    }
  }

  if (occurrenceId) {
    const {
      data: occurrence,
      error: occurrenceError,
    } = await supabase
      .from('booking_schedule_occurrences')
      .select(
        'id, worker_id, status, occurrence_index',
      )
      .eq('id', occurrenceId)
      .eq('booking_id', bookingId)
      .maybeSingle()

    if (occurrenceError) {
      throw occurrenceError
    }

    if (!occurrence || occurrence.status !== 'completed') {
      return {
        occurrenceId: null,
        workerId: null,
      }
    }

    return {
      occurrenceId: occurrence.id,
      workerId: occurrence.worker_id ?? booking.worker_id ?? null,
    }
  }

  const occurrences = await getReviewableOccurrencesForBooking(bookingId)

  const nextOccurrence = occurrences[0]

  return {
    occurrenceId: nextOccurrence?.id ?? null,
    workerId: nextOccurrence?.worker_id ?? booking.worker_id ?? null,
  }
}

export async function submitCustomerBookingReview({
  bookingId,
  occurrenceId,
  rating,
  reviewText,
}: ReviewSubmissionInput): Promise<CustomerReview> {
  const {
    data: userData,
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    throw new Error(
      'Authentication is required to submit a review.',
    )
  }

  const normalized = normalizeReviewSubmission({
    rating,
    reviewText,
  })

  const {
    data: booking,
    error: bookingError,
  } = await supabase
    .from('bookings')
    .select(
      'id, customer_id, status, worker_id, fulfillment_type',
    )
    .eq('id', bookingId)
    .maybeSingle()

  if (bookingError) {
    throw bookingError
  }

  if (!booking) {
    throw new Error('Booking not found.')
  }

  if (booking.customer_id !== userData.user.id) {
    throw new Error(
      'You can only review bookings that belong to you.',
    )
  }

  if (booking.status !== 'completed') {
    throw new Error(
      'This booking is not eligible for a review.',
    )
  }

  let resolvedOccurrenceId = occurrenceId ?? null
  let resolvedWorkerId = booking.worker_id ?? null

  if (booking.fulfillment_type === 'recurring') {
    if (!resolvedOccurrenceId) {
      const occurrences = await getReviewableOccurrencesForBooking(bookingId)

      if (occurrences.length === 0) {
        throw new Error(
          'This booking is not eligible for a review.',
        )
      }

      const completedOccurrence = occurrences[0]
      resolvedOccurrenceId = completedOccurrence.id
      resolvedWorkerId = completedOccurrence.worker_id ?? resolvedWorkerId
    } else {
      const {
        data: occurrence,
        error: occurrenceError,
      } = await supabase
        .from('booking_schedule_occurrences')
        .select(
          'id, worker_id, status',
        )
        .eq('id', resolvedOccurrenceId)
        .eq('booking_id', bookingId)
        .maybeSingle()

      if (occurrenceError) {
        throw occurrenceError
      }

      if (!occurrence || occurrence.status !== 'completed') {
        throw new Error(
          'This booking is not eligible for a review.',
        )
      }

      resolvedWorkerId = occurrence.worker_id ?? resolvedWorkerId
    }
  }

  if (
    booking.fulfillment_type === 'recurring' &&
    resolvedOccurrenceId
  ) {
    const occurrenceError = validateReviewOccurrenceTarget({
      bookingStatus: booking.status,
      occurrenceStatus: booking.fulfillment_type === 'recurring'
        ? (await supabase
            .from('booking_schedule_occurrences')
            .select('status, worker_id')
            .eq('id', resolvedOccurrenceId)
            .eq('booking_id', bookingId)
            .maybeSingle()).data?.status ?? null
        : null,
      occurrenceWorkerId: booking.fulfillment_type === 'recurring'
        ? (await supabase
            .from('booking_schedule_occurrences')
            .select('status, worker_id')
            .eq('id', resolvedOccurrenceId)
            .eq('booking_id', bookingId)
            .maybeSingle()).data?.worker_id ?? null
        : null,
      expectedWorkerId: resolvedWorkerId,
    })

    if (occurrenceError) {
      throw new Error(occurrenceError)
    }
  }

  if (!resolvedWorkerId) {
    throw new Error(
      'This booking does not have an assigned worker to review.',
    )
  }

  const existingReview = await getCustomerReviewForBooking(
    bookingId,
    resolvedOccurrenceId,
  )

  if (existingReview) {
    throw new Error(
      'You have already reviewed this booking.',
    )
  }

  const {
    data,
    error,
  } = await supabase
    .from('reviews')
    .insert({
      booking_id: bookingId,
      occurrence_id: resolvedOccurrenceId,
      customer_id: userData.user.id,
      worker_id: resolvedWorkerId,
      rating: normalized.rating,
      comment: normalized.reviewText,
    })
    .select(
      'id, booking_id, occurrence_id, customer_id, worker_id, rating, comment, created_at',
    )
    .single()

  if (error) {
    const message =
      typeof error.message === 'string'
        ? error.message.toLowerCase()
        : ''

    if (
      message.includes('duplicate') ||
      message.includes('already reviewed') ||
      error.code === '23505'
    ) {
      throw new Error(
        'You have already reviewed this booking.',
      )
    }

    throw error
  }

  return data as CustomerReview
}
