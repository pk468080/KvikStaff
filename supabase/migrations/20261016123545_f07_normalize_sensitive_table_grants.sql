BEGIN;

-- API roles need only the row-scoped DML permitted by RLS policies.
REVOKE ALL PRIVILEGES
  ON TABLE public.worker_profiles
  FROM PUBLIC, anon, authenticated;

GRANT SELECT
  ON TABLE public.worker_profiles
  TO authenticated;

REVOKE ALL PRIVILEGES
  ON TABLE public.messages
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.messages
  TO authenticated;

REVOKE ALL PRIVILEGES
  ON TABLE public.conversations
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE
  ON TABLE public.conversations
  TO authenticated;

COMMIT;
