
BEGIN;

DROP POLICY IF EXISTS "profiles_select_authenticated"
  ON public.profiles;

DROP POLICY IF EXISTS "profiles_select_own_or_admin"
  ON public.profiles;

CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (SELECT public.is_admin())
  );

DROP POLICY IF EXISTS "worker_profiles_select_authenticated"
  ON public.worker_profiles;

DROP POLICY IF EXISTS "worker_profiles_select_own_or_admin"
  ON public.worker_profiles;

CREATE POLICY "worker_profiles_select_own_or_admin"
  ON public.worker_profiles
  FOR SELECT
  TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR (SELECT public.is_admin())
  );

REVOKE ALL PRIVILEGES
  ON TABLE public.worker_profiles
  FROM PUBLIC, anon;

COMMIT;
