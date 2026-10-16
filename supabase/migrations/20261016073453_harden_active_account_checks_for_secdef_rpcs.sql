BEGIN;

-- SECURITY DEFINER functions must not continue to serve or mutate data for
-- disabled workers/customers merely because their access token is still valid.
-- Keep these checks private: callers reach them only through trusted database
-- functions that run as their owner.
CREATE OR REPLACE FUNCTION private.assert_active_worker()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.role = 'worker'::public.user_role
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Active worker account required' USING ERRCODE = '42501';
  END IF;

  RETURN v_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.assert_active_customer()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user_id
      AND p.role = 'customer'::public.user_role
      AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Active customer account required' USING ERRCODE = '42501';
  END IF;

  RETURN v_user_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.assert_active_profile()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_user_id AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Active account required' USING ERRCODE = '42501';
  END IF;

  RETURN v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION private.assert_active_worker() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.assert_active_customer() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.assert_active_profile() FROM PUBLIC, anon, authenticated, service_role;

-- Insert the active-worker check as the first statement in selected PL/pgSQL
-- RPCs. Re-running this migration is safe because already-guarded functions
-- are skipped. Replace the function body while preserving its signature,
-- return type, owner, grants, and other function attributes.
DO $f03_rewrite_worker_plpgsql$
DECLARE
  v_target record;
  v_definition text;
  v_new_source text;
  v_marker text;
BEGIN
  FOR v_target IN
    SELECT p.oid, p.prosrc, p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
      AND p.proname = ANY (ARRAY[
        'worker_disable_payout_account',
        'worker_get_booking_context',
        'worker_get_performance_summary',
        'worker_get_verification_summary',
        'worker_get_booking_offer_details',
        'worker_report_booking_incident',
        'worker_set_default_payout_account',
        'worker_withdraw_booking_change_request'
      ])
    ORDER BY p.proname
  LOOP
    IF v_target.prosrc ILIKE '%private.assert_active_worker%' THEN
      CONTINUE;
    END IF;

    v_new_source := regexp_replace(
      v_target.prosrc,
      E'\\n[[:blank:]]*begin[[:blank:]]*\\n',
      chr(10) || 'begin' || chr(10) || '  PERFORM private.assert_active_worker();' || chr(10),
      1, 1, 'i'
    );

    IF v_new_source = v_target.prosrc THEN
      RAISE EXCEPTION 'F03: could not insert active-worker guard in %', v_target.signature;
    END IF;

    SELECT pg_get_functiondef(v_target.oid) INTO v_definition;
    v_marker := '$function$' || v_target.prosrc || '$function$';
    IF position(v_marker IN v_definition) = 0 THEN
      RAISE EXCEPTION 'F03: could not safely rebuild definition for %', v_target.signature;
    END IF;

    EXECUTE replace(
      v_definition,
      v_marker,
      '$function$' || v_new_source || '$function$'
    );
  END LOOP;
END;
$f03_rewrite_worker_plpgsql$;

-- SQL-language worker summaries/lists are identity-scoped today. Calling the
-- private helper in place of auth.uid() additionally enforces active-worker
-- status. The aggregate summaries always evaluate this check; the list
-- functions return only rows for that authenticated worker.
DO $f03_rewrite_worker_sql$
DECLARE
  v_target record;
  v_definition text;
  v_new_source text;
  v_marker text;
BEGIN
  FOR v_target IN
    SELECT p.oid, p.prosrc, p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND l.lanname = 'sql'
      AND p.proname = ANY (ARRAY[
        'worker_get_available_earnings',
        'worker_get_incident_summary',
        'worker_list_booking_change_requests',
        'worker_list_booking_incidents',
        'worker_list_payout_accounts',
        'worker_list_payouts',
        'worker_list_reviews'
      ])
    ORDER BY p.proname
  LOOP
    IF v_target.prosrc ILIKE '%private.assert_active_worker%' THEN
      CONTINUE;
    END IF;

    v_new_source := replace(v_target.prosrc, 'auth.uid()', 'private.assert_active_worker()');
    IF v_new_source = v_target.prosrc THEN
      RAISE EXCEPTION 'F03: could not insert active-worker guard in SQL function %', v_target.signature;
    END IF;

    SELECT pg_get_functiondef(v_target.oid) INTO v_definition;
    v_marker := '$function$' || v_target.prosrc || '$function$';
    IF position(v_marker IN v_definition) = 0 THEN
      RAISE EXCEPTION 'F03: could not safely rebuild definition for %', v_target.signature;
    END IF;

    EXECUTE replace(
      v_definition,
      v_marker,
      '$function$' || v_new_source || '$function$'
    );
  END LOOP;
END;
$f03_rewrite_worker_sql$;

-- Customer pricing/availability helpers should not remain usable after a
-- customer account is disabled. Mutations still enforce their own ownership
-- and transition rules in their function bodies.
DO $f03_rewrite_customer_plpgsql$
DECLARE
  v_target record;
  v_definition text;
  v_new_source text;
  v_marker text;
BEGIN
  FOR v_target IN
    SELECT p.oid, p.prosrc, p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND l.lanname = 'plpgsql'
      AND p.proname = ANY (ARRAY[
        'calculate_customer_booking_schedule',
        'calculate_service_booking_price',
        'cancel_service_availability_request',
        'check_customer_instant_worker_availability',
        'check_service_availability',
        'get_customer_instant_availability_slots',
        'get_customer_near_term_scheduled_slots',
        'get_customer_scheduled_availability_slots',
        'get_customer_scheduled_slots'
      ])
    ORDER BY p.proname
  LOOP
    IF v_target.prosrc ILIKE '%private.assert_active_customer%' THEN
      CONTINUE;
    END IF;

    v_new_source := regexp_replace(
      v_target.prosrc,
      E'\\n[[:blank:]]*begin[[:blank:]]*\\n',
      chr(10) || 'begin' || chr(10) || '  PERFORM private.assert_active_customer();' || chr(10),
      1, 1, 'i'
    );

    IF v_new_source = v_target.prosrc THEN
      RAISE EXCEPTION 'F03: could not insert active-customer guard in %', v_target.signature;
    END IF;

    SELECT pg_get_functiondef(v_target.oid) INTO v_definition;
    v_marker := '$function$' || v_target.prosrc || '$function$';
    IF position(v_marker IN v_definition) = 0 THEN
      RAISE EXCEPTION 'F03: could not safely rebuild definition for %', v_target.signature;
    END IF;

    EXECUTE replace(
      v_definition,
      v_marker,
      '$function$' || v_new_source || '$function$'
    );
  END LOOP;
END;
$f03_rewrite_customer_plpgsql$;

-- Notification mutation and communication-access checks are identity-scoped;
-- also require the caller's profile to be active.
DO $f03_rewrite_profile_helpers$
DECLARE
  v_target record;
  v_definition text;
  v_new_source text;
  v_marker text;
BEGIN
  SELECT p.oid, p.prosrc, p.oid::regprocedure::text AS signature
  INTO v_target
  FROM pg_proc p
  WHERE p.oid = 'public.mark_notification_read(uuid)'::regprocedure;

  IF v_target.prosrc NOT ILIKE '%private.assert_active_profile%' THEN
    v_new_source := regexp_replace(
      v_target.prosrc,
      E'\\n[[:blank:]]*begin[[:blank:]]*\\n',
      chr(10) || 'begin' || chr(10) || '  PERFORM private.assert_active_profile();' || chr(10),
      1, 1, 'i'
    );
    IF v_new_source = v_target.prosrc THEN
      RAISE EXCEPTION 'F03: could not insert active-profile guard in %', v_target.signature;
    END IF;

    SELECT pg_get_functiondef(v_target.oid) INTO v_definition;
    v_marker := '$function$' || v_target.prosrc || '$function$';
    IF position(v_marker IN v_definition) = 0 THEN
      RAISE EXCEPTION 'F03: could not safely rebuild definition for %', v_target.signature;
    END IF;
    EXECUTE replace(v_definition, v_marker, '$function$' || v_new_source || '$function$');
  END IF;

  SELECT p.oid, p.prosrc, p.oid::regprocedure::text AS signature
  INTO v_target
  FROM pg_proc p
  WHERE p.oid = 'public.can_access_booking_communication(uuid,uuid)'::regprocedure;

  IF v_target.prosrc NOT ILIKE '%private.assert_active_profile%' THEN
    v_new_source := replace(
      v_target.prosrc,
      'where b.id = p_booking_id',
      'where b.id = p_booking_id and (select private.assert_active_profile()) is not null'
    );
    IF v_new_source = v_target.prosrc THEN
      RAISE EXCEPTION 'F03: could not insert active-profile guard in %', v_target.signature;
    END IF;

    SELECT pg_get_functiondef(v_target.oid) INTO v_definition;
    v_marker := '$function$' || v_target.prosrc || '$function$';
    IF position(v_marker IN v_definition) = 0 THEN
      RAISE EXCEPTION 'F03: could not safely rebuild definition for %', v_target.signature;
    END IF;
    EXECUTE replace(v_definition, v_marker, '$function$' || v_new_source || '$function$');
  END IF;
END;
$f03_rewrite_profile_helpers$;

-- Payment reconciliation/invoice issuance have legitimate admin call paths.
-- Non-admin callers must additionally be active customers, while the existing
-- owner and payment/state validation in each function remains in force.
DO $f03_rewrite_admin_or_customer$
DECLARE
  v_target record;
  v_definition text;
  v_new_source text;
  v_marker text;
  v_needle text;
  v_replacement text;
BEGIN
  SELECT p.oid, p.prosrc, p.oid::regprocedure::text AS signature
  INTO v_target
  FROM pg_proc p
  WHERE p.oid = 'public.reconcile_paid_booking(uuid)'::regprocedure;

  IF v_target.prosrc NOT ILIKE '%private.assert_active_customer%' THEN
    v_needle := $needle$if auth.uid() is null then
    raise exception 'Authentication required';
  end if;$needle$;
    v_replacement := $replacement$if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_admin() then
    perform private.assert_active_customer();
  end if;$replacement$;
    v_new_source := replace(v_target.prosrc, v_needle, v_replacement);
    IF v_new_source = v_target.prosrc THEN
      RAISE EXCEPTION 'F03: could not insert active-customer guard in %', v_target.signature;
    END IF;

    SELECT pg_get_functiondef(v_target.oid) INTO v_definition;
    v_marker := '$function$' || v_target.prosrc || '$function$';
    IF position(v_marker IN v_definition) = 0 THEN
      RAISE EXCEPTION 'F03: could not safely rebuild definition for %', v_target.signature;
    END IF;
    EXECUTE replace(v_definition, v_marker, '$function$' || v_new_source || '$function$');
  END IF;

  SELECT p.oid, p.prosrc, p.oid::regprocedure::text AS signature
  INTO v_target
  FROM pg_proc p
  WHERE p.oid = 'public.issue_booking_invoice(uuid)'::regprocedure;

  IF v_target.prosrc NOT ILIKE '%private.assert_active_customer%' THEN
    v_needle := $needle$IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;$needle$;
    v_replacement := $replacement$IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT v_is_admin THEN
    PERFORM private.assert_active_customer();
  END IF;$replacement$;
    v_new_source := replace(v_target.prosrc, v_needle, v_replacement);
    IF v_new_source = v_target.prosrc THEN
      RAISE EXCEPTION 'F03: could not insert active-customer guard in %', v_target.signature;
    END IF;

    SELECT pg_get_functiondef(v_target.oid) INTO v_definition;
    v_marker := '$function$' || v_target.prosrc || '$function$';
    IF position(v_marker IN v_definition) = 0 THEN
      RAISE EXCEPTION 'F03: could not safely rebuild definition for %', v_target.signature;
    END IF;
    EXECUTE replace(v_definition, v_marker, '$function$' || v_new_source || '$function$');
  END IF;
END;
$f03_rewrite_admin_or_customer$;

-- These function bodies reference application objects explicitly by schema.
ALTER FUNCTION public.worker_get_booking_context(uuid) SET search_path = '';
ALTER FUNCTION public.worker_get_booking_offer_details(uuid) SET search_path = '';
ALTER FUNCTION public.can_access_booking_communication(uuid, uuid) SET search_path = '';

COMMIT;
