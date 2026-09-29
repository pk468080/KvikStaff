import { supabase } from '../../lib/supabase'

type MarkNotificationReadResult = {
  success?: boolean
  notification_id?: string
  is_read?: boolean
  changed?: boolean
  error?: string
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

export async function markWorkerNotificationRead(
  notificationId: string,
): Promise<void> {
  validateNotificationId(
    notificationId,
  )

  const {
    data,
    error,
  } = await supabase.rpc(
    'mark_notification_read',
    {
      p_notification_id:
        notificationId,
    },
  )

  if (error) {
    throw error
  }

  const result =
    (data ?? {}) as MarkNotificationReadResult

  if (
    result.success !== true
  ) {
    throw new Error(
      result.error ??
        'Notification could not be marked as read.',
    )
  }

  if (
    result.notification_id &&
    result.notification_id !==
      notificationId
  ) {
    throw new Error(
      'Notification response belongs to a different notification.',
    )
  }
}