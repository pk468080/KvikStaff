// worker-app/types/notifications.ts

export type WorkerNotificationType =
  | 'booking'
  | 'booking_offer'
  | 'booking_update'
  | 'booking_reminder'
  | 'payment'
  | 'earnings'
  | 'account'
  | 'support'
  | 'system'
  | string

export type WorkerNotification = {
  id: string

  userId: string
  bookingId: string | null
  bookingWorkerOfferId: string | null

  title: string
  message: string

  notificationType: WorkerNotificationType | null

  isRead: boolean

  createdAt: string
}

export type WorkerPushPlatform =
  | 'ios'
  | 'android'
  | 'web'
  | string

export type WorkerPushToken = {
  id: string

  userId: string
  token: string

  platform: WorkerPushPlatform | null

  isActive: boolean

  createdAt: string
  updatedAt: string
}

export type WorkerNotificationList = {
  notifications: WorkerNotification[]

  unreadCount: number
}

export type WorkerNotificationPreferences = {
  bookingOffers: boolean
  bookingUpdates: boolean
  bookingReminders: boolean
  earnings: boolean
  support: boolean
  system: boolean
}