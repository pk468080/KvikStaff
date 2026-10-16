BEGIN;

-- No current application or database-function caller exists for this legacy RPC.
REVOKE EXECUTE ON FUNCTION public.set_refund_request_result(uuid, text, text)
  FROM PUBLIC, anon, authenticated;

COMMIT;
