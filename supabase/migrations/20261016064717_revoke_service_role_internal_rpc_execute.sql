BEGIN;

-- The audit writer is called only by SECURITY DEFINER database functions owned by
-- postgres. The legacy refund-result RPC has no current caller in the app or DB.
REVOKE EXECUTE ON FUNCTION public.write_admin_audit(text, text, uuid, jsonb, jsonb, jsonb)
  FROM service_role;
REVOKE EXECUTE ON FUNCTION public.set_refund_request_result(uuid, text, text)
  FROM service_role;

COMMIT;
