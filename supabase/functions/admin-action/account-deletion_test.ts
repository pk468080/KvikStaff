import { processAccountDeletionApproval } from './account-deletion.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const requestId = '11111111-2222-4333-8444-555555555555';
const authUserId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const profileId = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';

type TestDependencies = {
  prepareData?: unknown;
  prepareError?: { message?: string; code?: string } | null;
  authExists?: boolean;
  authLookupError?: { message?: string; status?: number } | null;
  deleteError?: { message?: string } | null;
  banError?: { message?: string } | null;
  completeError?: { message?: string } | null;
  events?: string[];
};

function dependencies(overrides: TestDependencies = {}) {
  const events = overrides.events ?? [];
  let authExists = overrides.authExists ?? true;

  return {
    events,
    deps: {
      prepare: async () => {
        events.push('prepare');

        return {
          data: Object.prototype.hasOwnProperty.call(overrides, 'prepareData')
            ? overrides.prepareData
            : {
                requires_erasure: true,
                auth_user_id: authUserId,
                profile_id: profileId,
                status: 'processing',
              },
          error: overrides.prepareError ?? null,
        };
      },

      findAuthUser: async (passedUserId: string) => {
        assertEquals(passedUserId, authUserId, 'Auth lookup uses original auth UUID');
        events.push('find-auth');

        if (overrides.authLookupError) {
          return { found: false, error: overrides.authLookupError };
        }

        return authExists
          ? { found: true }
          : { found: false, notFound: true };
      },

      deleteAuthUser: async (passedUserId: string) => {
        assertEquals(passedUserId, authUserId, 'Auth deletion uses original auth UUID');
        events.push('delete-auth');

        if (overrides.deleteError) return { error: overrides.deleteError };

        authExists = false;
        return { error: null };
      },

      banAuthUser: async (passedUserId: string) => {
        assertEquals(passedUserId, authUserId, 'Auth ban uses original auth UUID');
        events.push('ban-auth');

        return { error: overrides.banError ?? null };
      },

      complete: async (
        _requestId: string,
        passedAuthUserId: string,
        passedProfileId: string,
      ) => {
        assertEquals(passedAuthUserId, authUserId, 'complete uses original auth UUID');
        assertEquals(passedProfileId, profileId, 'complete uses pseudonymous profile UUID');
        events.push('complete');

        return {
          data: { success: true, request_id: requestId, status: 'approved' },
          error: overrides.completeError ?? null,
        };
      },
    },
  };
}

Deno.test('worker requests fall through to the existing deactivation RPC', async () => {
  const { deps, events } = dependencies({
    prepareData: { requires_erasure: false, role: 'worker' },
  });

  const result = await processAccountDeletionApproval(requestId, deps);

  assertEquals(result, { kind: 'not-applicable' }, 'worker result');
  assertEquals(events, ['prepare'], 'worker sequence');
});

Deno.test('customer approval prepares data, deletes Auth identity, verifies absence, and completes', async () => {
  const { deps, events } = dependencies();

  const result = await processAccountDeletionApproval(requestId, deps);

  assert(result.kind === 'success', 'expected success');
  assertEquals(
    events,
    ['prepare', 'find-auth', 'delete-auth', 'find-auth', 'complete'],
    'successful sequence',
  );
});

Deno.test('retry resumes when the Auth identity is already absent', async () => {
  const { deps, events } = dependencies({ authExists: false });

  const result = await processAccountDeletionApproval(requestId, deps);

  assert(result.kind === 'success', 'expected success');
  assertEquals(events, ['prepare', 'find-auth', 'complete'], 'retry sequence');
});

Deno.test('Auth deletion failure does not mark the request completed while identity still exists', async () => {
  const { deps, events } = dependencies({
    deleteError: { message: 'API unavailable' },
  });

  const result = await processAccountDeletionApproval(requestId, deps);

  assert(result.kind === 'failure' && result.status === 503, 'expected retryable failure');
  assert(events.includes('ban-auth'), 'must block a new sign-in while retry is pending');
  assert(!events.includes('complete'), 'must not complete');
});

Deno.test('active-booking conflict returns 409 before Auth deletion', async () => {
  const { deps, events } = dependencies({
    prepareError: {
      code: '55000',
      message: 'Customer has active bookings; resolve them first',
    },
  });

  const result = await processAccountDeletionApproval(requestId, deps);

  assert(result.kind === 'failure' && result.status === 409, 'expected conflict');
  assert(
    !events.includes('delete-auth') && !events.includes('complete'),
    'must not delete or complete',
  );
});

Deno.test('invalid request IDs never invoke dependencies', async () => {
  const { deps, events } = dependencies();

  const result = await processAccountDeletionApproval('not-a-uuid', deps);

  assert(result.kind === 'failure' && result.status === 400, 'expected validation error');
  assertEquals(events, [], 'no dependency calls');
});

Deno.test('unexpected preparation payload fails closed instead of approving via the old RPC', async () => {
  const { deps, events } = dependencies({ prepareData: null });

  const result = await processAccountDeletionApproval(requestId, deps);

  assert(result.kind === 'failure' && result.status === 500, 'expected failed closed');
  assertEquals(events, ['prepare'], 'no deletion calls');
});

Deno.test('mismatched original and pseudonymous identifiers fail closed', async () => {
  const { deps, events } = dependencies({
    prepareData: {
      requires_erasure: true,
      auth_user_id: authUserId,
      profile_id: authUserId,
      status: 'processing',
    },
  });

  const result = await processAccountDeletionApproval(requestId, deps);

  assert(result.kind === 'failure' && result.status === 500, 'expected failed closed');
  assertEquals(events, ['prepare'], 'must not call Auth or complete for a mismatched identity');
});

Deno.test('completion failure remains retryable after Auth deletion is verified', async () => {
  const { deps, events } = dependencies({
    completeError: { message: 'database unavailable' },
  });

  const result = await processAccountDeletionApproval(requestId, deps);

  assert(result.kind === 'failure' && result.status === 503, 'expected retryable completion failure');
  assertEquals(
    events,
    ['prepare', 'find-auth', 'delete-auth', 'find-auth', 'complete'],
    'completion sequence',
  );
});