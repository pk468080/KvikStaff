import {
  handleCustomerNotificationResponse,
} from './customerNotificationResponse'

describe('handleCustomerNotificationResponse', () => {
  it('marks a notification read before opening its booking', async () => {
    const handledNotificationId = {
      current: null,
    }
    const calls: string[] = []

    await handleCustomerNotificationResponse(
      {
        notification_id: 'notification-1',
        booking_id: 'booking-1',
      },
      handledNotificationId,
      async notificationId => {
        calls.push(`read:${notificationId}`)
      },
      bookingId => {
        calls.push(`open:${bookingId}`)
      },
    )

    expect(calls).toEqual([
      'read:notification-1',
      'open:booking-1',
    ])
  })

  it('marks a notification read without opening when no booking exists', async () => {
    const handledNotificationId = {
      current: null,
    }
    const markAsRead = jest.fn(async () => {})
    const onOpenBooking = jest.fn()

    await handleCustomerNotificationResponse(
      {
        notification_id: 'notification-2',
      },
      handledNotificationId,
      markAsRead,
      onOpenBooking,
    )

    expect(markAsRead).toHaveBeenCalledWith(
      'notification-2',
    )
    expect(onOpenBooking).not.toHaveBeenCalled()
  })

  it('opens the booking when marking the notification read fails', async () => {
    const handledNotificationId = {
      current: null,
    }
    const onOpenBooking = jest.fn()

    await handleCustomerNotificationResponse(
      {
        notification_id: 'notification-3',
        booking_id: 'booking-3',
      },
      handledNotificationId,
      async () => {
        throw new Error('network failure')
      },
      onOpenBooking,
    )

    expect(onOpenBooking).toHaveBeenCalledWith(
      'booking-3',
    )
  })

  it('does not process the same notification id twice', async () => {
    const handledNotificationId = {
      current: null,
    }
    const markAsRead = jest.fn(async () => {})
    const onOpenBooking = jest.fn()
    const data = {
      notification_id: 'notification-4',
      booking_id: 'booking-4',
    }

    await handleCustomerNotificationResponse(
      data,
      handledNotificationId,
      markAsRead,
      onOpenBooking,
    )
    await handleCustomerNotificationResponse(
      data,
      handledNotificationId,
      markAsRead,
      onOpenBooking,
    )

    expect(markAsRead).toHaveBeenCalledTimes(1)
    expect(onOpenBooking).toHaveBeenCalledTimes(1)
  })
})