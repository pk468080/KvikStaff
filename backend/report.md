| admin_assign_booking_worker | `p_booking_id uuid, p_worker_id uuid` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_cancel_booking | `p_booking_id uuid, p_reason text` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_cancel_booking_occurrence | `p_occurrence_id uuid, p_reason text` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_create_notification | `p_user_id uuid, p_title text, p_message text, p_notification_type text, p_booking_id uuid` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_create_service | `p_name text, p_description text, p_hourly_price numeric, p_currency text, p_is_active boolean` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_create_service | `p_name text, p_description text, p_hourly_price numeric, p_currency text, p_image_url text, p_is_active boolean` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_create_service | `p_name text, p_description text, p_hourly_price numeric, p_currency text, p_image_url text, p_is_active boolean, p_category_id uuid, p_display_order integer, p_is_featured boolean` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_create_worker_payout | `p_worker_id uuid, p_payout_account_id uuid, p_amount numeric, p_idempotency_key text, p_mode text` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| admin_execute_worker_booking_change_request | `p_request_id uuid, p_decision text, p_admin_notes text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_get_booking_detail | `p_booking_id uuid` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| admin_list_invoices | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| admin_list_payment_refunds | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| admin_list_payment_webhook_events | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| admin_list_payments | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| admin_list_razorpay_webhook_events | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| admin_list_refund_requests | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| admin_list_service_areas | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| admin_list_service_areas_v3 | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| admin_moderate_review | `p_review_id uuid, p_moderation_status text, p_reason text` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_remove_worker | `p_worker_id uuid` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_review_account_deletion | `p_request_id uuid, p_status text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_review_worker_application | `p_application_id uuid, p_status worker_application_status, p_notes text` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_review_worker_booking_change_request | `p_request_id uuid, p_status text, p_admin_notes text` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| admin_review_worker_booking_incident | `p_incident_id uuid, p_status text, p_admin_notes text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_review_worker_document | `p_document_id uuid, p_status worker_document_status, p_rejection_reason text` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_review_worker_payout_account | `p_payout_account_id uuid, p_status text, p_rejection_reason text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_set_customer_active | `p_customer_id uuid, p_is_active boolean` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_set_service_active | `p_service_id uuid, p_is_active boolean` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_set_worker_status | `p_worker_id uuid, p_status worker_status` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_update_current_hourly_service_price | `p_service_id uuid, p_price numeric, p_currency text` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_update_service_availability_request | `p_request_id uuid, p_status text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_update_service_catalog | `p_service_id uuid, p_name text, p_description text, p_image_url text, p_is_active boolean, p_category_id uuid, p_display_order integer, p_is_featured boolean` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_update_support_ticket | `p_ticket_id uuid, p_status text, p_admin_notes text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_update_worker | `p_worker_id uuid, p_full_name text, p_phone text, p_worker_status worker_status, p_is_verified boolean, p_service_radius_km numeric, p_is_featured boolean, p_service_ids uuid[]` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_update_worker | `p_worker_id uuid, p_full_name text, p_phone text, p_worker_status worker_status, p_is_verified boolean, p_service_radius_km numeric, p_is_featured boolean` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_upsert_service | `p_id uuid, p_name text, p_description text, p_is_active boolean` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_upsert_service | `p_id uuid, p_name text, p_description text, p_is_active boolean, p_image_url text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_upsert_service_area | `p_id uuid, p_name text, p_city text, p_state text, p_center_latitude double precision, p_center_longitude double precision, p_radius_km numeric, p_is_active boolean` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_upsert_service_area_v2 | `p_id uuid, p_service_id uuid, p_name text, p_city text, p_state text, p_center_latitude double precision, p_center_longitude double precision, p_radius_km numeric, p_is_active boolean` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_upsert_service_area_v3 | `p_id uuid, p_name text, p_city text, p_state text, p_center_latitude double precision, p_center_longitude double precision, p_radius_km numeric, p_is_active boolean, p_service_ids uuid[]` | Admin Dashboard | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_upsert_service_price | `p_id uuid, p_service_variant_id uuid, p_price numeric, p_currency text, p_effective_from timestamp with time zone, p_effective_to timestamp with time zone, p_is_active boolean` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| admin_upsert_service_variant | `p_id uuid, p_service_id uuid, p_name text, p_description text, p_billing_type text, p_duration_value integer, p_duration_unit text, p_min_quantity integer, p_max_quantity integer, p_is_active boolean, p_sort_order integer` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| apply_worker_payout_provider_update | `p_payout_id uuid, p_provider_payout_id text, p_provider_status text, p_amount_paise bigint, p_currency text, p_fund_account_id text, p_utr text, p_fees_paise bigint, p_tax_paise bigint, p_status_details jsonb, p_failure_reason text, p_created_at timestamp with time zone` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| assign_paid_booking_worker | `p_booking_id uuid` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| auto_assign_waiting_scheduled_bookings_for_worker | `p_worker_id uuid` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| auto_dispatch_waiting_bookings_for_worker | `p_worker_id uuid` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| calculate_automatic_promotion_discount | `p_service_id uuid, p_total_working_hours numeric, p_gross_amount numeric, p_currency text, p_service_discount_amount numeric` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| calculate_cancellation_refund | `p_amount numeric, p_scheduled_start timestamp with time zone, p_reference_time timestamp with time zone` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| calculate_customer_booking_schedule | `p_service_variant_id uuid, p_address_id uuid, p_start_date date, p_end_date date, p_daily_start_time time without time zone, p_daily_end_time time without time zone, p_selected_weekdays smallint[], p_off_dates date[]` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| calculate_multi_occurrence_booking_price | `p_service_variant_id uuid, p_schedule_start_date date, p_schedule_end_date date, p_daily_start_time time without time zone, p_daily_end_time time without time zone, p_selected_weekdays smallint[], p_off_dates date[], p_booking_type booking_fulfillment_type` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| calculate_platform_charges | `p_subtotal numeric` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| calculate_recurring_occurrence_price | `p_service_variant_id uuid, p_occurrence_hours numeric, p_commitment_days numeric` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| calculate_service_booking_price | `p_service_variant_id uuid, p_total_working_hours numeric` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| can_access_booking_communication | `p_booking_id uuid, p_occurrence_id uuid` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| cancel_customer_booking | `p_booking_id uuid, p_reason text` | Unknown | Yes | No/Unclear | Yes | High | Missing ownership authorization. Potential IDOR. |
| cancel_customer_booking_occurrence | `p_occurrence_id uuid, p_reason text` | Unknown | Yes | No/Unclear | Yes | High | Missing ownership authorization. Potential IDOR. |
| cancel_customer_booking_series | `p_booking_id uuid, p_reason text` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| cancel_service_availability_request | `p_request_id uuid` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| check_account_phone | `p_phone text` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| check_customer_instant_worker_availability | `p_service_id uuid, p_latitude double precision, p_longitude double precision` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| check_service_availability | `p_customer_latitude double precision, p_customer_longitude double precision, p_service_id uuid` | Unknown | Yes | No/Unclear | No | Low/Info | Safe/Intentionally exposed |
| claim_payment_refund | `p_refund_id uuid` | Supabase Edge Function | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| complete_test_payment | `p_booking_id uuid` | Unknown | Yes | No/Unclear | No | Low/Info | Safe/Intentionally exposed |
| create_booking_status_notifications | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| create_customer_booking | `p_service_variant_id uuid, p_address_id uuid, p_fulfillment_type booking_fulfillment_type, p_scheduled_start timestamp with time zone, p_notes text` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| create_customer_hourly_booking | `p_service_variant_id uuid, p_address_id uuid, p_booking_type booking_fulfillment_type, p_scheduled_start timestamp with time zone, p_scheduled_end timestamp with time zone, p_notes text` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| create_customer_multi_occurrence_booking | `p_service_variant_id uuid, p_address_id uuid, p_schedule_start_date date, p_schedule_end_date date, p_daily_start_time time without time zone, p_daily_end_time time without time zone, p_selected_weekdays smallint[], p_off_dates date[], p_notes text, p_booking_type booking_fulfillment_type` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| create_customer_recurring_booking | `p_service_variant_id uuid, p_address_id uuid, p_schedule_start_date date, p_schedule_end_date date, p_daily_start_time time without time zone, p_daily_end_time time without time zone, p_selected_weekdays smallint[], p_off_dates date[], p_notes text` | Unknown | Yes | No/Unclear | No | Low/Info | Safe/Intentionally exposed |
| create_customer_review | `p_booking_id uuid, p_worker_id uuid, p_rating integer, p_comment text, p_occurrence_id uuid` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| create_customer_scheduled_booking | `p_service_variant_id uuid, p_address_id uuid, p_schedule_start_date date, p_schedule_end_date date, p_daily_start_time time without time zone, p_daily_end_time time without time zone, p_selected_weekdays smallint[], p_off_dates date[], p_notes text` | Unknown | Yes | No/Unclear | No | Low/Info | Safe/Intentionally exposed |
| create_customer_scheduled_range_booking | `p_service_variant_id uuid, p_address_id uuid, p_start_date date, p_end_date date, p_daily_start_time time without time zone, p_daily_end_time time without time zone, p_off_dates date[], p_notes text` | Unknown | Yes | No/Unclear | No | Low/Info | Safe/Intentionally exposed |
| create_support_ticket | `p_category text, p_subject text, p_description text, p_booking_id uuid, p_payment_id uuid, p_worker_id uuid, p_refund_request_id uuid, p_payment_refund_id uuid` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| create_worker_payout_internal | `p_worker_id uuid, p_payout_account_id uuid, p_amount numeric, p_idempotency_key text, p_mode text` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| create_worker_support_ticket | `p_category text, p_subject text, p_description text, p_booking_id uuid` | Worker App | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| customer_booking_action | `p_booking_id uuid, p_action text` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| customer_has_active_booking_overlap | `p_customer_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_exclude_booking_id uuid` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| dispatch_booking_worker_offers | `p_booking_id uuid` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| dispatch_booking_worker_offers_internal | `p_booking_id uuid` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| dispatch_refund_processing_jobs | `` | Unknown | No | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| enforce_booking_service_area | `` | Unknown | Yes | No/Unclear | No | Low/Info | Safe/Intentionally exposed |
| expire_booking_worker_offers | `` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| expire_past_active_customer_bookings | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| expire_past_unpaid_customer_bookings | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| finalize_payment_refund | `p_refund_id uuid, p_status text, p_provider_refund_id text, p_failure_reason text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| finalize_razorpay_payment | `p_payment_id uuid, p_provider_payment_id text, p_paid_at timestamp with time zone` | Supabase Edge Function | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| get_configured_gst_rate_percent | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| get_customer_booking_refunds | `p_booking_id uuid` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| get_customer_instant_availability_slots | `p_service_variant_id uuid, p_address_id uuid, p_duration_hours numeric` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| get_customer_near_term_scheduled_slots | `p_service_variant_id uuid, p_address_id uuid` | Unknown | Yes | No/Unclear | No | Low/Info | Safe/Intentionally exposed |
| get_customer_scheduled_availability_slots | `p_service_variant_id uuid, p_address_id uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_duration_hours integer` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| get_customer_scheduled_slots | `p_service_variant_id uuid, p_address_id uuid, p_start_date date, p_end_date date` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| get_eligible_workers | `p_booking_id uuid` | Admin Dashboard | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| get_next_available_worker_slots | `p_service_id uuid, p_address_id uuid, p_duration_minutes integer, p_from timestamp with time zone, p_days integer` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| get_recurring_booking_max_horizon_days | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| handle_new_worker_signup | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| http_request | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| is_admin | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| is_booking_within_operating_hours | `p_start timestamp with time zone, p_end timestamp with time zone` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| issue_booking_invoice | `p_booking_id uuid` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| mark_notification_read | `p_notification_id uuid` | Worker App | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| modify_customer_booking | `p_booking_id uuid, p_scheduled_start timestamp with time zone, p_duration_hours numeric, p_address_id uuid, p_notes text` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| modify_customer_booking_occurrence | `p_occurrence_id uuid, p_new_date date` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| notify_worker_booking_offer | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| notify_worker_of_booking_offer | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| prevent_worker_role_demotion_with_profile | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| process_razorpay_webhook_event | `p_event_id uuid` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| profile_security_fields_unchanged | `p_user_id uuid, p_role user_role, p_is_active boolean` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| protect_profile_privileged_fields | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| protect_worker_earnings_immutability | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| protect_worker_profile_operational_fields | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| protect_worker_trust_fields | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| reconcile_expired_worker_presence | `` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| reconcile_paid_booking | `p_booking_id uuid` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| record_razorpay_webhook_event | `p_event_id text, p_event_name text, p_payload jsonb` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| record_worker_booking_location | `p_booking_id uuid, p_latitude double precision, p_longitude double precision` | Worker App | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| register_customer_push_token | `p_token text, p_platform text` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| register_worker_push_token | `p_token text, p_platform text` | Worker App | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| request_booking_refund | `p_booking_id uuid, p_reason text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| request_service_availability | `p_service_id uuid, p_latitude double precision, p_longitude double precision` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| request_worker_account_deletion | `p_reason text` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| requeue_stale_payment_refund | `p_refund_id uuid` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| reschedule_customer_booking | `p_booking_id uuid, p_new_start timestamp with time zone, p_new_end timestamp with time zone` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| rls_auto_enable | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| save_worker_document | `p_document_type worker_document_type, p_file_path text, p_file_name text, p_mime_type text, p_file_size bigint` | Worker App | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| save_worker_onboarding | `p_date_of_birth date, p_gender text, p_current_address text, p_permanent_address text, p_city text, p_state text, p_pincode text, p_experience_years numeric, p_experience_summary text, p_profile_photo_path text, p_service_latitude double precision, p_service_longitude double precision, p_onboarding_step smallint` | Worker App | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| set_refund_request_result | `p_refund_id uuid, p_status text, p_provider_refund_id text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| set_worker_onboarding_consent | `` | Worker App | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| set_worker_services | `p_service_ids uuid[]` | Worker App | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| st_estimatedextent | `text, text` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| st_estimatedextent | `text, text, text` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| st_estimatedextent | `text, text, text, boolean` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| submit_worker_application | `` | Worker App | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| sync_address_location_from_coordinates | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| sync_booking_occurrence_worker | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| sync_booking_pricing_totals_from_snapshot | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| sync_booking_promotion_columns | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| sync_cancelled_booking_occurrences | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| sync_occurrence_promotion_columns | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| sync_profile_email_from_auth | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| sync_service_area_group_rows | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| sync_worker_application_operational_state | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| sync_worker_location_geometry | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| tempstaff_worker_notification_push | `` | Unknown | No | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| transition_booking_occurrence_state | `p_occurrence_id uuid, p_new_status text` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
| transition_booking_state | `p_booking_id uuid, p_new_status booking_status, p_worker_id uuid, p_set_worker boolean, p_clear_worker boolean` | Unknown | Yes | No/Unclear | Yes | High | Missing ownership authorization. Potential IDOR. |
| trigger_auto_assign_on_worker_location | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| trigger_auto_assign_waiting_scheduled_bookings | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| trigger_auto_dispatch_on_worker_location | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| trigger_auto_dispatch_waiting_bookings_for_worker | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| update_worker_booking_status | `p_booking_id uuid, p_status booking_status` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| validate_booking_occurrence_lifecycle | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_booking_operating_hours | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_booking_service_variant_consistency | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_customer_company_name | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_hourly_price_period | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| validate_near_term_booking_occurrence_worker | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_near_term_scheduled_booking | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_occurrence_assignment_consistency | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_occurrence_matches_parent_schedule | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_occurrence_worker_matches_booking | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_payment_amount_against_booking | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_recurring_booking_horizon | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_service_area_radius | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_service_booking_schedule_policy | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_variant_price_period | `` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| validate_worker_document_integrity | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_worker_earnings_integrity | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_worker_operational_configuration | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_worker_profile_owner_role | `` | Unknown | Yes | Yes | No | Low/Info | Safe/Intentionally exposed |
| validate_worker_schedule_operating_window | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_worker_schedule_settings_integrity | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_worker_service_owner | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| validate_worker_weekly_schedule_overlap | `` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| verify_booking_occurrence_otp_atomic | `p_occurrence_id uuid, p_otp_type text, p_otp_hash text` | Worker App | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| verify_booking_otp_atomic | `p_booking_id uuid, p_otp_type text, p_otp_hash text` | Worker App, Supabase Edge Function | Yes | No/Unclear | Yes | High | Missing ownership authorization. Potential IDOR. |
| verify_refund_processor_secret | `p_secret text` | Unknown | No | Yes | No | Low/Info | Safe/Intentionally exposed |
| verify_worker_payout_processor_secret | `p_secret text` | Unknown | No | Yes | No | Low/Info | Safe/Intentionally exposed |
| worker_booking_action | `p_booking_id uuid, p_action text` | Worker App | Yes | No/Unclear | No | Low/Info | Safe/Intentionally exposed |
| worker_can_cover_scheduled_booking | `p_booking_id uuid, p_worker_id uuid` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| worker_covers_booking_interval | `p_service_id uuid, p_worker_id uuid, p_start timestamp with time zone, p_end timestamp with time zone` | Unknown | No | No/Unclear | No | Critical | Missing authentication check. Anyone can call this. |
| worker_create_booking_change_request | `p_booking_id uuid, p_request_type text, p_reason text, p_requested_start timestamp with time zone, p_requested_end timestamp with time zone, p_occurrence_id uuid` | Worker App | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| worker_disable_payout_account | `p_payout_account_id uuid` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| worker_get_available_earnings | `` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_get_booking_context | `p_booking_id uuid` | Worker App | Yes | No/Unclear | No | Low/Info | Safe/Intentionally exposed |
| worker_get_incident_summary | `p_booking_id uuid` | Worker App | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_get_payout_overview | `` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_get_performance_summary | `` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_get_verification_summary | `` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_list_booking_change_requests | `p_booking_id uuid, p_limit integer` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_list_booking_incidents | `p_booking_id uuid, p_limit integer` | Worker App | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_list_payout_accounts | `` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_list_payouts | `p_limit integer` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_list_reviews | `p_limit integer` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_occurrence_action | `p_occurrence_id uuid, p_action text` | Worker App | Yes | No/Unclear | No | Low/Info | Safe/Intentionally exposed |
| worker_presence_heartbeat | `p_latitude double precision, p_longitude double precision` | Unknown | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| worker_report_booking_incident | `p_booking_id uuid, p_incident_type text, p_description text, p_occurrence_id uuid` | Worker App | No | No/Unclear | Yes | Critical | Missing authentication check. Anyone can call this. |
| worker_request_payout | `p_amount numeric, p_idempotency_key text, p_payout_account_id uuid, p_mode text` | Unknown | No | Yes | No | Critical | Missing authentication check. Anyone can call this. |
| worker_respond_to_offer | `p_offer_id uuid, p_response text` | Worker App | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| worker_set_default_payout_account | `p_payout_account_id uuid` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| worker_set_presence | `p_available boolean` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| worker_update_location | `p_latitude double precision, p_longitude double precision, p_booking_id uuid` | Unknown | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| worker_withdraw_booking_change_request | `p_request_id uuid` | Worker App | No | Yes | Yes | Critical | Missing authentication check. Anyone can call this. |
| write_admin_audit | `p_action text, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb, p_metadata jsonb` | Unknown | Yes | Yes | Yes | Low/Info | Safe/Intentionally exposed |
