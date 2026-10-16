\set ON_ERROR_STOP on

BEGIN;

-- The system reference table remains readable because PostGIS uses its SRID
-- records to implement ST_Transform. The catalog views are not needed by the
-- app's geospatial queries and should not be exposed directly through the API.
SET LOCAL ROLE anon;
DO $anon_metadata_checks$
DECLARE
  v_denied boolean;
  v_rows bigint;
BEGIN
  IF NOT has_table_privilege('anon', 'public.spatial_ref_sys', 'SELECT') THEN
    RAISE EXCEPTION 'F04_FAIL: anon lost spatial_ref_sys SELECT required for ST_Transform';
  END IF;

  v_denied := false;
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.geometry_columns' INTO v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'F04_FAIL: anon can SELECT public.geometry_columns'; END IF;

  v_denied := false;
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.geography_columns' INTO v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'F04_FAIL: anon can SELECT public.geography_columns'; END IF;

  IF ST_SRID(ST_SetSRID(ST_MakePoint(-73.9857,40.7484),4326)) <> 4326 THEN
    RAISE EXCEPTION 'F04_FAIL: anon PostGIS point/SRID operation returned an unexpected value';
  END IF;
  IF NOT ST_DWithin(
    ST_SetSRID(ST_MakePoint(-73.9857,40.7484),4326)::geography,
    ST_SetSRID(ST_MakePoint(-73.9860,40.7485),4326)::geography,
    100
  ) THEN
    RAISE EXCEPTION 'F04_FAIL: anon geography ST_DWithin operation failed';
  END IF;
  IF ST_Distance(
    ST_SetSRID(ST_MakePoint(-73.9857,40.7484),4326)::geography,
    ST_SetSRID(ST_MakePoint(-73.9860,40.7485),4326)::geography
  ) >= 100 THEN
    RAISE EXCEPTION 'F04_FAIL: anon geography ST_Distance result was outside expected range';
  END IF;
  IF ST_Transform(ST_SetSRID(ST_MakePoint(-73.9857,40.7484),4326),3857) IS NULL THEN
    RAISE EXCEPTION 'F04_FAIL: anon ST_Transform returned NULL';
  END IF;
END
$anon_metadata_checks$;

RESET ROLE;
SET LOCAL ROLE authenticated;
DO $authenticated_metadata_checks$
DECLARE
  v_denied boolean;
  v_rows bigint;
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.spatial_ref_sys', 'SELECT') THEN
    RAISE EXCEPTION 'F04_FAIL: authenticated lost spatial_ref_sys SELECT required for ST_Transform';
  END IF;

  v_denied := false;
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.geometry_columns' INTO v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'F04_FAIL: authenticated can SELECT public.geometry_columns'; END IF;

  v_denied := false;
  BEGIN
    EXECUTE 'SELECT count(*) FROM public.geography_columns' INTO v_rows;
  EXCEPTION WHEN insufficient_privilege THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'F04_FAIL: authenticated can SELECT public.geography_columns'; END IF;

  IF ST_SRID(ST_SetSRID(ST_MakePoint(-73.9857,40.7484),4326)) <> 4326 THEN
    RAISE EXCEPTION 'F04_FAIL: authenticated PostGIS point/SRID operation returned an unexpected value';
  END IF;
  IF NOT ST_DWithin(
    ST_SetSRID(ST_MakePoint(-73.9857,40.7484),4326)::geography,
    ST_SetSRID(ST_MakePoint(-73.9860,40.7485),4326)::geography,
    100
  ) THEN
    RAISE EXCEPTION 'F04_FAIL: authenticated geography ST_DWithin operation failed';
  END IF;
  IF ST_Distance(
    ST_SetSRID(ST_MakePoint(-73.9857,40.7484),4326)::geography,
    ST_SetSRID(ST_MakePoint(-73.9860,40.7485),4326)::geography
  ) >= 100 THEN
    RAISE EXCEPTION 'F04_FAIL: authenticated geography ST_Distance result was outside expected range';
  END IF;
  IF ST_Transform(ST_SetSRID(ST_MakePoint(-73.9857,40.7484),4326),3857) IS NULL THEN
    RAISE EXCEPTION 'F04_FAIL: authenticated ST_Transform returned NULL';
  END IF;
END
$authenticated_metadata_checks$;

ROLLBACK;
