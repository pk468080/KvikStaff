# SECURITY DEFINER RPC access policy

**Snapshot date:** 2026-10-16
**Scope:** `public` schema functions with `prosecdef = true` in the live KvikStaff Supabase project.

## Reviewed execution classes

The live catalog snapshot contains **209** public `SECURITY DEFINER` functions. CI freezes this snapshot so changes must be reviewed and the inventory deliberately updated.

| Execution class | Current signatures | Access policy |
|---|---:|---|
| Authenticated-callable | 110 | Explicit allowlist in `supabase/tests/test_security_definer_active_accounts.sql`. Each function must enforce its intended authorization internally. Admin functions require the admin guard; customer and worker workflows require active role identity and resource ownership/state checks. |
| Anonymous-callable | 3 | Only the three PostGIS `st_estimatedextent` overloads. They remain a tracked F-01 exception pending Supabase Support guidance. No other public `SECURITY DEFINER` function may be executable by `anon`. |
| Server-role-only | 93 | Exact signature list in the CI test's `v_server_only` array. These are available to `service_role`, but not `anon` or `authenticated`. Treat the service-role key as server-only; never ship it in a client app. |
| Owner/internal-only | 6 | `complete_test_payment(uuid)`, `customer_booking_action(uuid,text)`, `reconcile_paid_booking(uuid)`, `set_refund_request_result(uuid,text,text)`, `update_worker_booking_status(uuid,booking_status)`, and `write_admin_audit(text,text,uuid,jsonb,jsonb,jsonb)`. These remain executable only by the database owner, not by API roles. |

The classes are disjoint except that the three anonymous PostGIS exceptions are also part of the authenticated-callable count. Accordingly, the live effective-grant counts are 209 total, 110 `authenticated`, 3 `anon`, and 203 `service_role`.

## Authorization checks represented in CI

- **Client and anonymous grants:** CI compares the complete current function set against the authenticated allowlist, server-only list, and owner/internal-only list. It verifies every signature exists and that `anon`, `authenticated`, and `service_role` execute privileges match the intended class. A new/removed function or privilege drift fails the job until reviewed.
- **Admin boundaries:** All 44 `admin_*` signatures must contain an `is_admin` guard before their first data mutation. CI behaviorally checks each unambiguous admin entry point plus `prepare_customer_account_deletion`, `complete_customer_account_deletion`, and `get_eligible_workers` against active customer, active worker, inactive customer, and inactive worker identities. Overloads with overlapping default arguments are source-checked because invoking them generically with all-`NULL` arguments can be ambiguous before the function body runs.
- **Inactive accounts:** Tests check sensitive worker booking context/offer, payout-account, incident, summary, and customer pricing/availability/invoice paths. Test fixtures are created in a transaction that is rolled back.
- **Search path:** The audited application-owned functions have a fixed function-level `search_path`; the three extension-owned PostGIS C functions have no function-level setting and remain the known F-01 exception. All application table references examined in the `search_path=public` group are schema-qualified, and API roles have no `CREATE` privilege on `public`.

## Maintenance rule

If a function is added, removed, overloaded, or has a grant changed, review its authorization logic, intended caller class, `search_path`, ownership and state/input constraints. Then update the matching inventory list and the CI regression tests in the same pull request. Do not broaden an allowlist merely to make CI green.
