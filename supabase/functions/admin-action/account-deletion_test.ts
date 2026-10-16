
import { assert, assertEquals } from "jsr:@std/assert@1";
import { processAccountDeletionApproval } from "./account-deletion.ts";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const PROFILE_ID = "33333333-3333-4333-8333-333333333333";

type LookupResult = {
  found: boolean;
  notFound?: boolean;
  error?: { status?: number; code?: string; message?: string };
};

function makeDeps(options: Record<string, any> = {}) {
  const lookups: LookupResult[] = [
    ...(options.lookupResults ?? [
      { found: true },
      { found: false, notFound: true },
    ]),
  ];

  const deletions = [...(options.deletionResults ?? [{ error: null }])];

  const calls = {
    prepare: 0,
    findAuthUser: 0,
    deleteAuthUser: 0,
    banAuthUser: 0,
    complete: 0,
  };

  const deps = {
    prepare: async (_requestId: string) => {
      calls.prepare++;
      if (options.prepareThrows) throw new Error("Database unavailable");
      return options.prepareResult ?? {
        data: {
          requires_erasure: true,
          auth_user_id: AUTH_USER_ID,
          profile_id: PROFILE_ID,
        },
      };
    },

    findAuthUser: async (_userId: string) => {
      calls.findAuthUser++;
      if (options.lookupThrows) throw new Error("Auth lookup failed");
      return lookups.shift() ?? { found: false, notFound: true };
    },

    deleteAuthUser: async (_userId: string) => {
      calls.deleteAuthUser++;
      if (options.deleteThrows) throw new Error("Delete timed out");
      return deletions.shift() ?? { error: null };
    },

    banAuthUser: async (_userId: string) => {
      calls.banAuthUser++;
      if (options.banThrows) throw new Error("Ban failed");
      return { error: null };
    },

    complete: async (
      _requestId: string,
      _authUserId: string,
      _profileId: string,
    ) => {
      calls.complete++;
      if (options.completeThrows) {
        throw new Error("Completion failed");
      }
      return options.completeResult ?? {
        data: {
          success: true,
          request_id: REQUEST_ID,
          status: "approved",
        },
      };
    },
  };

  return { deps, calls };
}

Deno.test("successfully deletes and verifies the Auth identity", async () => {
  const { deps, calls } = makeDeps();

  const result = await processAccountDeletionApproval(REQUEST_ID, deps);

  assertEquals(result.kind, "success");
  assertEquals(calls.prepare, 1);
  assertEquals(calls.findAuthUser, 2);
  assertEquals(calls.deleteAuthUser, 1);
  assertEquals(calls.complete, 1);
});

Deno.test("finishes safely when the Auth user is already absent", async () => {
  const { deps, calls } = makeDeps({
    lookupResults: [{ found: false, notFound: true }],
  });

  const result = await processAccountDeletionApproval(REQUEST_ID, deps);

  assertEquals(result.kind, "success");
  assertEquals(calls.deleteAuthUser, 0);
  assertEquals(calls.banAuthUser, 0);
  assertEquals(calls.complete, 1);
});

Deno.test("failed deletion blocks sign-in where possible and remains retryable", async () => {
  const { deps, calls } = makeDeps({
    lookupResults: [
      { found: true },
      { found: true },
    ],
    deletionResults: [{ error: { message: "Delete failed" } }],
  });

  const result = await processAccountDeletionApproval(REQUEST_ID, deps);

assert(result.kind === "failure");
assertEquals(result.status, 503);
  assertEquals(calls.banAuthUser, 1);
  assertEquals(calls.complete, 0);
});

Deno.test("continues when deletion reports failure but Auth confirms absence", async () => {
  const { deps, calls } = makeDeps({
    lookupResults: [
      { found: true },
      { found: false, notFound: true },
    ],
    deletionResults: [{ error: { message: "Delete response failed" } }],
  });

  const result = await processAccountDeletionApproval(REQUEST_ID, deps);

  assertEquals(result.kind, "success");
  assertEquals(calls.banAuthUser, 0);
  assertEquals(calls.complete, 1);
});

Deno.test("allows retry after ban failure and eventually completes deletion", async () => {
  const { deps, calls } = makeDeps({
    lookupResults: [
      { found: true },
      { found: true },
      { found: true },
      { found: false, notFound: true },
    ],
    deletionResults: [
      { error: { message: "First deletion failed" } },
      { error: null },
    ],
    banThrows: true,
  });

  const firstAttempt = await processAccountDeletionApproval(REQUEST_ID, deps);

  assert(firstAttempt.kind === "failure");
  assertEquals(firstAttempt.status, 503);
  assertEquals(calls.complete, 0);

  const retry = await processAccountDeletionApproval(REQUEST_ID, deps);

  assertEquals(retry.kind, "success");
  assertEquals(calls.banAuthUser, 1);
  assertEquals(calls.deleteAuthUser, 2);
  assertEquals(calls.complete, 1);
});

Deno.test("does not report success if completion recording fails", async () => {
  const { deps, calls } = makeDeps({
    lookupResults: [{ found: false, notFound: true }],
    completeResult: {
      error: { message: "Completion RPC failed" },
    },
  });

  const result = await processAccountDeletionApproval(REQUEST_ID, deps);

assert(result.kind === "failure");
assertEquals(result.status, 503);
  assertEquals(calls.deleteAuthUser, 0);
  assertEquals(calls.complete, 1);
});

Deno.test("rejects an invalid request ID before performing deletion", async () => {
  const { deps, calls } = makeDeps();

  const result = await processAccountDeletionApproval("invalid-id", deps);

  assert(result.kind === "failure");
assertEquals(result.status, 400);
  assertEquals(calls.prepare, 0);
  assertEquals(calls.deleteAuthUser, 0);
});
