-- KvikStaff PostGIS grant hardening
--
-- IMPORTANT:
-- Live inspection showed these objects and default ACLs are owned/granted by
-- supabase_admin, while the connected SQL session runs as postgres and is not
-- a member of supabase_admin. The current connector cannot apply this script:
-- it must be executed by a database administrator with authority to alter
-- supabase_admin's default privileges and revoke its grants (or by Supabase
-- Support if the managed role is intentionally inaccessible).
--
-- This script deliberately verifies the result and raises an exception if
-- any anonymous/authenticated execution or write privilege remains.

BEGIN;

-- Do not give API roles broad privileges on future objects created by the
-- grantor that was responsible for the current broad ACLs.
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE USAGE, SELECT, UPDATE ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- spatial_ref_sys is extension metadata. Preserve the existing PUBLIC SELECT
-- grant but remove direct write and other direct grants to API roles.
REVOKE ALL PRIVILEGES ON TABLE public.spatial_ref_sys FROM anon, authenticated;

-- This dynamic-schema/table SECURITY DEFINER RPC should not be available via
-- the exposed PostgREST API to anonymous or ordinary authenticated clients.
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.st_estimatedextent(text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;

DO $verify$
BEGIN
  IF has_table_privilege('anon', 'public.spatial_ref_sys', 'INSERT')
     OR has_table_privilege('anon', 'public.spatial_ref_sys', 'UPDATE')
     OR has_table_privilege('anon', 'public.spatial_ref_sys', 'DELETE')
     OR has_table_privilege('anon', 'public.spatial_ref_sys', 'TRUNCATE')
     OR has_table_privilege('authenticated', 'public.spatial_ref_sys', 'INSERT')
     OR has_table_privilege('authenticated', 'public.spatial_ref_sys', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.spatial_ref_sys', 'DELETE')
     OR has_table_privilege('authenticated', 'public.spatial_ref_sys', 'TRUNCATE') THEN
    RAISE EXCEPTION 'spatial_ref_sys client write privileges remain after hardening';
  END IF;

  IF has_function_privilege('anon', 'public.st_estimatedextent(text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.st_estimatedextent(text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.st_estimatedextent(text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.st_estimatedextent(text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.st_estimatedextent(text,text,text,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.st_estimatedextent(text,text,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'st_estimatedextent client EXECUTE privileges remain after hardening';
  END IF;
END;
$verify$;

COMMIT;
