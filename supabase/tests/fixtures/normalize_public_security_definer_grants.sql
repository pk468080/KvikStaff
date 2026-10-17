BEGIN;
SET LOCAL search_path = public, pg_catalog;

-- The schema-only CI fixture starts with PostgreSQL default function grants.
-- Normalize application-owned public SECURITY DEFINER grants to the reviewed
-- execution classes so the test checks grants rather than the dump's defaults.
-- Extension-owned PostGIS functions are deliberately excluded; their grants
-- are platform-managed and the three st_estimatedextent overloads remain F-01.

DO $normalize_secdef_grants$
DECLARE
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
  v_target record;
  v_signature text;
  v_class_count integer;
  v_seen integer := 0;
BEGIN
  FOR v_target IN
    SELECT p.oid, p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1
        FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid
          AND d.refclassid = 'pg_extension'::regclass
          AND d.deptype = 'e'
      )
    ORDER BY p.oid::regprocedure::text
  LOOP
    v_signature := v_target.signature;
    v_class_count :=
      (CASE WHEN v_signature = ANY (v_approved) THEN 1 ELSE 0 END) +
      (CASE WHEN v_signature = ANY (v_server_only) THEN 1 ELSE 0 END) +
      (CASE WHEN v_signature = ANY (v_internal_only) THEN 1 ELSE 0 END);

    IF v_class_count <> 1 THEN
      RAISE EXCEPTION
        'F03_FAIL: application SECURITY DEFINER signature has % policy classes: %',
        v_class_count, v_signature;
    END IF;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',
      v_signature
    );

    IF v_signature = ANY (v_approved) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO authenticated',
        v_signature
      );
    END IF;

    IF NOT (v_signature = ANY (v_internal_only)) THEN
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        v_signature
      );
    END IF;

    v_seen := v_seen + 1;
  END LOOP;

  IF v_seen <> 206 THEN
    RAISE EXCEPTION
      'F03_FAIL: expected 206 application-owned SECURITY DEFINER functions, found %',
      v_seen;
  END IF;
END
$normalize_secdef_grants$;

COMMIT;
