import { getReviewEligibilityError } from '../review.service'

describe('Review Service', () => {
  describe('getReviewEligibilityError', () => {
    it('returns an error if the user has already reviewed the booking', () => {
      const error = getReviewEligibilityError({
        bookingStatus: 'completed',
        hasWorker: true,
        hasExistingReview: true,
      })
      expect(error).toBe('You have already reviewed this booking.')
    })

    it('returns an error if the booking is not completed', () => {
      const error = getReviewEligibilityError({
        bookingStatus: 'in_progress',
        hasWorker: true,
        hasExistingReview: false,
      })
      expect(error).toBe('This booking is not eligible for a review.')
    })

    it('returns an error if the booking has no worker assigned', () => {
      const error = getReviewEligibilityError({
        bookingStatus: 'completed',
        hasWorker: false,
        hasExistingReview: false,
      })
      expect(error).toBe('This booking is not eligible for a review.')
    })

    it('returns null if all eligibility criteria are met', () => {
      const error = getReviewEligibilityError({
        bookingStatus: 'completed',
        hasWorker: true,
        hasExistingReview: false,
      })
      expect(error).toBeNull()
    })
  })
})
