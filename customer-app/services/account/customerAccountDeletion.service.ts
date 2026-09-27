import { supabase } from '../../lib/supabase'

export type AccountDeletionRequest = {
  id: string
  reason: string | null
  status:
    | 'pending'
    | 'approved'
    | 'rejected'
  requestedAt: string
  reviewedAt: string | null
}

async function getAuthenticatedUserId() {
  const {
    data,
    error,
  } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  if (!data.user) {
    throw new Error(
      'A customer authentication session is required.',
    )
  }

  return data.user.id
}

export async function getLatestAccountDeletionRequest(): Promise<
  AccountDeletionRequest | null
> {
  const userId =
    await getAuthenticatedUserId()

  const {
    data,
    error,
  } = await supabase
    .from('account_deletion_requests')
    .select(
      `
        id,
        reason,
        status,
        requested_at,
        reviewed_at
      `,
    )
    .eq('user_id', userId)
    .order(
      'requested_at',
      {
        ascending: false,
      },
    )
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  if (!data) {
    return null
  }

  return {
    id: data.id,
    reason:
      data.reason ?? null,
    status: data.status,
    requestedAt:
      data.requested_at,
    reviewedAt:
      data.reviewed_at ?? null,
  }
}

export async function requestAccountDeletion(
  reason?: string,
): Promise<AccountDeletionRequest> {
  const userId =
    await getAuthenticatedUserId()

  const {
    data: existing,
    error: existingError,
  } = await supabase
    .from('account_deletion_requests')
    .select(
      `
        id,
        reason,
        status,
        requested_at,
        reviewed_at
      `,
    )
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order(
      'requested_at',
      {
        ascending: false,
      },
    )
    .limit(1)
    .maybeSingle()

  if (existingError) {
    throw existingError
  }

  if (existing) {
    return {
      id: existing.id,
      reason:
        existing.reason ?? null,
      status: existing.status,
      requestedAt:
        existing.requested_at,
      reviewedAt:
        existing.reviewed_at ?? null,
    }
  }

  const trimmedReason =
    reason?.trim() || null

  const {
    data,
    error,
  } = await supabase
    .from(
      'account_deletion_requests',
    )
    .insert({
      user_id: userId,
      reason: trimmedReason,
      status: 'pending',
    })
    .select(
      `
        id,
        reason,
        status,
        requested_at,
        reviewed_at
      `,
    )
    .single()

  if (error) {
    throw error
  }

  if (!data) {
    throw new Error(
      'Your deletion request could not be submitted.',
    )
  }

  return {
    id: data.id,
    reason:
      data.reason ?? null,
    status: data.status,
    requestedAt:
      data.requested_at,
    reviewedAt:
      data.reviewed_at ?? null,
  }
}
