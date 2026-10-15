# Architecture Migration Test Baseline

**Inspected Commit:** a92c690af368e6358f5e1bc7a64f6cde3d5b2082

## 1. Test Infrastructure Inspected

### Backend (Python/FastAPI)
- **Framework:** `pytest` (8.4.2) with `pytest-asyncio` for async tests.
- **Location:** `backend/tests/`
- **Current State:** 84 collected test items across multiple modules (`test_atomic_idempotency.py`, `test_bookings_authorization.py`, `test_idempotency.py`, `test_payments_service.py`, etc.).
- **Execution:** Runs successfully when executed via `python -m pytest` with correctly mocked environment variables (`DATABASE_URL`, `SUPABASE_URL`, `REDIS_URL`, `ENVIRONMENT="test"`).
- **Setup Issues:** The test suite initially failed to collect due to missing dependencies like `sqlalchemy`, `pydantic`, `fastapi`, etc., because the environment wasn't properly initialized. Running `pip install -e '.[dev]'` inside the backend directory resolved the module import errors, and the tests passed (84 passed).
- **Mocks & Isolation:** Heavy use of mocking. Tests do not appear to rely on a live, running Postgres instance natively out of the box without specific CI setup.

### Customer App (React Native/Expo)
- **Framework:** Jest (`jest-expo`).
- **Location:** `customer-app/services/**/*.test.ts`
- **Current State:** 30 tests passing across 6 suites (e.g., `auth.service.test.ts`, `bookingTracking.service.test.ts`, `review.service.test.ts`).
- **Coverage Type:** Unit tests primarily focusing on service-level logic and mocking API calls via `apiRequest` or Supabase directly.

### Worker App (React Native/Expo)
- **Framework:** Jest (`jest-expo`).
- **Location:** `worker-app/__tests__/`
- **Current State:** 9 tests passing across 4 suites (e.g., `workerEarningsRegression.test.ts`, `pushTokenValidation.test.ts`).
- **Coverage Type:** Unit and basic integration tests with heavy mocking.

---

## 2. Workflows Covered (Baseline Status)

### Authentication and Permissions
- **Backend:** `test_security.py` and `test_worker_authorization.py` exist. They test the token verification and extraction of claims, mocking the database calls where needed.
- **Frontend (Customer):** `auth.service.test.ts` covers validation logic (e.g., Indian mobile number verification, profile saving restrictions).
- **Status:** Basic API authorization dependencies are tested via unit tests. Full DB-level RLS coverage via tests is not present in the backend repo directly.

### Customer Booking
- **Backend:** Tests like `test_bookings_authorization.py` and `test_booking_otp_rate_limit.py` exist. However, comprehensive API contract tests validating the exact JSON schemas for `/instant` and `/scheduled` creation are heavily mocked and do not test deep Postgres transaction integration.
- **Status:** Limited. E2E and DB integration tests are missing.

### Worker Operations
- **Backend:** `test_worker_presence_service.py` and `test_worker_schedule_service.py` exist.
- **Frontend (Worker):** Earnings calculations and push token validation have regression tests.
- **Status:** Booking offer acceptance (the most critical concurrency point) lacks explicit API/DB concurrency tests in the standard pytest suite.

### Payments
- **Backend:** `test_payments_service.py`, `test_razorpay_client.py`, and `test_atomic_idempotency.py` provide a strong baseline for payment initialization and webhook idempotency logic within Python.
- **Status:** Good unit/mock coverage. Real sandbox provider tests are absent.

### Notifications
- **Backend:** `test_worker_notification_push_payload.py` tests the structure of push payloads.
- **Status:** Minimal. Edge function execution is not tested in the main repo.

---

## 3. Test Limitations & Requirements

- **No Live DB Sandbox:** The current test suite does not automatically spin up a test container (e.g., via `testcontainers`) or connect to a local Supabase emulator to run actual SQL migrations and test Postgres functions (like `cancel_customer_booking`) transactionally.
- **Mocking Overuse:** Many tests mock the repository layer entirely (`BookingsRepository`), meaning they prove the Python logic is correct given a certain DB response, but do *not* prove the DB will actually return that response or maintain data integrity.
- **Missing E2E:** There are no Cypress/Playwright tests running against a full stack to prove the mobile app can successfully complete a booking end-to-end.

---

## 4. Commands Run and Results

- `cd backend && pip install -e '.[dev]'` (Success)
- `cd backend && export DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/postgres" SUPABASE_URL="http://localhost:8000" SUPABASE_KEY="dummy_key" REDIS_URL="redis://localhost:6379" ENVIRONMENT="test" && python -m pytest` -> **84 passed, 1 warning.**
- `cd customer-app && npm i && npm test -- --runInBand` -> **30 passed.**
- `cd worker-app && npm i && npm test -- --runInBand` -> **9 passed.**

---

## 5. Pre-existing Failures & Known Gaps

- **No Baseline Test Failures:** The existing tests in all three projects pass cleanly when dependencies are correctly installed.
- **Gap - Database Integration:** The largest gap is the lack of test coverage for the complex SQL functions residing in Postgres (like `reschedule_customer_booking`). Because these are being migrated *away* from or wrapped by FastAPI, we need tests that execute these against a real Postgres instance before changing them.
- **Gap - Worker App Contract Tests:** Worker apps rely heavily on `supabase.rpc`. There are no backend tests defining exactly what those RPC contracts return to guarantee backward compatibility when FastAPI endpoints replace them.

## 6. Migration Blocking Constraints

- **Phase 4 (Core Booking Lifecycle)** and **Phase 5 (Payments Cleanup)** are **BLOCKED** until a reliable Database Integration Test environment (using a local Postgres/Supabase emulator) is established and integrated into the CI/CD pipeline. We cannot safely migrate transactional logic without it.
