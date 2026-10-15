BEGIN;

-- Preserve public read access to PostGIS reference-system metadata, but prevent
-- client roles from modifying the extension-managed table.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.spatial_ref_sys
  FROM anon, authenticated;

-- Prevent API users from calling the dynamic-schema/table SECURITY DEFINER RPCs.
REVOKE EXECUTE
  ON FUNCTION public.st_estimatedextent(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE
  ON FUNCTION public.st_estimatedextent(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE
  ON FUNCTION public.st_estimatedextent(text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;

COMMIT;
