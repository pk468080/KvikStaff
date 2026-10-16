# F-06 — Edge Function self-authentication review

Review date: 2026-10-16
Scope: deployed Supabase Edge Functions with gateway `verify_jwt=false`.

## Decision

The code review found handler-level authentication in all seven functions in the audit inventory. `verify_jwt=false` is not an authentication mechanism; it delegates the decision to the handler. No handler secret values were read or logged during this review, and no production data was changed.

The repository previously omitted explicit `verify_jwt=false` entries for four functions whose live deployment has it disabled. The config and regression test added with F-06 make that deployment intent explicit.

## Function-by-function checklist

| Deployed function | Authentication / authorization evidence | Payment/state safety | Review status |
| --- | --- | --- | --- |
| `razorpay-webhook` (live v15) | Requires `X-Razorpay-Signature` and `X-Razorpay-Event-Id`; computes HMAC-SHA256 over the raw body using `RAZORPAY_WEBHOOK_SECRET`; rejects a bad signature before inserting an event. | Fetches the authoritative payment from Razorpay; requires a captured payment for the same order; compares provider amount and currency with the local payment; uses a unique event record and idempotent finalization RPC. | Handler check present; negative smoke tests provided. |
| `process-razorpay-refund` (live v21) | Accepts either the internal `x-tempstaff-refund-secret` validated by `verify_refund_processor_secret`, or a bearer token resolved through Supabase Auth and an active `profiles.role = admin` record. | Re-fetches payment details, matches amount/currency, atomically claims the refund, and reconciles processing refunds before retrying to avoid duplicate provider requests. | Handler check present; negative smoke tests provided. |
| `send-worker-push` (live v15) | Uses `withSupabase({ auth: "secret" })`; a public anon/publishable key is not an acceptable caller credential. The database notification trigger reads `tempstaff_worker_push_secret` from Vault and sends it in the `apikey` header. | Validates the notification envelope and required identifiers before sending; writes delivery records with a uniqueness key. | Handler check present; live invocation not observed in the sampled 24-hour log window. Verify Vault key ownership/rotation as an operational control. |
| `process-worker-push-receipts` (live v10) | Uses `withSupabase({ auth: "secret" })`. The `process_worker_push_receipts_every_5_minutes` cron job calls it with the Vault-held `tempstaff_worker_push_secret` via `apikey`. | Only selects pending receipts, expires old work, bounds each request to 1,000 receipts, and records results; token retirement requires the stored token hash to match. | Handler check present; 244 HTTP 200 requests observed in the sampled 24-hour log window. The smoke script probes this endpoint with GET only, so it never starts receipt processing. |
| `razorpayx-payout-webhook` (live v11) | Verifies HMAC-SHA256 over the raw body using `RAZORPAYX_WEBHOOK_SECRET`; rejects missing/forged signatures before processing. Uses the provider event ID, with a raw-body hash fallback for deduplication. | Requires a payout entity with ID/status/amount/INR currency/fund-account ID; matches the local RazorpayX payout and amount/currency; applies the provider update through a database RPC. | Handler check present; negative smoke tests provided. |
| `reconcile-worker-payouts` (live v11) | Requires `x-tempstaff-payout-secret`, verified through `verify_worker_payout_processor_secret` using server-side credentials. | Calls RazorpayX, matches the local payout reference, amount, INR currency and fund-account ID when available, then applies the provider update through a database RPC. | Handler check present; negative smoke tests provided. |
| `migrate-customer-phone-identities` (live v14) | Requires `AUTH_MIGRATION_SECRET` configured with at least 64 characters and compares `x-auth-migration-secret` in constant time. | Rejects oversized/invalid requests; separates `dry_run` and `apply`; the apply mode requires an exact confirmation phrase and the dry-run plan fingerprint. | Handler check present; negative smoke tests provided. |

The audit label `migrate-customer-phoneidentities` differs from the actual deployed slug `migrate-customer-phone-identities`; this review uses the deployed slug.

## Live-log evidence and limits

For 2026-10-15 09:15 UTC through 2026-10-16 09:15 UTC, the unified function-edge log query returned 244 requests to `process-worker-push-receipts`, all with HTTP 200. No requests for the other six functions appeared in that query window. This shows the scheduled receipt endpoint was reachable and returned success during the window; it is not proof that every function's negative cases have been exercised.

## How to test

1. CI runs `backend/tests/test_f06_edge_function_auth_config.py`, which fails if any of these seven functions loses its explicit `verify_jwt = false` configuration.
2. From a trusted workstation, run `scripts/security/test_f06_edge_function_auth.sh` against the desired project. It uses only a public anon/publishable API key and sends invalid credentials or forged webhook signatures. It never sends a POST to the receipt processor; that endpoint is probed with GET only to avoid accidentally starting a job if its authentication regresses.
3. Review the script output. A `503` for the internal-secret tests indicates missing server-side configuration and is a failure, not a passing authentication result. Do not test valid payment/payout signatures against production; exercise those positive paths in a controlled test environment.

Example (use the project URL and public API key from Supabase Settings → API Keys):

```bash
export SUPABASE_URL='https://YOUR_PROJECT_REF.supabase.co'
export SUPABASE_PUBLISHABLE_KEY='sb_publishable_...'
bash scripts/security/test_f06_edge_function_auth.sh
```

Never use a service-role key or a secret API key as the script's `SUPABASE_ANON_KEY`/`SUPABASE_PUBLISHABLE_KEY` value.

## Conditions before closing F-06

- The config regression test passes in CI.
- The negative-auth smoke tests pass against the deployed endpoints with correct server configuration.
- In a controlled test environment, valid webhook signatures reach the intended validation/finalization paths, and duplicate deliveries remain idempotent.
- The Supabase dashboard inventory and repository config remain aligned.
