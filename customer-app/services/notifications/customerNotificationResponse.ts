export type CustomerNotificationResponseData = {
  notification_id?: unknown
  booking_id?: unknown
}

type NotificationIdRef = {
  current: string | null
}

export async function handleCustomerNotificationResponse(
  data: CustomerNotificationResponseData | null | undefined,
  handledNotificationId: NotificationIdRef,
  markAsRead: (notificationId: string) => Promise<void>,
  onOpenBooking: (bookingId: string) => void,
): Promise<void> {
  const notificationId =
    typeof data?.notification_id === 'string' &&
    data.notification_id.trim().length > 0
      ? data.notification_id
      : null

  if (
    notificationId &&
    handledNotificationId.current ===
      notificationId
  ) {
    return
  }

  if (notificationId) {
    handledNotificationId.current =
      notificationId
  }

  const bookingId =
    typeof data?.booking_id === 'string' &&
    data.booking_id.trim().length > 0
      ? data.booking_id
      : null

  if (notificationId) {
    try {
      await markAsRead(notificationId)
    } catch (error) {
      console.error(
        'Unable to mark customer notification as read:',
        error,
      )
    }
  }

  if (bookingId) {
    onOpenBooking(bookingId)
  }
}