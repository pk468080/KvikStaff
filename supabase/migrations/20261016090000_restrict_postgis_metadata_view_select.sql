BEGIN;

-- Keep PostGIS installed in public for compatibility with existing KvikStaff
-- SQL that explicitly references public.geometry/public.geography/public.ST_*.
-- spatial_ref_sys is different from app data: PostGIS uses it to resolve SRIDs
-- for ST_Transform. Restore its read-only PUBLIC grant in case an earlier
-- hardening migration revoked it; this table contains coordinate definitions,
-- not customer or worker data.
-- The catalog views are not referenced by KvikStaff application code and do not
-- need to be queryable directly through the public Data API.
-- These views are owned by supabase_admin in hosted production. If the migration
-- runner cannot change their ACLs, verification fails rather than recording a
-- migration that did not harden access; Support/the extension owner must apply
-- the same revokes if the hosted postgres role lacks ownership authority.
GRANT SELECT ON TABLE public.spatial_ref_sys TO PUBLIC;

REVOKE SELECT ON TABLE public.geometry_columns
  FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.geography_columns
  FROM PUBLIC, anon, authenticated;

DO $verify_postgis_metadata_grants$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'postgis'
      AND n.nspname = 'public'
  ) THEN
    RAISE EXCEPTION 'F04: expected PostGIS to remain installed in public for compatibility';
  END IF;

  IF has_table_privilege('anon', 'public.geometry_columns', 'SELECT')
     OR has_table_privilege('authenticated', 'public.geometry_columns', 'SELECT')
     OR has_table_privilege('anon', 'public.geography_columns', 'SELECT')
     OR has_table_privilege('authenticated', 'public.geography_columns', 'SELECT') THEN
    RAISE EXCEPTION 'F04: anon/authenticated can still SELECT PostGIS catalog views; apply grants as extension owner';
  END IF;

  IF NOT has_table_privilege('anon', 'public.spatial_ref_sys', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.spatial_ref_sys', 'SELECT') THEN
    RAISE EXCEPTION 'F04: spatial_ref_sys SELECT must remain available for verified PostGIS ST_Transform compatibility';
  END IF;
END
$verify_postgis_metadata_grants$;

COMMIT;
