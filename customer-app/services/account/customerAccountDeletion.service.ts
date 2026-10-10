import { apiRequest } from '../../lib/api'

export type AccountDeletionRequest = {
  id: string
  reason: string | null
  status:
    | 'pending'
    | 'processing'
    | 'approved'
    | 'rejected'
    | 'cancelled'
  requestedAt: string
  reviewedAt: string | null
}

type AccountDeletionRequestApi = {
  id: string
  reason: string | null
  status: AccountDeletionRequest['status']
  requested_at: string
  reviewed_at: string | null
}

function normalizeAccountDeletionRequest(
  value: AccountDeletionRequestApi,
): AccountDeletionRequest {
  if (
    value.status !== 'pending' &&
    value.status !== 'processing' &&
    value.status !== 'approved' &&
    value.status !== 'rejected' &&
    value.status !== 'cancelled'
  ) {
    throw new Error(
      `Unexpected account deletion request status: ${value.status}`,
    )
  }

  return {
    id: value.id,
    reason: value.reason ?? null,
    status: value.status,
    requestedAt: value.requested_at,
    reviewedAt: value.reviewed_at ?? null,
  }
}

export async function getLatestAccountDeletionRequest(): Promise<
  AccountDeletionRequest | null
> {
  const data =
    await apiRequest<
      AccountDeletionRequestApi | null
    >(
      '/account/deletion-request',
    )

  if (!data) {
    return null
  }

  return normalizeAccountDeletionRequest(
    data,
  )
}

export async function requestAccountDeletion(
  reason?: string,
): Promise<AccountDeletionRequest> {
  const data =
    await apiRequest<AccountDeletionRequestApi>(
      '/account/deletion-request',
      {
        method: 'POST',
        body: JSON.stringify({
          reason: reason?.trim() || null,
        }),
      },
    )

  return normalizeAccountDeletionRequest(
    data,
  )
}