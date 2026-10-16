\set ON_ERROR_STOP on

BEGIN;

DO $setup$
DECLARE
  v_active_customer uuid := gen_random_uuid();
  v_inactive_customer uuid := gen_random_uuid();
  v_active_worker uuid := gen_random_uuid();
  v_inactive_worker uuid := gen_random_uuid();
  v_active_customer_email text := gen_random_uuid()::text || '@example.invalid';
  v_inactive_customer_email text := gen_random_uuid()::text || '@example.invalid';
  v_active_worker_email text := gen_random_uuid()::text || '@example.invalid';
  v_inactive_worker_email text := gen_random_uuid()::text || '@example.invalid';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES
    (v_active_customer, v_active_customer_email, jsonb_build_object('full_name','F03 Active Customer','company_name','F03 Test Co','role','customer')),
    (v_inactive_customer, v_inactive_customer_email, jsonb_build_object('full_name','F03 Inactive Customer','company_name','F03 Test Co','role','customer')),
    (v_active_worker, v_active_worker_email, jsonb_build_object('full_name','F03 Active Worker','role','worker')),
    (v_inactive_worker, v_inactive_worker_email, jsonb_build_object('full_name','F03 Inactive Worker','role','worker'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, full_name, email, company_name, role, is_active)
  VALUES
    (v_active_customer, 'F03 Active Customer', v_active_customer_email, 'F03 Test Co', 'customer'::public.user_role, true),
    (v_inactive_customer, 'F03 Inactive Customer', v_inactive_customer_email, 'F03 Test Co', 'customer'::public.user_role, false),
    (v_active_worker, 'F03 Active Worker', v_active_worker_email, NULL, 'worker'::public.user_role, true),
    (v_inactive_worker, 'F03 Inactive Worker', v_inactive_worker_email, NULL, 'worker'::public.user_role, false)
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      company_name = EXCLUDED.company_name,
      role = EXCLUDED.role,
      is_active = EXCLUDED.is_active;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_active_customer AND role='customer'::public.user_role AND is_active=true)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_inactive_customer AND role='customer'::public.user_role AND is_active=false)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_active_worker AND role='worker'::public.user_role AND is_active=true)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_inactive_worker AND role='worker'::public.user_role AND is_active=false) THEN
    RAISE EXCEPTION 'F03_SETUP_FAIL: test profiles do not have the expected roles/states';
  END IF;

  PERFORM set_config('app.f03.active_customer_id', v_active_customer::text, true);
  PERFORM set_config('app.f03.inactive_customer_id', v_inactive_customer::text, true);
  PERFORM set_config('app.f03.active_worker_id', v_active_worker::text, true);
  PERFORM set_config('app.f03.inactive_worker_id', v_inactive_worker::text, true);
END
$setup$;

DO $catalog_checks$
BEGIN
  IF to_regprocedure('private.assert_active_worker()') IS NULL
     OR to_regprocedure('private.assert_active_customer()') IS NULL
     OR to_regprocedure('private.assert_active_profile()') IS NULL THEN
    RAISE EXCEPTION 'F03_FAIL: an active-account guard helper is missing';
  END IF;

  IF has_function_privilege('anon','private.assert_active_worker()'::regprocedure,'EXECUTE')
     OR has_function_privilege('authenticated','private.assert_active_worker()'::regprocedure,'EXECUTE')
     OR has_function_privilege('service_role','private.assert_active_worker()'::regprocedure,'EXECUTE')
     OR has_function_privilege('anon','private.assert_active_customer()'::regprocedure,'EXECUTE')
     OR has_function_privilege('authenticated','private.assert_active_customer()'::regprocedure,'EXECUTE')
     OR has_function_privilege('service_role','private.assert_active_customer()'::regprocedure,'EXECUTE')
     OR has_function_privilege('anon','private.assert_active_profile()'::regprocedure,'EXECUTE')
     OR has_function_privilege('authenticated','private.assert_active_profile()'::regprocedure,'EXECUTE')
     OR has_function_privilege('service_role','private.assert_active_profile()'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'F03_FAIL: an API role can directly execute a private active-account guard';
  END IF;

  IF has_function_privilege('anon','public.customer_booking_action(uuid,text)'::regprocedure,'EXECUTE')
     OR has_function_privilege('authenticated','public.customer_booking_action(uuid,text)'::regprocedure,'EXECUTE')
     OR has_function_privilege('service_role','public.customer_booking_action(uuid,text)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'F03_FAIL: an API role can execute the unused customer_booking_action RPC';
  END IF;

  IF has_function_privilege('anon','public.reconcile_paid_booking(uuid)'::regprocedure,'EXECUTE')
     OR has_function_privilege('authenticated','public.reconcile_paid_booking(uuid)'::regprocedure,'EXECUTE')
     OR has_function_privilege('service_role','public.reconcile_paid_booking(uuid)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'F03_FAIL: an API role can execute the unused reconcile_paid_booking RPC';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.assert_active_worker()'::regprocedure AND proconfig @> ARRAY['search_path=""']::text[])
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.assert_active_customer()'::regprocedure AND proconfig @> ARRAY['search_path=""']::text[])
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='private.assert_active_profile()'::regprocedure AND proconfig @> ARRAY['search_path=""']::text[]) THEN
    RAISE EXCEPTION 'F03_FAIL: a private active-account helper does not use an empty search_path';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.worker_get_booking_context(uuid)'::regprocedure AND proconfig @> ARRAY['search_path=""']::text[])
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.worker_get_booking_offer_details(uuid)'::regprocedure AND proconfig @> ARRAY['search_path=""']::text[])
     OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.can_access_booking_communication(uuid,uuid)'::regprocedure AND proconfig @> ARRAY['search_path=""']::text[]) THEN
    RAISE EXCEPTION 'F03_FAIL: a hardened booking-context function does not use an empty search_path';
  END IF;

  IF has_schema_privilege('anon', 'public', 'CREATE')
     OR has_schema_privilege('authenticated', 'public', 'CREATE')
     OR has_schema_privilege('service_role', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'F03_FAIL: an API role can CREATE objects in public';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.prosecdef
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) AS cfg(setting)
        WHERE cfg.setting LIKE 'search_path=%'
      ))
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid
          AND d.refclassid='pg_extension'::regclass AND d.deptype='e'
      )
  ) THEN
    RAISE EXCEPTION 'F03_FAIL: an application SECURITY DEFINER function lacks a fixed search_path';
  END IF;

  -- Check every admin overload, including overloads that are ambiguous to invoke
  -- by name when PostgreSQL default arguments overlap. A guard must exist before
  -- the first INSERT/UPDATE/DELETE statement in the body.
  IF EXISTS (
    WITH admin_functions AS (
      SELECT p.oid::regprocedure::text AS signature,
             lower(regexp_replace(p.prosrc, E'/\\*.*?\\*/|--[^\\n]*', '', 'gs')) AS body
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef AND p.proname LIKE 'admin_%'
    ), positions AS (
      SELECT signature,
             position('is_admin' IN body) AS guard_position,
             LEAST(
               NULLIF(position('insert into' IN body),0),
               NULLIF(position('update ' IN body),0),
               NULLIF(position('delete from' IN body),0)
             ) AS first_mutation_position
      FROM admin_functions
    )
    SELECT 1 FROM positions
    WHERE guard_position=0
       OR (first_mutation_position IS NOT NULL AND guard_position > first_mutation_position)
  ) THEN
    RAISE EXCEPTION 'F03_FAIL: an admin SECURITY DEFINER overload lacks an early is_admin guard';
  END IF;
END
$catalog_checks$;


-- Explicit inventory of authenticated-callable SECURITY DEFINER RPCs. These are
-- intentionally exposed to authenticated clients and reviewed by role/category:
-- admin RPCs (guarded by public.is_admin()), customer workflows (active account,
-- ownership and status checks), worker workflows (active worker and ownership),
-- and the RLS/helper functions. The three PostGIS overloads are tracked separately
-- under F-01 and remain an explicit known exception pending Supabase Support.
DO $client_rpc_allowlist$
DECLARE
  v_unreviewed text;
  v_unapproved_anon text;
  v_approved text[] := ARRAY[
    'admin_assign_booking_worker(uuid,uuid)',
    'admin_cancel_booking_occurrence(uuid,text)',
    'admin_cancel_booking(uuid,text)',
    'admin_create_notification(uuid,text,text,text,uuid)',
    'admin_create_service(text,text,numeric,text,boolean)',
    'admin_create_service(text,text,numeric,text,text,boolean,uuid,integer,boolean)',
    'admin_create_service(text,text,numeric,text,text,boolean)',
    'admin_create_worker_payout(uuid,uuid,numeric,text,text)',
    'admin_execute_worker_booking_change_request(uuid,text,text)',
    'admin_get_booking_detail(uuid)',
    'admin_get_live_map_data()',
    'admin_list_account_deletion_requests()',
    'admin_list_invoices()',
    'admin_list_payment_refunds()',
    'admin_list_payment_webhook_events()',
    'admin_list_payments()',
    'admin_list_razorpay_webhook_events()',
    'admin_list_refund_requests()',
    'admin_list_service_areas_v3()',
    'admin_list_service_areas()',
    'admin_moderate_review(uuid,text,text)',
    'admin_remove_worker(uuid)',
    'admin_review_account_deletion(uuid,text)',
    'admin_review_worker_application(uuid,worker_application_status,text)',
    'admin_review_worker_booking_change_request(uuid,text,text)',
    'admin_review_worker_booking_incident(uuid,text,text)',
    'admin_review_worker_document(uuid,worker_document_status,text)',
    'admin_review_worker_payout_account(uuid,text,text)',
    'admin_set_customer_active(uuid,boolean)',
    'admin_set_service_active(uuid,boolean)',
    'admin_set_worker_status(uuid,worker_status)',
    'admin_update_current_hourly_service_price(uuid,numeric,text)',
    'admin_update_service_availability_request(uuid,text)',
    'admin_update_service_catalog(uuid,text,text,text,boolean,uuid,integer,boolean)',
    'admin_update_support_ticket(uuid,text,text)',
    'admin_update_worker(uuid,text,text,worker_status,boolean,numeric,boolean,uuid[])',
    'admin_update_worker(uuid,text,text,worker_status,boolean,numeric,boolean)',
    'admin_upsert_service_area_v2(uuid,uuid,text,text,text,double precision,double precision,numeric,boolean)',
    'admin_upsert_service_area_v3(uuid,text,text,text,double precision,double precision,numeric,boolean,uuid[])',
    'admin_upsert_service_area(uuid,text,text,text,double precision,double precision,numeric,boolean)',
    'admin_upsert_service_price(uuid,uuid,numeric,text,timestamp with time zone,timestamp with time zone,boolean)',
    'admin_upsert_service_variant(uuid,uuid,text,text,text,integer,text,integer,integer,boolean,integer)',
    'admin_upsert_service(uuid,text,text,boolean,text)',
    'admin_upsert_service(uuid,text,text,boolean)',
    'calculate_customer_booking_schedule(uuid,uuid,date,date,time without time zone,time without time zone,smallint[],date[])',
    'calculate_multi_occurrence_booking_price(uuid,date,date,time without time zone,time without time zone,smallint[],date[],booking_fulfillment_type)',
    'calculate_service_booking_price(uuid,numeric)',
    'can_access_booking_communication(uuid,uuid)',
    'cancel_customer_booking_occurrence(uuid,text)',
    'cancel_customer_booking_series(uuid,text)',
    'cancel_customer_booking(uuid,text)',
    'cancel_service_availability_request(uuid)',
    'check_customer_instant_worker_availability(uuid,double precision,double precision)',
    'check_service_availability(double precision,double precision,uuid)',
    'complete_customer_account_deletion(uuid,uuid,uuid)',
    'create_customer_hourly_booking(uuid,uuid,booking_fulfillment_type,timestamp with time zone,timestamp with time zone,text)',
    'create_customer_recurring_booking(uuid,uuid,date,date,time without time zone,time without time zone,smallint[],date[],text)',
    'create_customer_review(uuid,uuid,integer,text,uuid)',
    'create_customer_scheduled_booking(uuid,uuid,date,date,time without time zone,time without time zone,smallint[],date[],text)',
    'create_support_ticket(text,text,text,uuid,uuid,uuid,uuid,uuid)',
    'create_worker_support_ticket(text,text,text,uuid)',
    'get_customer_instant_availability_slots(uuid,uuid,numeric)',
    'get_customer_near_term_scheduled_slots(uuid,uuid)',
    'get_customer_scheduled_availability_slots(uuid,uuid,timestamp with time zone,timestamp with time zone,integer)',
    'get_customer_scheduled_slots(uuid,uuid,date,date)',
    'get_eligible_workers(uuid)',
    'is_admin()',
    'issue_booking_invoice(uuid)',
    'mark_notification_read(uuid)',
    'prepare_customer_account_deletion(uuid)',
    'record_worker_booking_location(uuid,double precision,double precision)',
    'register_customer_push_token(text,text)',
    'register_worker_push_token(text,text)',
    'request_service_availability(uuid,double precision,double precision)',
    'request_worker_account_deletion(text)',
    'reschedule_customer_booking(uuid,timestamp with time zone,timestamp with time zone)',
    'save_worker_document(worker_document_type,text,text,text,bigint)',
    'save_worker_onboarding(date,text,text,text,text,text,text,numeric,text,text,double precision,double precision,smallint)',
    'set_worker_onboarding_consent()',
    'set_worker_services(uuid[])',
    'st_estimatedextent(text,text,text,boolean)',
    'st_estimatedextent(text,text,text)',
    'st_estimatedextent(text,text)',
    'submit_worker_application()',
    'verify_booking_occurrence_otp_atomic(uuid,text,text)',
    'verify_booking_otp_atomic(uuid,text,text)',
    'worker_booking_action(uuid,text)',
    'worker_create_booking_change_request(uuid,text,text,timestamp with time zone,timestamp with time zone,uuid)',
    'worker_disable_payout_account(uuid)',
    'worker_get_available_earnings()',
    'worker_get_booking_context(uuid)',
    'worker_get_booking_offer_details(uuid)',
    'worker_get_incident_summary(uuid)',
    'worker_get_payout_overview()',
    'worker_get_performance_summary()',
    'worker_get_verification_summary()',
    'worker_list_booking_change_requests(uuid,integer)',
    'worker_list_booking_incidents(uuid,integer)',
    'worker_list_payout_accounts()',
    'worker_list_payouts(integer)',
    'worker_list_reviews(integer)',
    'worker_occurrence_action(uuid,text)',
    'worker_presence_heartbeat(double precision,double precision)',
    'worker_report_booking_incident(uuid,text,text,uuid)',
    'worker_request_payout(numeric,text,uuid,text)',
    'worker_respond_to_offer(uuid,text)',
    'worker_set_default_payout_account(uuid)',
    'worker_set_presence(boolean)',
    'worker_update_location(double precision,double precision,uuid)',
    'worker_withdraw_booking_change_request(uuid)'
  ]::text[];
  v_server_only text[] := ARRAY[
    'apply_worker_payout_provider_update(uuid,text,text,bigint,text,text,text,bigint,bigint,jsonb,text,timestamp with time zone)',
    'assign_paid_booking_worker(uuid)',
    'auto_assign_waiting_scheduled_bookings_for_worker(uuid)',
    'auto_dispatch_waiting_bookings_for_worker(uuid)',
    'calculate_cancellation_refund(numeric,timestamp with time zone,timestamp with time zone)',
    'calculate_platform_charges(numeric)',
    'calculate_recurring_occurrence_price(uuid,numeric,numeric)',
    'check_account_phone(text)',
    'claim_payment_refund(uuid)',
    'create_booking_status_notifications()',
    'create_customer_booking(uuid,uuid,booking_fulfillment_type,timestamp with time zone,text)',
    'create_customer_multi_occurrence_booking(uuid,uuid,date,date,time without time zone,time without time zone,smallint[],date[],text,booking_fulfillment_type)',
    'create_customer_scheduled_range_booking(uuid,uuid,date,date,time without time zone,time without time zone,date[],text)',
    'create_worker_payout_internal(uuid,uuid,numeric,text,text)',
    'customer_has_active_booking_overlap(uuid,timestamp with time zone,timestamp with time zone,uuid)',
    'dispatch_booking_worker_offers_internal(uuid)',
    'dispatch_booking_worker_offers(uuid)',
    'dispatch_due_scheduled_worker_offers()',
    'dispatch_refund_processing_jobs()',
    'dispatch_scheduled_booking_offer_batch(uuid,uuid)',
    'enforce_booking_service_area()',
    'enforce_customer_profile_phone_identity()',
    'expire_booking_worker_offers()',
    'finalize_payment_refund(uuid,text,text,text)',
    'finalize_razorpay_payment(uuid,text,timestamp with time zone)',
    'get_configured_gst_rate_percent()',
    'get_next_available_worker_slots(uuid,uuid,integer,timestamp with time zone,integer)',
    'get_recurring_booking_max_horizon_days()',
    'guard_customer_deletion_approval()',
    'handle_auth_user_deleted_profile()',
    'handle_new_worker_signup()',
    'is_booking_within_operating_hours(timestamp with time zone,timestamp with time zone)',
    'modify_customer_booking_occurrence(uuid,date)',
    'modify_customer_booking(uuid,timestamp with time zone,numeric,uuid,text)',
    'notify_worker_booking_offer()',
    'notify_worker_of_booking_offer()',
    'prevent_worker_role_demotion_with_profile()',
    'process_razorpay_webhook_event(uuid)',
    'protect_profile_privileged_fields()',
    'protect_worker_earnings_immutability()',
    'protect_worker_profile_operational_fields()',
    'protect_worker_trust_fields()',
    'reconcile_expired_worker_presence()',
    'reconcile_worker_assignment_presence_from_booking()',
    'reconcile_worker_assignment_presence_from_occurrence()',
    'reconcile_worker_assignment_presence(uuid)',
    'record_razorpay_webhook_event(text,text,jsonb)',
    'request_booking_refund(uuid,text)',
    'requeue_stale_payment_refund(uuid)',
    'rls_auto_enable()',
    'sync_address_location_from_coordinates()',
    'sync_booking_occurrence_worker()',
    'sync_booking_pricing_totals_from_snapshot()',
    'sync_cancelled_booking_occurrences()',
    'sync_profile_email_from_auth()',
    'sync_service_area_group_rows()',
    'sync_worker_application_operational_state()',
    'sync_worker_location_geometry()',
    'tempstaff_worker_notification_push()',
    'transition_booking_occurrence_state(uuid,text)',
    'transition_booking_state(uuid,booking_status,uuid,boolean,boolean)',
    'trigger_auto_assign_on_worker_location()',
    'trigger_auto_assign_waiting_scheduled_bookings()',
    'trigger_auto_dispatch_on_worker_location()',
    'trigger_auto_dispatch_waiting_bookings_for_worker()',
    'validate_booking_occurrence_lifecycle()',
    'validate_booking_operating_hours()',
    'validate_booking_service_variant_consistency()',
    'validate_customer_company_name()',
    'validate_hourly_price_period()',
    'validate_near_term_booking_occurrence_worker()',
    'validate_near_term_scheduled_booking()',
    'validate_occurrence_assignment_consistency()',
    'validate_occurrence_matches_parent_schedule()',
    'validate_occurrence_worker_matches_booking()',
    'validate_payment_amount_against_booking()',
    'validate_recurring_booking_horizon()',
    'validate_service_area_radius()',
    'validate_service_booking_schedule_policy()',
    'validate_variant_price_period()',
    'validate_worker_document_integrity()',
    'validate_worker_earnings_integrity()',
    'validate_worker_operational_configuration()',
    'validate_worker_profile_owner_role()',
    'validate_worker_schedule_operating_window()',
    'validate_worker_schedule_settings_integrity()',
    'validate_worker_service_owner()',
    'validate_worker_weekly_schedule_overlap()',
    'verify_refund_processor_secret(text)',
    'verify_worker_payout_processor_secret(text)',
    'worker_can_cover_scheduled_booking(uuid,uuid)',
    'worker_covers_booking_interval(uuid,uuid,timestamp with time zone,timestamp with time zone)',
    'worker_has_active_assignment(uuid)'
  ]::text[];
  v_internal_only text[] := ARRAY[
    'complete_test_payment(uuid)',
    'customer_booking_action(uuid,text)',
    'reconcile_paid_booking(uuid)',
    'set_refund_request_result(uuid,text,text)',
    'update_worker_booking_status(uuid,booking_status)',
    'write_admin_audit(text,text,uuid,jsonb,jsonb,jsonb)'
  ]::text[];
  v_anon_exception text[] := ARRAY[
    'st_estimatedextent(text,text)',
    'st_estimatedextent(text,text,text)',
    'st_estimatedextent(text,text,text,boolean)'
  ]::text[];
  v_unclassified text;
  v_missing_inventory text;
  v_role_mismatch text;
  v_total integer;
  v_auth_count integer;
  v_anon_count integer;
  v_service_count integer;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_unreviewed
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.prosecdef
    AND has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT (p.oid::regprocedure::text = ANY (v_approved));

  IF v_unreviewed IS NOT NULL THEN
    RAISE EXCEPTION 'F03_FAIL: unreviewed authenticated SECURITY DEFINER RPCs: %', v_unreviewed;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_unapproved_anon
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.prosecdef
    AND has_function_privilege('anon',p.oid,'EXECUTE')
    AND p.oid::regprocedure::text NOT IN (
      'st_estimatedextent(text,text)',
      'st_estimatedextent(text,text,text)',
      'st_estimatedextent(text,text,text,boolean)'
    );

  IF v_unapproved_anon IS NOT NULL THEN
    RAISE EXCEPTION 'F03_FAIL: unreviewed anonymous SECURITY DEFINER RPCs: %', v_unapproved_anon;
  END IF;

  -- Frozen inventory snapshot for this reviewed release: 209 public SECURITY
  -- DEFINER functions. 110 are approved authenticated RPCs; three of those are
  -- the known PostGIS anon exceptions tracked under F-01; 93 are server-role-only;
  -- six are owner/internal-only and must not be exposed to any API role.
  SELECT count(*),
         count(*) FILTER (WHERE has_function_privilege('authenticated',p.oid,'EXECUTE')),
         count(*) FILTER (WHERE has_function_privilege('anon',p.oid,'EXECUTE')),
         count(*) FILTER (WHERE has_function_privilege('service_role',p.oid,'EXECUTE'))
  INTO v_total, v_auth_count, v_anon_count, v_service_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef;

  IF v_total <> 209 OR v_auth_count <> 110 OR v_anon_count <> 3 OR v_service_count <> 203 THEN
    RAISE EXCEPTION 'F03_FAIL: SECURITY DEFINER inventory/privilege counts changed (total %, authenticated %, anon %, service_role %); review and update the explicit inventory',
      v_total, v_auth_count, v_anon_count, v_service_count;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_unclassified
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND NOT (p.oid::regprocedure::text = ANY (v_approved || v_server_only || v_internal_only));
  IF v_unclassified IS NOT NULL THEN
    RAISE EXCEPTION 'F03_FAIL: unclassified SECURITY DEFINER functions: %', v_unclassified;
  END IF;

  SELECT string_agg(i.signature, ', ' ORDER BY i.signature)
  INTO v_missing_inventory
  FROM unnest(v_approved || v_server_only || v_internal_only) AS i(signature)
  WHERE to_regprocedure(i.signature) IS NULL;
  IF v_missing_inventory IS NOT NULL THEN
    RAISE EXCEPTION 'F03_FAIL: inventory signatures missing from the database: %', v_missing_inventory;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.oid::regprocedure::text)
  INTO v_role_mismatch
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND (
      has_function_privilege('authenticated',p.oid,'EXECUTE') IS DISTINCT FROM (p.oid::regprocedure::text = ANY (v_approved))
      OR has_function_privilege('anon',p.oid,'EXECUTE') IS DISTINCT FROM (p.oid::regprocedure::text = ANY (v_anon_exception))
      OR has_function_privilege('service_role',p.oid,'EXECUTE') IS DISTINCT FROM (NOT (p.oid::regprocedure::text = ANY (v_internal_only)))
    );
  IF v_role_mismatch IS NOT NULL THEN
    RAISE EXCEPTION 'F03_FAIL: SECURITY DEFINER execute grants differ from the reviewed role inventory: %', v_role_mismatch;
  END IF;
END
$client_rpc_allowlist$;

SET LOCAL ROLE authenticated;

-- Exercise each unambiguous privileged RPC entry point against ordinary and
-- inactive identities. Overloads with defaults are source-checked above, since
-- PostgreSQL may reject calls by name as ambiguous before entering the body.
DO $privileged_rpc_guard_sweep$
DECLARE
  v_target record;
  v_case record;
  v_args text;
  v_error text;
  v_checked integer := 0;
BEGIN
  FOR v_target IN
    SELECT p.oid, p.proname, p.proargtypes::oid[] AS arg_types,
           p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND (p.proname LIKE 'admin_%' OR p.proname IN (
        'prepare_customer_account_deletion',
        'complete_customer_account_deletion',
        'get_eligible_workers'
      ))
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND (SELECT count(*) FROM pg_proc p2
           JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
           WHERE n2.nspname = 'public' AND p2.proname = p.proname) = 1
    ORDER BY p.oid::regprocedure::text
  LOOP
    SELECT COALESCE(string_agg(
      'NULL::' || format_type(a.type_oid, NULL), ', ' ORDER BY a.ordinality
    ), '')
    INTO v_args
    FROM unnest(v_target.arg_types) WITH ORDINALITY AS a(type_oid, ordinality);

    FOR v_case IN
      SELECT * FROM (VALUES
        ('active customer', current_setting('app.f03.active_customer_id', true)::uuid),
        ('active worker', current_setting('app.f03.active_worker_id', true)::uuid),
        ('inactive customer', current_setting('app.f03.inactive_customer_id', true)::uuid),
        ('inactive worker', current_setting('app.f03.inactive_worker_id', true)::uuid)
      ) AS cases(label, user_id)
    LOOP
      PERFORM set_config('request.jwt.claim.sub', v_case.user_id::text, true);
      PERFORM set_config(
        'request.jwt.claims',
        json_build_object('sub', v_case.user_id::text, 'role', 'authenticated')::text,
        true
      );

      v_error := NULL;
      BEGIN
        EXECUTE format('SELECT public.%I(%s)', v_target.proname, v_args);
        v_error := 'F03_TEST_UNEXPECTED_SUCCESS';
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
      END;

      IF v_error = 'F03_TEST_UNEXPECTED_SUCCESS' THEN
        RAISE EXCEPTION 'F03_FAIL: % unexpectedly succeeded for %',
          v_target.signature, v_case.label;
      END IF;
      IF v_error NOT ILIKE 'Admin access required'
         AND v_error NOT ILIKE 'Admin or service-role access required' THEN
        RAISE EXCEPTION 'F03_FAIL: % for % returned an unexpected denial: %',
          v_target.signature, v_case.label, v_error;
      END IF;
      v_checked := v_checked + 1;
    END LOOP;
  END LOOP;

  IF v_checked < 140 THEN
    RAISE EXCEPTION 'F03_FAIL: only % privileged RPC negative calls executed', v_checked;
  END IF;
  PERFORM set_config('app.f03.privileged_rpc_guard_sweep_count', v_checked::text, true);
END
$privileged_rpc_guard_sweep$;


DO $inactive_worker_checks$
DECLARE
  v_worker uuid := current_setting('app.f03.inactive_worker_id', true)::uuid;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_worker::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_worker::text,'role','authenticated')::text, true);

  v_error := NULL;
  BEGIN
    PERFORM public.worker_get_booking_context(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active worker account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive worker booking context call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.worker_get_booking_offer_details(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active worker account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive worker offer-details call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.worker_disable_payout_account(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active worker account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive worker payout-account mutation returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.worker_set_default_payout_account(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active worker account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive worker default-payout mutation returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.worker_withdraw_booking_change_request(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active worker account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive worker withdraw-request mutation returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.worker_report_booking_incident(gen_random_uuid(),'other','F03 test',NULL);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active worker account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive worker incident mutation returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.worker_get_performance_summary();
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active worker account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive worker performance summary returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.worker_get_verification_summary();
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active worker account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive worker verification summary returned %',v_error;
  END IF;
END
$inactive_worker_checks$;

DO $active_worker_control$
DECLARE
  v_worker uuid := current_setting('app.f03.active_worker_id', true)::uuid;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_worker::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_worker::text,'role','authenticated')::text, true);

  v_error := NULL;
  BEGIN
    PERFORM public.worker_get_booking_context(NULL::uuid);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Booking id is required' THEN
    RAISE EXCEPTION 'F03_FAIL: active worker did not pass the account guard; got %',v_error;
  END IF;
END
$active_worker_control$;

DO $inactive_customer_checks$
DECLARE
  v_customer uuid := current_setting('app.f03.inactive_customer_id', true)::uuid;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_customer::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_customer::text,'role','authenticated')::text, true);

  v_error := NULL;
  BEGIN
    PERFORM public.calculate_service_booking_price(gen_random_uuid(), 1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active customer account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive customer pricing call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.calculate_customer_booking_schedule(NULL::uuid,NULL::uuid,NULL::date,NULL::date,NULL::time,NULL::time,NULL::smallint[],NULL::date[]);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active customer account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive customer schedule-pricing call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.cancel_service_availability_request(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active customer account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive customer availability-cancel call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.check_customer_instant_worker_availability(gen_random_uuid(),0,0);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active customer account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive customer instant-availability call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.check_service_availability(0,0,gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active customer account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive customer service-availability call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.get_customer_instant_availability_slots(gen_random_uuid(),gen_random_uuid(),1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active customer account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive customer instant-slot call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.get_customer_near_term_scheduled_slots(gen_random_uuid(),gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active customer account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive customer near-term slots call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.get_customer_scheduled_availability_slots(gen_random_uuid(),gen_random_uuid(),now(),now()+interval '1 day',1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active customer account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive customer scheduled-availability call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.get_customer_scheduled_slots(gen_random_uuid(),gen_random_uuid(),current_date,current_date+1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active customer account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive customer scheduled-slots call returned %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.issue_booking_invoice(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Active customer account required' THEN
    RAISE EXCEPTION 'F03_FAIL: inactive customer invoice call returned %',v_error;
  END IF;
END
$inactive_customer_checks$;

DO $active_customer_control$
DECLARE
  v_customer uuid := current_setting('app.f03.active_customer_id', true)::uuid;
  v_error text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', v_customer::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_customer::text,'role','authenticated')::text, true);

  v_error := NULL;
  BEGIN
    PERFORM public.calculate_service_booking_price(gen_random_uuid(), 1);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Service package is not available' THEN
    RAISE EXCEPTION 'F03_FAIL: active customer did not pass account guard; got %',v_error;
  END IF;

  v_error := NULL;
  BEGIN
    PERFORM public.issue_booking_invoice(gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;
  END;
  IF v_error IS DISTINCT FROM 'Booking not found' THEN
    RAISE EXCEPTION 'F03_FAIL: active customer did not pass invoice account guard; got %',v_error;
  END IF;
END
$active_customer_control$;

ROLLBACK;
