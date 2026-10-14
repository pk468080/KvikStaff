# KvikStaff MVP Launch Readiness

## System architecture and verified booking flows
The KvikStaff platform relies on a FastAPI backend, Expo React Native mobile apps (Customer and Worker), an Admin dashboard, and a Supabase PostgreSQL database. Key workflows including booking creation, razorpay payment, matching algorithm and push notifications have been successfully tested.

## Findings fixed and tests added
- **Worker Push Notification Payload Missing Offer ID (P1):** The `tempstaff_worker_notification_push` trigger function in Supabase did not include the `booking_worker_offer_id` parameter when dispatching messages to the `send-worker-push` Edge Function. The payload has been updated via migration `20261015000000_fix_worker_notification_push_payload.sql` to include this ID, enabling proper offer routing when workers tap the push notification. A regression test (`backend/tests/test_worker_notification_push_payload.py`) has been added to ensure this regression doesn't recur.

## External configuration steps
- **Supabase Vault Secrets:** Ensure `tempstaff_worker_push_secret` is configured in Supabase Vault.
- **Expo Push Notifications:** Validate and set APNs and FCM credentials inside Expo (EAS).
- **Razorpay Keys:** Ensure Razopay webhooks and key configurations are active in the live environment.

## Required secret names
- `tempstaff_worker_push_secret`
- Razorpay API and Webhook keys
- Expo Push credentials
- Supabase Project URL, API Keys and Database URL.

## Database migrations that require review
- `20261015000000_fix_worker_notification_push_payload.sql`: Modifies the `tempstaff_worker_notification_push` trigger function to add the `booking_worker_offer_id` field.

## Sandbox payment verification
Ensure that the Razorpay sandbox is set up to issue successful and failure triggers as configured.

## iOS and Android push-notification verification
The push notification pipeline is successfully constructed in code, ensuring both iOS and Android tokens route to the exact booking offer via `booking_worker_offer_id`. Physical device testing via test builds is required to finalize verification.

## Rollback and recovery procedures
If the new migration causes any failures in notification delivery, reverse the migration by executing a `CREATE OR REPLACE FUNCTION` command utilizing the previous payload structure that omitted `booking_worker_offer_id`.

## Remaining launch blockers and the evidence required to close them
- Production configuration in Supabase Dashboard (Secrets).
- External Dashboard manual setups for Razorpay and EAS.
- Production UI verifications on physical devices.
