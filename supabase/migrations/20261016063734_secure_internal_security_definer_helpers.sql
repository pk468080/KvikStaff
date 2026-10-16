BEGIN;

-- Audit records must only be written by trusted database functions; do not expose
-- this helper as a direct client RPC.
REVOKE EXECUTE ON FUNCTION public.write_admin_audit(text, text, uuid, jsonb, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;

-- All relations and non-built-in functions in this body are schema-qualified.
ALTER FUNCTION public.write_admin_audit(text, text, uuid, jsonb, jsonb, jsonb)
  SET search_path = '';

COMMIT;
