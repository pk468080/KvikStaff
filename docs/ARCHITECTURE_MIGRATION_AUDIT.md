# KvikStaff Architecture Migration Audit - Phase 1

**Inspected Commit:** a92c690af368e6358f5e1bc7a64f6cde3d5b2082

## 1. Existing Architecture Map

The current KvikStaff architecture represents a transitional state where different applications interface with the backend in varying ways:

### Customer App
- **Entry Points & Services:** Uses `apiRequest` to interact with FastAPI. Examples: `customer-app/services/booking/instantBooking.service.ts` calls FastAPI endpoints, `customer-app/services/payment/razorpay.service.ts` calls FastAPI for payment initialization.
- **Direct Supabase Usage:** Authentication uses `supabase.auth` directly (`customer-app/services/auth/auth.service.ts`). Real-time features use `supabase.channel` (`customer-app/screens/bookings/ActiveBookingScreen.tsx`).

### Worker App
- **Entry Points & Services:** Primarily interacts directly with PostgreSQL via Supabase RPCs. Examples: `worker-app/services/bookings/workerBookingIncidents.service.ts` calls `supabase.rpc('worker_report_booking_incident')`. `worker-app/services/bookings/workerBookings.service.ts` calls `supabase.rpc('worker_get_booking_offer_details')`.
- **Direct Supabase Usage:** Authentication (`supabase.auth`).

### Admin Dashboard
- **Entry Points & Services:** Mixed usage. Some direct Supabase RPC calls (`supabase.rpc('admin_review_account_deletion')` seen in `AccountDeletionRequests.tsx` but then it uses edge functions). Direct table reads/writes (`supabase.from('home_promotions').select(...)` in `OffersUpdates.tsx`).
- **Edge Functions:** Heavily relies on `supabase.functions.invoke`. Examples: `admin-action` (`admin-dashboard/src/pages/AccountDeletionRequests.tsx`), `create-worker` (`admin-dashboard/src/pages/Workers.tsx`), `process-razorpay-refund` (`admin-dashboard/src/pages/Payments.tsx`).

### FastAPI (Backend)
- **Routes & Structure:** Organized under `backend/app/api/v1/`. Includes routes for `bookings.py`, `payments.py`, `account.py`, `chat.py`, `worker_presence.py`, etc.
- **Services & DB Access:** Uses SQLAlchemy repository pattern (e.g., `BookingsRepository` calling `self.db.execute(text("SELECT public.cancel_customer_booking(...)"))`). It often acts as a proxy to PostgreSQL functions rather than containing the business logic itself.

### PostgreSQL
- **Business Functions:** Holds significant business logic and transaction boundaries. Examples: `cancel_customer_booking`, `reschedule_customer_booking` (`supabase/migrations/20261010175535_reschedule_customer_booking.sql`), `worker_report_booking_incident`.
- **RLS & Security:** Authoritative source for security. Extensive use of `SECURITY DEFINER` functions to bypass RLS safely for complex operations.

### Supabase Edge Functions
- **Webhooks & Background Tasks:** Handles integrations and background jobs. Examples: `razorpay-webhook`, `send-worker-push`, `process-worker-push-receipts`. Some admin actions (`admin-action`) also live here.

---

## 2. Business-Rule Ownership Matrix

| Business Workflow | Expected Behavior | Current Authoritative Implementation | Target Owner | Migration Dependencies | Risks |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Auth & Roles** | Users authenticate; roles verified | `supabase.auth`, RLS policies, DB triggers on `profiles` | Supabase Auth (remains), FastAPI for session enrichment | None (keep as is for now) | Changing auth flow breaks all apps |
| **2. Worker Verification** | Active, verified workers can take jobs | Postgres `profiles` table (`role = 'worker'`, `is_active = true`), RPCs enforce it | Postgres constraints, FastAPI orchestration | Migrate Worker App off RPCs to FastAPI | Breaking worker routing |
| **3. Instant Booking** | Bookings created, priced, matched instantly | FastAPI `create_instant_booking`, Postgres `create_instant_booking` | FastAPI (Orchestration), Postgres (Atomic creation) | Refactoring FastAPI to not just proxy SQL | Price calculation mismatches |
| **4. Scheduled Booking** | Multi-occurrence bookings created | FastAPI `create_scheduled_booking`, Postgres functions | FastAPI (Orchestration), Postgres (Atomic creation) | Same as Instant Booking | Handling recurring lock order safely |
| **5. Worker Matching** | Offers created, accepted, expired | Postgres RPCs (`worker_get_booking_offer_details`), Cron for expiry | FastAPI (Orchestration), Postgres (Atomic accept) | Move Worker App logic to FastAPI | Concurrent acceptance race conditions |
| **6. Status Transitions** | Cancel, reschedule, arrive, complete | FastAPI (Customer), Supabase RPCs (Worker), Postgres functions (e.g., `reschedule_customer_booking`) | FastAPI (Orchestration), Postgres (State machine) | Unifying Worker and Customer paths in FastAPI | State machine corruption |
| **7. Payments & Refunds** | Order creation, verification, refunds | FastAPI `create_razorpay_order`, Edge Functions (`razorpay-webhook`, `process-razorpay-refund`) | FastAPI (API/Verification), Edge Functions (Webhooks) | Move Admin refund logic from Edge to FastAPI | Duplicate charges, lost webhooks |
| **8. Notifications** | Push delivery, retry, receipts | Edge Functions (`send-worker-push`, `process-worker-push-receipts`) | Background Workers / Edge Functions | Keep async operations outside FastAPI request path | Notification delays, duplicate sends |
| **9. OTP Verification** | Generate and verify OTPs for booking | Edge Functions (`create-booking-otp`, `verify-booking-otp`), FastAPI | FastAPI | Move logic from Edge Function to FastAPI | OTP bypass |
| **10. Admin Operations** | Manage workers, content, approvals | Edge Function (`admin-action`), Direct Supabase UI calls | FastAPI | Move all Admin logic to FastAPI endpoints | Exposing admin functions via insecure APIs |
| **11. Reviews & Chat** | Leave reviews, send messages | FastAPI (Customer), Supabase RPCs (Worker) | FastAPI | Move Worker App logic to FastAPI | Losing chat messages during migration |
| **12. Data Access & RLS** | Secure read/write access | PostgreSQL RLS, `SECURITY DEFINER` functions | PostgreSQL RLS (remains the ultimate guard) | Ensure FastAPI authenticates DB connections | Accidental privilege escalation |

---

## 3. Migration Boundaries

- **UI Logic (Keep in Client):** Navigation, presentation, client-side form validation, local state management (React/Expo).
- **Client-Side Validation:** Must be re-validated by FastAPI using Pydantic schemas.
- **FastAPI Orchestration:** Handling API requests, input validation, provider integrations (Razorpay API calls), assembling complex responses, managing business workflows (e.g., calling DB to create a booking, then calling notification service).
- **PostgreSQL Invariants:** Transactional integrity, atomic state transitions (e.g., locking a booking row when a worker accepts), referential integrity, row-level security.
- **Edge Functions:** Webhooks from third-party providers (Razorpay), long-running asynchronous tasks, chron jobs.
- **Duplicated Code to Consolidate:** Admin actions currently split between edge functions and direct UI calls should move to FastAPI. Worker App RPCs should be wrapped by FastAPI.

**Safe DB Invocation by FastAPI:** FastAPI must connect to PostgreSQL passing the authenticated user's ID to assume the correct role/context, ensuring RLS policies apply appropriately rather than using a bypass service-role key for application operations.

---

## 4. Critical Compatibility Risks

- **Concurrent Worker Acceptance:** When moving worker acceptance from direct RPC to FastAPI, the atomic locking mechanism in Postgres MUST be preserved to prevent double-booking.
- **Idempotency:** Payment webhooks and booking creations must handle duplicate requests gracefully (idempotency keys are currently visible in FastAPI headers).
- **Older App Versions:** Installed worker apps calling `supabase.rpc` directly will fail if those RPCs are dropped or permissions revoked before forced app updates. The RPCs must be maintained alongside the new FastAPI endpoints during a transition period.
- **RPC Permissions:** Once FastAPI fully handles worker requests, direct public/authenticated execute grants on Postgres business RPCs should be revoked, restricting them to internal backend roles.
- **Booking State Transitions:** Changes to how cancellations handle refunds must not break existing active bookings.

---

## 5. Test Baseline Verification

Current tests are insufficient to guarantee a perfectly safe migration.
- **Unit Tests:** Present in `backend/tests/` (e.g., `test_addresses.py`), and some frontend tests (`customer-app/services/auth/auth.service.test.ts`), but coverage of core booking/payment logic is unclear.
- **API Contract Tests:** Need extensive tests verifying FastAPI request/response schemas match exactly what the mobile apps expect.
- **Database Integration Tests:** Crucial for verifying that FastAPI correctly invokes Postgres functions and respects transactions.
- **Concurrency Tests:** Required for worker acceptance (simulating two workers accepting the same offer simultaneously via FastAPI).
- **E2E Tests:** Required across both apps and admin dashboard to ensure the full flow (booking -> matching -> payment -> completion) works.

---

## 6. Prioritized Migration Plan

**Phase 1: Read-Only Worker App Migration**
- **Scope:** Migrate non-mutating worker actions (fetching profile, viewing available offers, reading earnings) to FastAPI.
- **Prerequisites:** Setup FastAPI routes for worker operations.
- **Required Tests:** API contract tests.
- **Risks:** Low. Only reading data.
- **Rollback:** Revert worker app to use RPCs.

**Phase 2: Admin Dashboard Read/Write Migration**
- **Scope:** Move all admin operations (content management, worker approvals) from direct DB access and Edge Functions to FastAPI.
- **Prerequisites:** Define FastAPI admin endpoints.
- **Required Tests:** API contract, E2E admin tests.
- **Risks:** Medium. Internal users only, but affects operations.
- **Rollback:** Revert admin UI to previous commit.

**Phase 3: Worker App Non-Critical Actions**
- **Scope:** Migrate incident reporting, support tickets, profile updates to FastAPI.
- **Prerequisites:** Phase 1 complete.
- **Required Tests:** DB integration tests.
- **Risks:** Medium.
- **Rollback:** Feature flags to switch between RPC and FastAPI.

**Phase 4: Core Booking Lifecycle (Customer & Worker)**
- **Scope:** Unify booking creation, cancellation, rescheduling, and worker acceptance in FastAPI.
- **Prerequisites:** Comprehensive concurrency and DB integration testing.
- **Required Tests:** Concurrency tests for worker acceptance, state machine tests for bookings.
- **Risks:** High. Core business flow.
- **Rollback:** Require forcing app updates if API contracts change.

**Phase 5: Payments & Edge Functions Cleanup**
- **Scope:** Migrate Razorpay verifications/refunds fully to FastAPI/dedicated webhook handlers. Revoke public RPC access for migrated functions.
- **Prerequisites:** Phase 4 stable.
- **Required Tests:** Provider sandbox tests.
- **Risks:** Very High. Financial impact.
- **Rollback:** Extremely difficult once DB permissions are changed.

---

## 7. Unresolved Questions

- What is the exact rollout strategy for mobile app updates to ensure older versions are deprecated safely?
- How much business logic currently residing in Postgres `SECURITY DEFINER` functions should be lifted into Python vs. kept in SQL for atomicity?
