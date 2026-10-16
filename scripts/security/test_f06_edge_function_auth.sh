#!/usr/bin/env bash
# Negative security smoke tests for F-06. This script sends only malformed
# signatures or invalid/missing credentials. It never sends a valid webhook,
# never uses a service-role/secret key, and should not mutate application data.
set -euo pipefail

: "${SUPABASE_URL:?Set SUPABASE_URL to the target Supabase project URL}"
PUBLIC_API_KEY="${SUPABASE_ANON_KEY:-${SUPABASE_PUBLISHABLE_KEY:-}}"
if [[ -z "$PUBLIC_API_KEY" ]]; then
  echo "Set SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY. Use a public key only." >&2
  exit 2
fi

BASE_URL="${SUPABASE_URL%/}"
TMP_RESPONSE="$(mktemp)"
trap 'rm -f "$TMP_RESPONSE"' EXIT
FAILURES=0

probe() {
  local label="$1"
  local accepted_codes="$2"
  local endpoint="$3"
  local body="$4"
  shift 4
  local -a extra_headers=("$@")
  local status
  local expected
  local matched=0

  if ! status="$(curl --silent --show-error --connect-timeout 5 --max-time 20 \
    --output "$TMP_RESPONSE" --write-out '%{http_code}' \
    --request POST \
    --header "apikey: ${PUBLIC_API_KEY}" \
    --header 'Content-Type: application/json' \
    "${extra_headers[@]}" \
    --data "$body" \
    "${BASE_URL}/functions/v1/${endpoint}")"; then
    printf 'FAIL %-46s (HTTP request failed)\n' "$label"
    FAILURES=$((FAILURES + 1))
    return
  fi

  IFS='|' read -r -a expected <<< "$accepted_codes"
  for code in "${expected[@]}"; do
    if [[ "$status" == "$code" ]]; then
      matched=1
      break
    fi
  done

  if [[ "$matched" -eq 1 ]]; then
    printf 'PASS %-46s HTTP %s\n' "$label" "$status"
  else
    printf 'FAIL %-46s expected [%s], received HTTP %s\n' \
      "$label" "$accepted_codes" "$status"
    FAILURES=$((FAILURES + 1))
  fi
}

PAYMENT_BODY='{"event":"payment.captured","payload":{}}'
PAYOUT_BODY='{"event":"payout.processed","payload":{"payout":{"entity":{"id":"pout_f06_probe","status":"processed","amount":100,"currency":"INR","fund_account_id":"fa_f06_probe"}}}}'
REFUND_BODY='{"refundId":"00000000-0000-4000-8000-000000000001"}'
MIGRATION_BODY='{"mode":"dry_run"}'

# Both webhook handlers must reject absent and forged HMAC signatures before
# making any database changes.
probe "Razorpay payment webhook: missing signature" "400" \
  "razorpay-webhook" "$PAYMENT_BODY" \
  -H 'X-Razorpay-Event-Id: f06-missing-payment-signature'
probe "Razorpay payment webhook: forged signature" "400" \
  "razorpay-webhook" "$PAYMENT_BODY" \
  -H 'X-Razorpay-Event-Id: f06-forged-payment-signature' \
  -H 'X-Razorpay-Signature: 0000000000000000000000000000000000000000000000000000000000000000'
probe "RazorpayX payout webhook: missing signature" "400" \
  "razorpayx-payout-webhook" "$PAYOUT_BODY"
probe "RazorpayX payout webhook: forged signature" "400" \
  "razorpayx-payout-webhook" "$PAYOUT_BODY" \
  -H 'X-Razorpay-Signature: 0000000000000000000000000000000000000000000000000000000000000000'

# These server-only functions must not accept missing or incorrect processor
# secrets. A public API key is supplied to pass the gateway, not to authenticate
# as a trusted internal caller.
probe "Refund processor: missing internal secret" "401" \
  "process-razorpay-refund" "$REFUND_BODY"
probe "Refund processor: incorrect internal secret" "401" \
  "process-razorpay-refund" "$REFUND_BODY" \
  -H 'x-tempstaff-refund-secret: invalid-f06-test-secret'
probe "Payout reconciler: missing internal secret" "401" \
  "reconcile-worker-payouts" '{}'
probe "Payout reconciler: incorrect internal secret" "401" \
  "reconcile-worker-payouts" '{}' \
  -H 'x-tempstaff-payout-secret: invalid-f06-test-secret'
probe "Phone migration: missing internal secret" "401" \
  "migrate-customer-phone-identities" "$MIGRATION_BODY"
probe "Phone migration: incorrect internal secret" "401" \
  "migrate-customer-phone-identities" "$MIGRATION_BODY" \
  -H 'x-auth-migration-secret: invalid-f06-test-secret'

# These handlers use @supabase/server auth: "secret". A public anon/publishable
# key must be rejected as an internal server credential.
probe "Push sender: public key is not a server secret" "401|403" \
  "send-worker-push" '{}'

# Probe the receipt processor with GET, not POST. If authentication is broken,
# GET reaches the handler's method guard and cannot start a receipt job.
probe_receipt_processor_non_mutating() {
  local status
  if ! status="$(curl --silent --show-error --connect-timeout 5 --max-time 20 \
    --output "$TMP_RESPONSE" --write-out '%{http_code}' \
    --request GET \
    --header "apikey: ${PUBLIC_API_KEY}" \
    --header 'Content-Type: application/json' \
    "${BASE_URL}/functions/v1/process-worker-push-receipts")"; then
    printf 'FAIL %-46s (HTTP request failed)\n' \
      "Receipt processor: public key must be rejected"
    FAILURES=$((FAILURES + 1))
    return
  fi
  if [[ "$status" == "401" || "$status" == "403" ]]; then
    printf 'PASS %-46s HTTP %s\n' \
      "Receipt processor: public key must be rejected" "$status"
  else
    printf 'FAIL %-46s expected [401|403], received HTTP %s\n' \
      "Receipt processor: public key must be rejected" "$status"
    FAILURES=$((FAILURES + 1))
  fi
}
probe_receipt_processor_non_mutating

if [[ "$FAILURES" -ne 0 ]]; then
  printf '\nF-06 smoke tests failed: %s\n' "$FAILURES" >&2
  exit 1
fi
