jest.mock('../../lib/api', () => ({ apiRequest: jest.fn() }))

import {
  sortBookingStatusHistory,
  type BookingStatusHistoryItem,
  type BookingStatus,
} from './bookingTracking.service'

describe('bookingTracking.service', () => {
  describe('sortBookingStatusHistory', () => {
    const createItem = (
      id: string,
      createdAt: string,
      oldStatus: BookingStatus | null,
      newStatus: BookingStatus,
    ): BookingStatusHistoryItem => ({
      id,
      booking_id: 'booking-1',
      old_status: oldStatus,
      new_status: newStatus,
      changed_by: null,
      created_at: createdAt,
    })

    it('should return empty array if input is empty', () => {
      expect(sortBookingStatusHistory([])).toEqual([])
    })

    it('should return a copy of the array if it has only one item', () => {
      const input = [
        createItem('1', '2023-01-01T10:00:00.000Z', null, 'pending_payment'),
      ]
      const result = sortBookingStatusHistory(input)
      expect(result).toEqual(input)
      expect(result).not.toBe(input)
    })

    it('should sort items by created_at in ascending order', () => {
      const item1 = createItem('1', '2023-01-01T10:00:00.000Z', null, 'pending_payment')
      const item2 = createItem('2', '2023-01-01T10:05:00.000Z', 'pending_payment', 'paid')
      const item3 = createItem('3', '2023-01-01T10:10:00.000Z', 'paid', 'assigned')

      const input = [item3, item1, item2]
      const result = sortBookingStatusHistory(input)

      expect(result.map((i) => i.id)).toEqual(['1', '2', '3'])
    })

    it('should order items with the same timestamp by matching old_status to previous new_status', () => {
      const item1 = createItem('1', '2023-01-01T10:00:00.000Z', null, 'pending_payment')
      const item2 = createItem('2', '2023-01-01T10:00:00.000Z', 'pending_payment', 'paid')
      const item3 = createItem('3', '2023-01-01T10:00:00.000Z', 'paid', 'assigned')

      const input = [item3, item1, item2]
      const result = sortBookingStatusHistory(input)

      expect(result.map((i) => i.id)).toEqual(['1', '2', '3'])
    })

    it('should order correctly when there are multiple chains of same timestamps', () => {
      const t1 = '2023-01-01T10:00:00.000Z'
      const t2 = '2023-01-01T11:00:00.000Z'

      const item1 = createItem('1', t1, null, 'pending_payment')
      const item2 = createItem('2', t1, 'pending_payment', 'paid')

      const item3 = createItem('3', t2, 'paid', 'assigned')
      const item4 = createItem('4', t2, 'assigned', 'on_the_way')

      const input = [item4, item2, item3, item1]
      const result = sortBookingStatusHistory(input)

      expect(result.map((i) => i.id)).toEqual(['1', '2', '3', '4'])
    })

    it('should fallback to sorting by id if timestamps are the same and chain is broken', () => {
      const t1 = '2023-01-01T10:00:00.000Z'

      const item1 = createItem('b', t1, 'searching_worker', 'assigned')
      const item2 = createItem('a', t1, 'searching_worker', 'assigned')

      const input = [item1, item2]
      const result = sortBookingStatusHistory(input)

      expect(result.map((i) => i.id)).toEqual(['a', 'b'])
    })

    it('should push invalid dates to the start and sort them by id', () => {
      const item1 = createItem('c', 'invalid-date-1', 'pending_payment', 'paid')
      const item2 = createItem('a', 'invalid-date-2', 'paid', 'assigned')
      const item3 = createItem('b', '2023-01-01T10:00:00.000Z', 'assigned', 'on_the_way')

      const input = [item3, item1, item2]
      const result = sortBookingStatusHistory(input)

      expect(result.map((i) => i.id)).toEqual(['c', 'a', 'b'])
    })
  })
})
