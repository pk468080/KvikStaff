
REVOKE EXECUTE
ON FUNCTION public.st_estimatedextent(text, text)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.st_estimatedextent(text, text, text)
FROM PUBLIC;

REVOKE EXECUTE
ON FUNCTION public.st_estimatedextent(text, text, text, boolean)
FROM PUBLIC;

DROP INDEX IF EXISTS public.account_deletion_requests_one_pending_per_user_idx;

ALTER POLICY worker_locations_select_scoped
ON public.worker_locations
USING (
  (select public.is_admin())
  OR (worker_id = (select auth.uid()))
  OR (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id = worker_locations.booking_id
        AND b.customer_id = (select auth.uid())
        AND b.worker_id = worker_locations.worker_id
        AND b.status = ANY (
          ARRAY[
            'assigned'::public.booking_status,
            'on_the_way'::public.booking_status,
            'arrived'::public.booking_status,
            'in_progress'::public.booking_status
          ]
        )
    )
  )
);
;
