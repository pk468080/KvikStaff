BEGIN;

-- Client roles need row-scoped document operations, not trigger creation.
REVOKE TRIGGER
  ON TABLE public.worker_documents
  FROM PUBLIC, anon, authenticated;

COMMIT;
