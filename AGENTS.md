# KvikStaff Engineering Rules

## Project

KvikStaff is a service marketplace platform with:

- Customer mobile application
- Worker mobile application
- Admin dashboard
- FastAPI backend
- Supabase backend infrastructure

The system must be treated as production software.

---

## Architecture

### Supabase owns infrastructure/data capabilities

Use Supabase for:

- PostgreSQL
- Authentication
- Row Level Security
- Storage
- Realtime
- Database constraints
- Atomic database functions
- Selected Cron/Queue workloads
- Small database-oriented operations

### FastAPI owns application/business logic

Use FastAPI for:

- Business rules
- Authorization
- Booking lifecycle
- Booking state transitions
- Pricing orchestration
- Worker assignment
- Scheduling rules
- Payments
- Refund orchestration
- Worker payouts
- Admin operations
- External API integrations
- Idempotency
- Request correlation
- Application-level validation

### Frontends own presentation

Customer app, worker app and admin dashboard should own:

- UI
- UX
- navigation
- local state
- form validation
- API clients
- realtime subscriptions
- presentation logic

Do not move authoritative business rules into frontend applications.

---

## Security

Never:

- expose Supabase service-role keys
- expose provider secret keys
- trust frontend role claims for authorization
- use user-editable metadata for authorization
- bypass Row Level Security to solve an application bug
- add SECURITY DEFINER functions without a clear security requirement
- expose administrative RPCs unnecessarily
- allow wildcard CORS in production
- log secrets, tokens, payment credentials or OTP values

Always:

- authenticate requests
- authorize using server-side account state
- validate ownership
- enforce RLS
- use least privilege
- use idempotency for important mutations
- protect payment and payout operations
- verify webhook authenticity
- make important operations retry-safe

---

## Booking Rules

Bookings are stateful domain objects.

Do not directly modify booking status from frontend code.

All important state transitions must be validated.

Examples:

PENDING
CONFIRMED
ASSIGNED
ON_THE_WAY
ARRIVED
IN_PROGRESS
COMPLETED
CANCELLED
RESCHEDULED

Invalid transitions must be rejected.

Use database transactions and constraints where atomicity is required.

---

## Payments

Payment provider secrets must remain server-side.

Payment operations must be:

- idempotent
- verifiable
- retry-safe
- webhook-aware
- reconciliation-friendly

Never trust the amount supplied by the frontend as the authoritative amount.

The server must determine the payable amount.

---

## OTP

The customer OTP implementation currently contains a temporary development OTP.

DO NOT change or remove the temporary OTP implementation unless explicitly requested.

The temporary OTP must be replaced with production OTP infrastructure during the launch hardening phase.

---

## Database

Do not rewrite the database schema unnecessarily.

Before changing:

- tables
- columns
- indexes
- RLS policies
- functions
- triggers

inspect existing dependencies and callers.

Prefer backwards-compatible migrations.

Do not remove apparently unused database objects without verifying actual usage.

---

## Edge Functions

Use Edge Functions primarily for:

- webhooks
- external integrations
- short-lived server operations
- notification dispatch
- scheduled/queue-triggered work

Do not duplicate business logic between FastAPI and Edge Functions.

---

## Testing

Every business-critical change should include tests.

Important areas:

- bookings
- booking state transitions
- payments
- refunds
- payouts
- worker assignment
- scheduling
- authentication
- authorization
- idempotency
- webhooks

Do not declare a task complete merely because the application starts.

Run the appropriate test suite.

---

## Code Changes

Before changing code:

1. Inspect existing implementation.
2. Understand dependencies.
3. Make the smallest safe change.
4. Avoid unrelated refactoring.
5. Add tests.
6. Run tests.
7. Review the final diff.

Do not rewrite large portions of the repository without a specific reason.

---

## Production Quality

Prioritize:

1. Security
2. Data integrity
3. Reliability
4. Correctness
5. Observability
6. Performance
7. Maintainability
8. UI polish

Do not sacrifice data integrity for convenience.

---

## KvikStaff Development Workflow

Preferred workflow:

Issue/requirement
    ↓
Architecture plan
    ↓
Feature branch
    ↓
Implementation
    ↓
Tests
    ↓
Review
    ↓
Pull Request
    ↓
Merge
    ↓
Staging
    ↓
Production

Never make uncontrolled broad changes directly to production.
