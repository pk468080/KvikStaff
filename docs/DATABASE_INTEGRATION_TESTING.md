# Database Integration Testing

## Overview
This document outlines the foundation for isolated PostgreSQL integration tests. These tests execute real database functions (e.g., `cancel_customer_booking`, `worker_respond_to_offer`) against a genuine PostgreSQL instance running the KvikStaff schema, constraints, and RLS policies.

This environment must be used to verify safety and transaction integrity *before* migrating core application logic (like worker acceptance or payment processing) into FastAPI.

## Required Local Tooling
- [Supabase CLI](https://supabase.com/docs/guides/cli) is required to establish the identical test environment used in production.
- Python 3.12+ (for `pytest` and `asyncpg`).

## Setup and Test Commands
To run the integration tests locally against a pristine database:

```bash
# 1. Start the isolated test database (applies all migrations automatically)
supabase db start

# 2. Run the tests
cd backend
export ENVIRONMENT="test"
export DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:54322/postgres"
python -m pytest tests/integration/ -v

# 3. Clean up the isolated database
supabase db stop
```

*Note: The `DATABASE_URL` port is 54322, which is the default for local Supabase stacks. It does not contain any production secrets.*

## Test Database Isolation
- **CI Pipeline:** The `.github/workflows/db-integration-tests.yml` spins up a fresh `supabase db` container on a disposable GitHub runner.
- **Data Isolation:** `conftest.py` checks that `ENVIRONMENT == "test"` before attempting connection.
- **Transaction Rollbacks:** The `db_session` fixture uses a SQLAlchemy `expire_on_commit=False` session that explicitly calls `await session.rollback()` after every test yield, ensuring no state leaks between tests.

## Migrations and Database Functions Tested
- `cancel_customer_booking`
- `worker_respond_to_offer` (Worker acceptance and atomic locking)

## What these tests prove
- They prove that direct invocation of SQL functions via FastAPI enforces the correct Row-Level Security and `SECURITY DEFINER` logic when `request.jwt.claims` is set.
- They prove that invalid inputs or missing records trigger the expected Postgres exceptions rather than failing silently.

## What these tests do NOT prove
- They do not yet prove end-to-end data integrity because they currently only test the failure paths. We cannot yet test successful paths (creating a valid booking, offering it, and having a worker accept) without extensive factory setups for Users, Addresses, Profiles, Services, and Bookings.
- They do not test Razorpay webhooks or external integrations.

## Known Blockers & Limitations
- **Sandbox Limitation:** The `supabase db start` command requires a functional Docker daemon capable of overlayfs mounting. This fails in certain restricted nested-docker or containerized environments (like some AI coding agents or restricted codespaces). If encountering `Error response from daemon: failed to mount ... invalid argument`, the tests must be run on a standard local machine or standard CI runner.
- **Data Factories:** To test successful atomic concurrency (two workers accepting the same valid offer simultaneously), robust database factories must be written in Python to insert valid parent records (Profiles -> Services -> Addresses -> Bookings -> Offers) before executing `worker_respond_to_offer`.

## CI Integration
A dedicated GitHub Actions workflow (`db-integration-tests.yml`) has been added. It:
1. Runs `supabase db start`.
2. Installs Python dependencies.
3. Executes `pytest tests/integration/`.
4. Fails if migrations are invalid or tests fail.
