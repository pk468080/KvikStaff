import { supabase } from '../../lib/supabase'

import type {
  WorkerNotification,
  WorkerNotificationList,
  WorkerNotificationType,
  WorkerPushPlatform,
  WorkerPushToken,
} from '../../types/notifications'

import {
  sortNotifications,
} from '../../lib/notificationUtils'

type WorkerNotificationRow = {
  id: string
  user_id: string
  booking_id: string | null
  title: string
  message: string
  notification_type: string | null
  is_read: boolean
  created_at: string
}

type WorkerPushTokenRow = {
  id: string
  user_id: string
  token: string
  platform: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const NOTIFICATION_SELECT = `
  id,
  user_id,
  booking_id,
  title,
  message,
  notification_type,
  is_read,
  created_at
`

const PUSH_TOKEN_SELECT = `
  id,
  user_id,
  token,
  platform,
  is_active,
  created_at,
  updated_at
`

function mapNotification(
  row: WorkerNotificationRow,
): WorkerNotification {
  return {
    id:
      row.id,

    userId:
      row.user_id,

    bookingId:
      row.booking_id,

    title:
      row.title,

    message:
      row.message,

    notificationType:
      row.notification_type as WorkerNotificationType | null,

    isRead:
      row.is_read,

    createdAt:
      row.created_at,
  }
}

function mapPushToken(
  row: WorkerPushTokenRow,
): WorkerPushToken {
  return {
    id:
      row.id,

    userId:
      row.user_id,

    token:
      row.token,

    platform:
      row.platform as WorkerPushPlatform | null,

    isActive:
      row.is_active,

    createdAt:
      row.created_at,

    updatedAt:
      row.updated_at,
  }
}

async function getCurrentWorkerId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!user) {
    throw new Error(
      'A worker authentication session is required.',
    )
  }

  return user.id
}

function validateNotificationId(
  notificationId: string,
): void {
  if (!notificationId.trim()) {
    throw new Error(
      'Notification id is required.',
    )
  }
}

function validatePushToken(
  token: string,
): void {
  const normalized = token.trim()

  if (!normalized) {
    throw new Error(
      'Push token is required.',
    )
  }

  if (!/^ExponentPushToken\\[[^\\]]+\\]$/.test(normalized)) {
    throw new Error(
      'Invalid Expo push token.',
    )
  }
}

function validateLimit(
  limit: number,
): number {
  if (
    !Number.isFinite(limit) ||
    !Number.isInteger(limit)
  ) {
    throw new Error(
      'Notification limit must be a whole number.',
    )
  }

  return Math.max(
    1,
    Math.min(
      limit,
      200,
    ),
  )
}

function normalizePlatform(
  platform: WorkerPushPlatform | null | undefined,
): string | null {
  if (
    platform === null ||
    platform === undefined ||
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

  return normalized
}

export async function getWorkerNotifications(
  limit = 50,
): Promise<WorkerNotification[]> {
  const workerId =
    await getCurrentWorkerId()

  const safeLimit =
    validateLimit(limit)

  const {
    data,
    error,
  } = await supabase
    .from('notifications')
    .select(
      NOTIFICATION_SELECT,
    )
    .eq(
      'user_id',
      workerId,
    )
    .order('created_at', {
      ascending: false,
    })
    .limit(safeLimit)

  if (error) {
    throw error
  }

  return sortNotifications(
    (data ?? []).map(
      (row) =>
        mapNotification(
          row as WorkerNotificationRow,
        ),
    ),
  )
}

export async function getWorkerNotification(
  notificationId: string,
): Promise<WorkerNotification | null> {
  validateNotificationId(
    notificationId,
  )

  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('notifications')
    .select(
      NOTIFICATION_SELECT,
    )
    .eq(
      'id',
      notificationId,
    )
    .eq(
      'user_id',
      workerId,
    )
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
    ? mapNotification(
        data as WorkerNotificationRow,
      )
    : null
}

export async function getWorkerNotificationList(
  limit = 50,
): Promise<WorkerNotificationList> {
  const [
    notifications,
    unreadCount,
  ] = await Promise.all([
    getWorkerNotifications(
      limit,
    ),
    getWorkerUnreadNotificationCount(),
  ])

  return {
    notifications,
    unreadCount,
  }
}

export async function getWorkerUnreadNotificationCount(
): Promise<number> {
  const workerId =
    await getCurrentWorkerId()

  const {
    count,
    error,
  } = await supabase
    .from('notifications')
    .select(
      'id',
      {
        count: 'exact',
        head: true,
      },
    )
    .eq(
      'user_id',
      workerId,
    )
    .eq(
      'is_read',
      false,
    )

  if (error) {
    throw error
  }

  return count ?? 0
}

export async function getWorkerNotificationsForBooking(
  bookingId: string,
  limit = 50,
): Promise<WorkerNotification[]> {
  if (!bookingId.trim()) {
    throw new Error(
      'Booking id is required.',
    )
  }

  const workerId =
    await getCurrentWorkerId()

  const safeLimit =
    validateLimit(limit)

  const {
    data,
    error,
  } = await supabase
    .from('notifications')
    .select(
      NOTIFICATION_SELECT,
    )
    .eq(
      'user_id',
      workerId,
    )
    .eq(
      'booking_id',
      bookingId,
    )
    .order('created_at', {
      ascending: false,
    })
    .limit(safeLimit)

  if (error) {
    throw error
  }

  return sortNotifications(
    (data ?? []).map(
      (row) =>
        mapNotification(
          row as WorkerNotificationRow,
        ),
    ),
  )
}

export async function getWorkerPushTokens(
): Promise<WorkerPushToken[]> {
  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('push_tokens')
    .select(
      PUSH_TOKEN_SELECT,
    )
    .eq(
      'user_id',
      workerId,
    )
    .order('created_at', {
      ascending: false,
    })

  if (error) {
    throw error
  }

  return (data ?? []).map(
    (row) =>
      mapPushToken(
        row as WorkerPushTokenRow,
      ),
  )
}

export async function deactivateActiveWorkerPushTokens(): Promise<void> {
  const tokens =
    await getWorkerPushTokens()

  const activeTokenIds =
    tokens
      .filter(token => token.isActive)
      .map(token => token.id)

  const results =
    await Promise.allSettled(
      activeTokenIds.map(tokenId =>
        deactivateWorkerPushTokenById(
          tokenId,
        ),
      ),
    )

  if (
    results.some(
      result => result.status === 'rejected',
    )
  ) {
    throw new Error(
      'One or more worker push tokens could not be deactivated.',
    )
  }
}

export async function registerWorkerPushToken(
  token: string,
  platform?: WorkerPushPlatform | null,
): Promise<WorkerPushToken> {
  validatePushToken(
    token,
  )

  const workerId =
    await getCurrentWorkerId()

  const normalizedToken =
    token.trim()

  const normalizedPlatform =
    normalizePlatform(
      platform,
    )

  const {
    data,
    error,
  } = await supabase.rpc(
    'register_worker_push_token',
    {
      p_token:
        normalizedToken,

      p_platform:
        normalizedPlatform,
    },
  )

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'Worker push token could not be registered.',
    )
  }

  const row =
    data as unknown as WorkerPushTokenRow

  if (
    row.user_id !==
    workerId
  ) {
    throw new Error(
      'Push token registration belongs to a different worker account.',
    )
  }

  return mapPushToken(
    row,
  )
}

export async function deactivateWorkerPushToken(
  token: string,
): Promise<WorkerPushToken | null> {
  validatePushToken(
    token,
  )

  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('push_tokens')
    .update({
      is_active:
        false,
    })
    .eq(
      'user_id',
      workerId,
    )
    .eq(
      'token',
      token.trim(),
    )
    .select(
      PUSH_TOKEN_SELECT,
    )
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
    ? mapPushToken(
        data as WorkerPushTokenRow,
      )
    : null
}

export async function deactivateWorkerPushTokenById(
  tokenId: string,
): Promise<WorkerPushToken | null> {
  if (!tokenId.trim()) {
    throw new Error(
      'Push token id is required.',
    )
  }

  const workerId =
    await getCurrentWorkerId()

  const {
    data,
    error,
  } = await supabase
    .from('push_tokens')
    .update({
      is_active:
        false,
    })
    .eq(
      'id',
      tokenId,
    )
    .eq(
      'user_id',
      workerId,
    )
    .select(
      PUSH_TOKEN_SELECT,
    )
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
    ? mapPushToken(
        data as WorkerPushTokenRow,
      )
    : null
}
