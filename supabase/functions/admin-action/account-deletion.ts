/**
 * Retry-safe coordinator for customer account erasure.
 *
 * Database scrubbing happens transactionally in prepare_customer_account_deletion.
 * Supabase Auth deletion is a separate Admin API call, so completion is recorded only
 * after the Auth identity is verified absent. Each dependency is injected for tests.
 */

export type DeletionError = {
  message?: string;
  code?: string;
  status?: number;
};

export type RpcResult = {
  data: unknown | null;
  error: DeletionError | null;
};

export type AuthLookupResult = {
  found: boolean;
  notFound?: boolean;
  error?: DeletionError | null;
};

export type AccountDeletionDependencies = {
  prepare: (requestId: string) => Promise<RpcResult>;
  findAuthUser: (userId: string) => Promise<AuthLookupResult>;
  deleteAuthUser: (userId: string) => Promise<{ error: DeletionError | null }>;
  banAuthUser: (userId: string) => Promise<{ error: DeletionError | null }>;
  complete: (requestId: string, authUserId: string, profileId: string) => Promise<RpcResult>;
};

export type AccountDeletionOutcome =
  | { kind: 'not-applicable' }
  | { kind: 'success'; data: unknown }
  | { kind: 'failure'; status: number; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function prepareFailure(error: DeletionError): AccountDeletionOutcome {
  if (
    error.code === '55000' ||
    /active bookings|manual review|cannot be erased/i.test(error.message ?? '')
  ) {
    return {
      kind: 'failure',
      status: 409,
      error: error.message || 'Resolve active services before approving this deletion request.',
    };
  }

  if (error.code === '42501') {
    return { kind: 'failure', status: 403, error: 'Administrator access required.' };
  }

  if (/deletion request not found/i.test(error.message ?? '')) {
    return { kind: 'failure', status: 404, error: 'Deletion request not found.' };
  }

  return {
    kind: 'failure',
    status: 400,
    error: error.message || 'Unable to prepare account deletion.',
  };
}

function authLookupFailure(error?: DeletionError | null): AccountDeletionOutcome {
  if (error?.status === 401 || error?.status === 403) {
    return { kind: 'failure', status: 403, error: 'Administrator access required to delete the account.' };
  }

  return {
    kind: 'failure',
    status: 503,
    error: 'Unable to verify the account identity with Supabase Auth. The request remains available to retry.',
  };
}

export async function processAccountDeletionApproval(
  requestId: string,
  deps: AccountDeletionDependencies,
): Promise<AccountDeletionOutcome> {
  if (!UUID_PATTERN.test(requestId)) {
    return { kind: 'failure', status: 400, error: 'A valid deletion request ID is required.' };
  }

  let prepared: RpcResult;
  try {
    prepared = await deps.prepare(requestId);
  } catch {
    return {
      kind: 'failure',
      status: 503,
      error: 'Unable to prepare account deletion. The request can be retried.',
    };
  }

  if (prepared.error) return prepareFailure(prepared.error);

  if (!isRecord(prepared.data)) {
    return { kind: 'failure', status: 500, error: 'Unexpected account-deletion preparation response.' };
  }

  // Keep the existing reviewed worker-deactivation workflow unchanged.
  if (prepared.data.requires_erasure === false) return { kind: 'not-applicable' };
  if (prepared.data.requires_erasure !== true) {
    return { kind: 'failure', status: 500, error: 'Unexpected account-deletion preparation response.' };
  }

  const authUserId = prepared.data.auth_user_id;
  const profileId = prepared.data.profile_id;

  if (
    typeof authUserId !== 'string' ||
    !UUID_PATTERN.test(authUserId) ||
    typeof profileId !== 'string' ||
    !UUID_PATTERN.test(profileId) ||
    authUserId === profileId
  ) {
    return { kind: 'failure', status: 500, error: 'Deletion target could not be verified. The request can be retried.' };
  }

  let initialLookup: AuthLookupResult;
  try {
    initialLookup = await deps.findAuthUser(authUserId);
  } catch {
    return authLookupFailure();
  }

  if (initialLookup.error && !initialLookup.notFound) {
    return authLookupFailure(initialLookup.error);
  }

  if (!initialLookup.found && !initialLookup.notFound) {
    return authLookupFailure(initialLookup.error);
  }

  if (initialLookup.found) {
    let deletion: { error: DeletionError | null };

    try {
      deletion = await deps.deleteAuthUser(authUserId);
    } catch {
      // The API can time out after successfully deleting the identity. Verify before failing.
      deletion = { error: { message: 'Auth deletion outcome is unknown.' } };
    }

    if (deletion.error) {
      let afterFailure: AuthLookupResult;

      try {
        afterFailure = await deps.findAuthUser(authUserId);
      } catch {
        return authLookupFailure();
      }

      if (afterFailure.error && !afterFailure.notFound) {
        return authLookupFailure(afterFailure.error);
      }

      if (afterFailure.found) {
        // Block fresh sign-ins while the admin retries a failed deletion. The profile
        // was already deactivated transactionally before this cross-service step.
        try {
          await deps.banAuthUser(authUserId);
        } catch {
          // Never mark the request complete when the Auth state cannot be confirmed.
        }

        return {
          kind: 'failure',
          status: 503,
          error: 'Supabase Auth has not confirmed deletion. The account is deactivated and sign-in has been blocked where possible; retry this request.',
        };
      }

      if (!afterFailure.notFound) {
        return authLookupFailure(afterFailure.error);
      }
    } else {
      // Do not mark the request complete based only on a successful HTTP response.
      let afterDelete: AuthLookupResult;

      try {
        afterDelete = await deps.findAuthUser(authUserId);
      } catch {
        return authLookupFailure();
      }

      if (afterDelete.error && !afterDelete.notFound) {
        return authLookupFailure(afterDelete.error);
      }

      if (afterDelete.found) {
        return {
          kind: 'failure',
          status: 503,
          error: 'Supabase Auth still reports the identity. The request can be retried.',
        };
      }

      if (!afterDelete.notFound) {
        return authLookupFailure(afterDelete.error);
      }
    }
  }

  // If the Auth identity is already absent, treat the operation as a retry and just finish.
  let completed: RpcResult;

  try {
    completed = await deps.complete(requestId, authUserId, profileId);
  } catch {
    return {
      kind: 'failure',
      status: 503,
      error: 'The Auth identity is absent, but completion could not be recorded. Retry this request to finish safely.',
    };
  }

  if (completed.error) {
    return {
      kind: 'failure',
      status: 503,
      error: 'The Auth identity is absent, but completion could not be recorded. Retry this request to finish safely.',
    };
  }

  return {
    kind: 'success',
    data: completed.data ?? { success: true, request_id: requestId, status: 'approved' },
  };
}