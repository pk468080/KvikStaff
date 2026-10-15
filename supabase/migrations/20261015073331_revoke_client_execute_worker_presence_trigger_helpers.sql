
BEGIN;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.reconcile_worker_assignment_presence_from_booking()
  FROM PUBLIC, anon, authenticated;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.reconcile_worker_assignment_presence_from_occurrence()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.reconcile_worker_assignment_presence_from_booking()
  TO service_role;

GRANT EXECUTE
  ON FUNCTION public.reconcile_worker_assignment_presence_from_occurrence()
  TO service_role;

COMMIT;
