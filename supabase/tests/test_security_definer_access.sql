\set ON_ERROR_STOP on

BEGIN;

DO $setup$
DECLARE
  v_customer uuid := gen_random_uuid();
  v_worker uuid := gen_random_uuid();
  v_inactive uuid := gen_random_uuid();
  v_admin uuid := gen_random_uuid();
  v_customer_email text := gen_random_uuid()::text || '@example.invalid';
  v_worker_email text := gen_random_uuid()::text || '@example.invalid';
  v_inactive_email text := gen_random_uuid()::text || '@example.invalid';
  v_admin_email text := gen_random_uuid()::text || '@example.invalid';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES
    (v_customer, v_customer_email, jsonb_build_object('full_name','F03 Test Customer','company_name','F03 Test Co','role','customer')),
    (v_worker, v_worker_email, jsonb_build_object('full_name','F03 Test Worker','role','worker')),
    (v_inactive, v_inactive_email, jsonb_build_object('full_name','F03 Test Inactive','company_name','F03 Test Co','role','customer')),
    (v_admin, v_admin_email, jsonb_build_object('full_name','F03 Test Admin','company_name','F03 Test Co','role','admin'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profiles (id, full_name, email, company_name, role, is_active)
  VALUES
    (v_customer, 'F03 Test Customer', v_customer_email, 'F03 Test Co', 'customer'::public.user_role, true),
    (v_worker, 'F03 Test Worker', v_worker_email, NULL, 'worker'::public.user_role, true),
    (v_inactive, 'F03 Test Inactive', v_inactive_email, 'F03 Test Co', 'customer'::public.user_role, false),
    (v_admin, 'F03 Test Admin', v_admin_email, 'F03 Test Co', 'admin'::public.user_role, true)
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      company_name = EXCLUDED.company_name,
      role = EXCLUDED.role,
      is_active = EXCLUDED.is_active;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_customer AND role='customer'::public.user_role AND is_active=true)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_worker AND role='worker'::public.user_role AND is_active=true)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_inactive AND role='customer'::public.user_role AND is_active=false)
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=v_admin AND role='admin'::public.user_role AND is_active=true) THEN
    RAISE EXCEPTION 'F03_SETUP_FAIL: test profile setup did not produce expected roles/states';
  END IF;

  -- Keep UUIDs outside the profile table so the authenticated test role can use
  -- the exact fixture identities without querying other users through RLS.
  PERFORM set_config('app.f03.customer_id', v_customer::text, true);
  PERFORM set_config('app.f03.worker_id', v_worker::text, true);
  PERFORM set_config('app.f03.inactive_id', v_inactive::text, true);
  PERFORM set_config('app.f03.admin_id', v_admin::text, true);
END
$setup$;

DO $catalog_checks$
BEGIN
  IF has_function_privilege('authenticated','public.write_admin_audit(text,text,uuid,jsonb,jsonb,jsonb)'::regprocedure,'EXECUTE')
     OR has_function_privilege('anon','public.write_admin_audit(text,text,uuid,jsonb,jsonb,jsonb)'::regprocedure,'EXECUTE')
     OR has_function_privilege('service_role','public.write_admin_audit(text,text,uuid,jsonb,jsonb,jsonb)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'F03_FAIL: an API role can directly execute write_admin_audit';
  END IF;

  IF has_function_privilege('authenticated','public.set_refund_request_result(uuid,text,text)'::regprocedure,'EXECUTE')
     OR has_function_privilege('anon','public.set_refund_request_result(uuid,text,text)'::regprocedure,'EXECUTE')
     OR has_function_privilege('service_role','public.set_refund_request_result(uuid,text,text)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'F03_FAIL: an API role can execute the unused refund-result RPC';
  END IF;

  IF has_function_privilege('anon','public.admin_create_worker_payout(uuid,uuid,numeric,text,text)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'F03_FAIL: anon can execute admin_create_worker_payout';
  END IF;
  IF NOT has_function_privilege('authenticated','public.admin_create_worker_payout(uuid,uuid,numeric,text,text)'::regprocedure,'EXECUTE') THEN
    RAISE EXCEPTION 'F03_FAIL: intended authenticated admin-action RPC grant is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.write_admin_audit(text,text,uuid,jsonb,jsonb,jsonb)'::regprocedure
      AND p.proconfig @> ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'F03_FAIL: write_admin_audit is not pinned to empty search_path';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid='public.is_admin()'::regprocedure
      AND p.proconfig @> ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'F03_FAIL: is_admin is not pinned to empty search_path';
  END IF;
END
$catalog_checks$;

SET LOCAL ROLE anon;

DO $anonymous_checks$
BEGIN
  BEGIN
    PERFORM public.admin_create_worker_payout(NULL::uuid,NULL::uuid,NULL::numeric,NULL::text,NULL::text);
    RAISE EXCEPTION 'F03_UNEXPECTED_SUCCESS: anon called admin_create_worker_payout';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.write_admin_audit('F03-test','security_test',NULL::uuid,NULL::jsonb,NULL::jsonb,'{}'::jsonb);
    RAISE EXCEPTION 'F03_UNEXPECTED_SUCCESS: anon called write_admin_audit';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.set_refund_request_result(NULL::uuid,'succeeded',NULL::text);
    RAISE EXCEPTION 'F03_UNEXPECTED_SUCCESS: anon called set_refund_request_result';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$anonymous_checks$;

SET LOCAL ROLE authenticated;

DO $authenticated_checks$
DECLARE
  v_customer uuid := current_setting('app.f03.customer_id', true)::uuid;
  v_worker uuid := current_setting('app.f03.worker_id', true)::uuid;
  v_inactive uuid := current_setting('app.f03.inactive_id', true)::uuid;
  v_admin uuid := current_setting('app.f03.admin_id', true)::uuid;
  v_case record;
  v_error text;
BEGIN
  FOR v_case IN
    SELECT * FROM (VALUES
      ('active customer', v_customer),
      ('active worker', v_worker),
      ('inactive customer', v_inactive)
    ) AS users(label, user_id)
  LOOP
    PERFORM set_config('request.jwt.claim.sub',v_case.user_id::text,true);
    PERFORM set_config('request.jwt.claims',json_build_object('sub',v_case.user_id::text,'role','authenticated')::text,true);

    IF public.is_admin() IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'F03_FAIL: % unexpectedly passes public.is_admin()',v_case.label;
    END IF;

    v_error := NULL;
    BEGIN
      PERFORM public.admin_create_worker_payout(NULL::uuid,NULL::uuid,NULL::numeric,NULL::text,NULL::text);
      RAISE EXCEPTION 'F03_UNEXPECTED_SUCCESS:%',v_case.label;
    EXCEPTION WHEN OTHERS THEN
      v_error := SQLERRM;
    END;
    IF v_error <> 'Admin access required' THEN
      RAISE EXCEPTION 'F03_FAIL: % was not stopped by admin guard; got %',v_case.label,v_error;
    END IF;
  END LOOP;

  BEGIN
    PERFORM public.write_admin_audit('F03-test','security_test',NULL::uuid,NULL::jsonb,NULL::jsonb,'{}'::jsonb);
    RAISE EXCEPTION 'F03_UNEXPECTED_SUCCESS: authenticated called write_admin_audit';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    PERFORM public.set_refund_request_result(NULL::uuid,'succeeded',NULL::text);
    RAISE EXCEPTION 'F03_UNEXPECTED_SUCCESS: authenticated called set_refund_request_result';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_admin::text,'role','authenticated')::text,true);
  IF public.is_admin() IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'F03_FAIL: active admin fixture not recognized by public.is_admin()';
  END IF;
END
$authenticated_checks$;

ROLLBACK;
