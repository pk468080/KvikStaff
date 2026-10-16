BEGIN;

-- Idempotent ledger-alignment reapplication of the legacy RPC permission revoke.
REVOKE EXECUTE ON FUNCTION public.set_refund_request_result(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

COMMIT;
