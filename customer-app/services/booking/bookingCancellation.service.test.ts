jest.mock('../../lib/api', () => ({ apiRequest: jest.fn() }))

import {
  requireConfirmedCancellation,
  type CustomerCancellationResult,
} from './bookingCancellation.service'

describe('bookingCancellation.service', () => {
  describe('requireConfirmedCancellation', () => {
    it('accepts a server-confirmed cancellation', () => {
      const result: CustomerCancellationResult = {
        success: true,
        booking_id: 'booking-1',
        status: 'cancelled',
        refund_amount: 0,
      }

      expect(requireConfirmedCancellation(result)).toBe(result)
    })

    it('rejects a response that does not confirm cancellation', () => {
      expect(() =>
        requireConfirmedCancellation({
          success: false,
          status: 'pending',
        }),
      ).toThrow('The server did not confirm the cancellation.')
    })

    it('rejects a success-shaped response without the cancelled status', () => {
      expect(() =>
        requireConfirmedCancellation({
          success: true,
          status: 'pending',
        }),
      ).toThrow('The server did not confirm the cancellation.')
    })
  })
})
