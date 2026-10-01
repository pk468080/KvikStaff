import { supabase } from '../../lib/supabase'

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

async function getCurrentCustomerId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error(
      'A customer authentication session is required.',
    )
  }

  return user.id
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

export async function getUnreadCustomerNotificationCount(): Promise<number> {
  const customerId =
    await getCurrentCustomerId()

  const {
    count,
    error,
  } = await supabase
    .from('notifications')
    .select('id', {
      count: 'exact',
      head: true,
    })
    .eq('user_id', customerId)
    .eq('is_read', false)

  if (error) {
    throw error
  }

  if (
    typeof count !== 'number' ||
    !Number.isFinite(count)
  ) {
    return 0
  }

  return Math.min(
    Number.MAX_SAFE_INTEGER,
    Math.max(0, Math.floor(count)),
  )
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

  const customerId =
    await getCurrentCustomerId()

  const {
    data,
    error,
  } = await supabase.rpc(
    'register_customer_push_token',
    {
      p_token:
        normalizedToken,
      ...(normalizedPlatform
  ? {
      p_platform:
        normalizedPlatform,
    }
  : {}),
    },
  )

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'Customer push token could not be registered.',
    )
  }

  const row =
    data as CustomerPushToken

  if (
    row.user_id !==
    customerId
  ) {
    throw new Error(
      'Push token registration belongs to a different customer account.',
    )
  }

  return row
}

export async function deactivateCurrentCustomerPushTokens(): Promise<void> {
  const customerId =
    await getCurrentCustomerId()

  const {
    error,
  } = await supabase
    .from('push_tokens')
    .update({
      is_active: false,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      'user_id',
      customerId,
    )
    .eq(
      'is_active',
      true,
    )

  if (error) {
    throw error
  }
}