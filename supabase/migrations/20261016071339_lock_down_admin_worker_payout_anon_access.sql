BEGIN;

-- The admin-action Edge Function forwards the signed-in admin JWT, so retain
-- authenticated execution. Anonymous callers must never reach this admin RPC.
REVOKE EXECUTE
  ON FUNCTION public.admin_create_worker_payout(uuid, uuid, numeric, text, text)
  FROM PUBLIC, anon;

-- Preserve the existing signed-in admin workflow and trusted service-role path.
GRANT EXECUTE
  ON FUNCTION public.admin_create_worker_payout(uuid, uuid, numeric, text, text)
  TO authenticated, service_role;

COMMIT;
