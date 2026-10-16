BEGIN;

-- Worker profile creation and operational changes are performed by trusted
-- server-side workflows. Clients may read their own worker profile but must
-- not directly insert, update, or delete it.
REVOKE INSERT, UPDATE, DELETE
  ON TABLE public.worker_profiles
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "workers can create own worker profile"
  ON public.worker_profiles;

DROP POLICY IF EXISTS "worker_profiles_update_authenticated"
  ON public.worker_profiles;

-- Anonymous access and direct message deletion are unnecessary.
REVOKE ALL PRIVILEGES
  ON TABLE public.messages
  FROM PUBLIC, anon;

REVOKE DELETE
  ON TABLE public.messages
  FROM authenticated;

COMMIT;
