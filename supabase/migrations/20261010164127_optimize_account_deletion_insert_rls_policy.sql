
BEGIN;

DROP POLICY IF EXISTS account_deletion_requests_insert_own
  ON public.account_deletion_requests;

CREATE POLICY account_deletion_requests_insert_own
ON public.account_deletion_requests
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND status = 'pending'
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'customer'::public.user_role
      AND p.is_active = true
  )
);

COMMIT;
