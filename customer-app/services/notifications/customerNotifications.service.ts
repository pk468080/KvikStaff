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

function validatePushToken(
  token: string,
): string {
  const normalized = token.trim()

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

export function formatUnreadNotificationCount(
  count: number,
): string {
  const safeCount = Number.isFinite(count)
    ? Math.max(0, Math.floor(count))
    : 0

  return safeCount >= 100
    ? '99+'
    : String(safeCount)
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
    `/notifications/${normalizedId}/read`,
    {
      method: 'POST',
    },
  )
}
