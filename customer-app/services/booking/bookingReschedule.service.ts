import { apiRequest } from '../../lib/api'

export type CustomerRescheduleResult = {
  success: boolean
  booking_id?: string
  occurrence_id?: string
  scheduled_start?: string
  scheduled_end?: string
  previous_scheduled_start?: string
  previous_scheduled_end?: string
  timezone?: string
}

export async function rescheduleCustomerBooking(
  bookingId: string,
  newStart: string,
  newEnd: string,
): Promise<CustomerRescheduleResult> {
  if (!bookingId) {
    throw new Error('Booking ID is required.')
  }

  if (!newStart || !newEnd) {
    throw new Error('New booking time is required.')
  }

  return apiRequest<CustomerRescheduleResult>(
    `/bookings/${bookingId}/reschedule`,
    {
      method: 'POST',
      body: JSON.stringify({
        new_start: newStart,
        new_end: newEnd,
      }),
    },
  )
}