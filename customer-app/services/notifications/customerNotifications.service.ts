import { apiRequest } from '../../lib/api'

export type CustomerPushPlatform =
  | 'android'
  | 'ios'
  | 'web'

export type CustomerPushToken = {
  id: string
  user_id: string
  token: string
  platform: CustomerPushPlatform | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CustomerNotification = {
  id: string
  bookingId: string | null
  title: string
  message: string
  notificationType: string
  isRead: boolean
  createdAt: string
}

type CustomerNotificationApi = {
  id: string
  booking_id: string | null
  title: string
  message: string
  notification_type: string | null
  is_read: boolean
  created_at: string
}

function validatePushToken(
  token: string,
): string {
  const normalized =
    token.trim()

  if (
    !/^ExponentPushToken\[[^\]]+\]$/.test(
      normalized,
    )
  ) {
    throw new Error(
      'Invalid Expo push token.',
    )
  }

  return normalized
}

function normalizePlatform(
  platform:
    | CustomerPushPlatform
    | null
    | undefined,
): CustomerPushPlatform | null {
  if (
    !platform ||
    platform.trim() === ''
  ) {
    return null
  }

  const normalized =
    platform.trim().toLowerCase()

  if (
    normalized !== 'android' &&
    normalized !== 'ios' &&
    normalized !== 'web'
  ) {
    throw new Error(
      'Invalid push token platform.',
    )
  }

  return normalized as CustomerPushPlatform
}

function mapNotification(
  row: CustomerNotificationApi,
): CustomerNotification {
  return {
    id: row.id,
    bookingId:
      row.booking_id ?? null,
    title: row.title,
    message: row.message,
    notificationType:
      row.notification_type ?? '',
    isRead:
      row.is_read === true,
    createdAt:
      row.created_at,
  }
}

export function formatUnreadNotificationCount(
  count: number,
): string {
  const safeCount =
    Number.isFinite(count)
      ? Math.max(
          0,
          Math.floor(count),
        )
      : 0

  return safeCount >= 100
    ? '99+'
    : String(safeCount)
}

export async function getCustomerNotifications(): Promise<
  CustomerNotification[]
> {
  const rows =
    await apiRequest<
      CustomerNotificationApi[]
    >(
      '/notifications?limit=100',
    )

  return (rows ?? []).map(
    mapNotification,
  )
}

export async function markCustomerNotificationRead(
  notificationId: string,
): Promise<void> {
  const normalizedId =
    notificationId.trim()

  if (!normalizedId) {
    throw new Error(
      'A notification id is required.',
    )
  }

  await apiRequest<unknown>(
    `/notifications/${encodeURIComponent(
      normalizedId,
    )}/read`,
    {
      method: 'POST',
    },
  )
}

export async function getUnreadCustomerNotificationCount(): Promise<number> {
  const count =
    await apiRequest<number>(
      '/notifications/unread-count',
    )

  return Number.isFinite(count)
    ? Math.max(
        0,
        Math.floor(count),
      )
    : 0
}

export async function registerCustomerPushToken(
  token: string,
  platform?:
    | CustomerPushPlatform
    | null,
): Promise<CustomerPushToken> {
  const normalizedToken =
    validatePushToken(token)

  const normalizedPlatform =
    normalizePlatform(platform)

  return apiRequest<CustomerPushToken>(
    '/notifications/push-tokens',
    {
      method: 'POST',
      body: JSON.stringify({
        token: normalizedToken,
        platform:
          normalizedPlatform,
      }),
    },
  )
}

export async function deactivateCustomerPushTokens(): Promise<void> {
  await apiRequest<unknown>(
    '/notifications/push-tokens',
    {
      method: 'DELETE',
    },
  )
}