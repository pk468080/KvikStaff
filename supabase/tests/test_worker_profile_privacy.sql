
BEGIN;

DO $test$
DECLARE
  v_profiles_policy text;
  v_worker_profiles_policy text;
BEGIN
  SELECT qual
  INTO v_profiles_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'profiles'
    AND policyname = 'profiles_select_own_or_admin'
    AND cmd = 'SELECT';

  IF v_profiles_policy IS NULL
     OR v_profiles_policy NOT ILIKE '%auth.uid%'
     OR v_profiles_policy NOT ILIKE '%is_admin%'
     OR v_profiles_policy ILIKE '%role%'
  THEN
    RAISE EXCEPTION
      'profiles SELECT policy is missing or broader than owner/admin access';
  END IF;

  SELECT qual
  INTO v_worker_profiles_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'worker_profiles'
    AND policyname = 'worker_profiles_select_own_or_admin'
    AND cmd = 'SELECT';

  IF v_worker_profiles_policy IS NULL
     OR v_worker_profiles_policy NOT ILIKE '%auth.uid%'
     OR v_worker_profiles_policy NOT ILIKE '%is_admin%'
     OR v_worker_profiles_policy ILIKE '%worker_status%'
     OR v_worker_profiles_policy ILIKE '%is_verified%'
  THEN
    RAISE EXCEPTION
      'worker_profiles SELECT policy is missing or broader than owner/admin access';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (tablename = 'profiles'
          AND policyname = 'profiles_select_authenticated')
        OR
        (tablename = 'worker_profiles'
          AND policyname = 'worker_profiles_select_authenticated')
      )
  ) THEN
    RAISE EXCEPTION
      'A superseded broad profile SELECT policy still exists';
  END IF;

  IF has_table_privilege(
       'anon',
       'public.worker_profiles',
       'SELECT'
     )
     OR has_table_privilege(
       'anon',
       'public.worker_profiles',
       'UPDATE'
     )
  THEN
    RAISE EXCEPTION
      'anon still has direct access to worker_profiles';
  END IF;
END;
$test$;

ROLLBACK;
