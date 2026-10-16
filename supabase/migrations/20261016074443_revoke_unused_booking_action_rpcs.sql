BEGIN;

-- Both legacy RPCs have no current application or database-function caller.
-- customer_booking_action duplicates the newer cancellation workflow, while
-- reconcile_paid_booking can transition payment state and trigger worker dispatch.
REVOKE EXECUTE ON FUNCTION public.customer_booking_action(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reconcile_paid_booking(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
