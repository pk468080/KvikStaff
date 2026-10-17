BEGIN;

DO $migration_grant_tests$
DECLARE
  v_signature text;

  v_server_only_functions text[] := ARRAY[
    'public.calculate_platform_charges(numeric)',
    'public.calculate_recurring_occurrence_price(uuid,numeric,numeric)',
    'public.get_configured_gst_rate_percent()',
    'public.get_recurring_booking_max_horizon_days()',
    'public.is_booking_within_operating_hours(timestamp with time zone,timestamp with time zone)',
    'public.customer_has_active_booking_overlap(uuid,timestamp with time zone,timestamp with time zone,uuid)'
  ];
BEGIN
  -- Direct booking-state transitions must remain backend-only.
  IF has_function_privilege(
       'anon',
       'public.transition_booking_state(uuid,public.booking_status,uuid,boolean,boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.transition_booking_state(uuid,public.booking_status,uuid,boolean,boolean)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.transition_booking_state(uuid,public.booking_status,uuid,boolean,boolean)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'F08_FAIL: transition_booking_state grants do not match the backend-only policy';
  END IF;

  -- Internal pricing and booking helpers must remain server-only.
  FOREACH v_signature IN ARRAY v_server_only_functions
  LOOP
    IF has_function_privilege(
         'anon',
         v_signature::regprocedure,
         'EXECUTE'
       )
       OR has_function_privilege(
         'authenticated',
         v_signature::regprocedure,
         'EXECUTE'
       )
       OR NOT has_function_privilege(
         'service_role',
         v_signature::regprocedure,
         'EXECUTE'
       )
    THEN
      RAISE EXCEPTION
        'F08_FAIL: unexpected internal-helper grants for %',
        v_signature;
    END IF;
  END LOOP;

  RAISE NOTICE
    'F08 migration security grant regression tests passed';
END;
$migration_grant_tests$;

ROLLBACK;