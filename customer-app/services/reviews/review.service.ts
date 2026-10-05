import { apiRequest } from '../../lib/api'

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

export type CustomerReviewableOccurrence = {
  id: string
  worker_id: string | null
  occurrence_index: number
  status: string
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
    throw new Error('Rating must be an integer between 1 and 5.')
  }

  if (rating < 1 || rating > 5) {
    throw new Error('Rating must be between 1 and 5.')
  }

  const nextText =
    typeof reviewText === 'string' ? reviewText.trim() : ''

  if (nextText.length > REVIEW_TEXT_MAX_LENGTH) {
    throw new Error('Review text must be 2000 characters or fewer.')
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

  if (bookingStatus !== 'completed' || !hasWorker) {
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

  if (expectedWorkerId && occurrenceWorkerId !== expectedWorkerId) {
    return 'This worker did not complete this occurrence.'
  }

  return null
}

export async function getCustomerReviewForBooking(
  bookingId: string,
  occurrenceId?: string | null,
): Promise<CustomerReview | null> {
  const query = occurrenceId
    ? `?occurrence_id=${encodeURIComponent(occurrenceId)}`
    : ''

  return apiRequest<CustomerReview | null>(
    `/reviews/bookings/${encodeURIComponent(bookingId)}${query}`,
  )
}

export async function getReviewableOccurrencesForBooking(
  bookingId: string,
): Promise<CustomerReviewableOccurrence[]> {
  return apiRequest<CustomerReviewableOccurrence[]>(
    `/reviews/bookings/${encodeURIComponent(bookingId)}/occurrences`,
  )
}

export async function resolveCompletedOccurrenceForReview(
  bookingId: string,
  occurrenceId?: string | null,
): Promise<{
  occurrenceId: string | null
  workerId: string | null
}> {
  const occurrenceRows = await getReviewableOccurrencesForBooking(bookingId)

  if (occurrenceId) {
    const occurrence = occurrenceRows.find(row => row.id === occurrenceId)

    return {
      occurrenceId: occurrence?.id ?? null,
      workerId: occurrence?.worker_id ?? null,
    }
  }

  const firstOccurrence = occurrenceRows[0]

  if (firstOccurrence) {
    return {
      occurrenceId: firstOccurrence.id,
      workerId: firstOccurrence.worker_id,
    }
  }

  return {
    occurrenceId: null,
    workerId: null,
  }
}

export async function submitCustomerBookingReview({
  bookingId,
  occurrenceId,
  rating,
  reviewText,
}: ReviewSubmissionInput): Promise<CustomerReview> {
  if (!bookingId.trim()) {
    throw new Error('Booking ID is required.')
  }

  const normalized = normalizeReviewSubmission({
    rating,
    reviewText,
  })

  return apiRequest<CustomerReview>(
    `/reviews/bookings/${encodeURIComponent(bookingId)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        occurrence_id: occurrenceId ?? null,
        rating: normalized.rating,
        comment: normalized.reviewText || null,
      }),
    },
  )
}
