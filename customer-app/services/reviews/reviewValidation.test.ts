import {
  getReviewEligibilityError,
  normalizeReviewSubmission,
  validateReviewOccurrenceTarget,
} from './review.service'

describe('review submission validation', () => {
  it('accepts valid review values', () => {
    expect(
      normalizeReviewSubmission({
        rating: 5,
        reviewText: '  Great service!  ',
      }),
    ).toEqual({
      rating: 5,
      reviewText: 'Great service!',
    })
  })

  it('rejects invalid ratings and oversized text', () => {
    expect(() =>
      normalizeReviewSubmission({
        rating: 0,
        reviewText: 'Bad',
      }),
    ).toThrow('Rating must be between 1 and 5.')

    expect(() =>
      normalizeReviewSubmission({
        rating: 3,
        reviewText: 'x'.repeat(2001),
      }),
    ).toThrow('Review text must be 2000 characters or fewer.')
  })

  it('returns eligibility errors for invalid booking states', () => {
    expect(
      getReviewEligibilityError({
        bookingStatus: 'cancelled',
        hasWorker: true,
        hasExistingReview: false,
      }),
    ).toBe('This booking is not eligible for a review.')

    expect(
      getReviewEligibilityError({
        bookingStatus: 'completed',
        hasWorker: false,
        hasExistingReview: false,
      }),
    ).toBe('This booking is not eligible for a review.')

    expect(
      getReviewEligibilityError({
        bookingStatus: 'completed',
        hasWorker: true,
        hasExistingReview: true,
      }),
    ).toBe('You have already reviewed this booking.')
  })

  it('validates the actual occurrence worker for recurring reviews', () => {
    expect(
      validateReviewOccurrenceTarget({
        bookingStatus: 'completed',
        occurrenceStatus: 'completed',
        occurrenceWorkerId: 'worker-a',
        expectedWorkerId: 'worker-a',
      }),
    ).toBeNull()

    expect(
      validateReviewOccurrenceTarget({
        bookingStatus: 'completed',
        occurrenceStatus: 'completed',
        occurrenceWorkerId: 'worker-b',
        expectedWorkerId: 'worker-a',
      }),
    ).toBe('This worker did not complete this occurrence.')

    expect(
      validateReviewOccurrenceTarget({
        bookingStatus: 'completed',
        occurrenceStatus: 'cancelled',
        occurrenceWorkerId: 'worker-a',
        expectedWorkerId: 'worker-a',
      }),
    ).toBe('This booking is not eligible for a review.')
  })
})
