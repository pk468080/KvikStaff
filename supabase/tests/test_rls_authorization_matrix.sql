\set ON_ERROR_STOP on

BEGIN;

-- The test runs against an isolated schema-only CI database. These fixtures
-- use generated IDs and are rolled back at the end.
DO $f07_ids$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'customer_a_id','customer_b_id','inactive_customer_id',
    'worker_a_id','worker_b_id','inactive_worker_id','admin_id',
    'service_id','variant_id',
    'address_a_id','address_b_id','address_inactive_id',
    'booking_a_id','booking_b_id','booking_inactive_id',
    'payment_a_id','payment_b_id','payment_inactive_id',
    'application_a_id','application_b_id','application_inactive_id',
    'conversation_a_id','conversation_b_id','conversation_inactive_id'
  ] LOOP
    PERFORM set_config(
      'app.f07_' || v_name,
      gen_random_uuid()::text,
      true
    );
  END LOOP;
END
$f07_ids$;

-- Disable triggers only during synthetic fixture creation. Referential
-- relationships are explicitly populated below. Restore triggers before
-- any identity is tested.
SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT current_setting('app.f07_' || x.key)::uuid,
       current_setting('app.f07_' || x.key) || '@f07.example.invalid',
       jsonb_build_object('role', x.user_role, 'full_name', x.full_name)
FROM (VALUES
  ('customer_a_id','customer','F07 Customer A'),
  ('customer_b_id','customer','F07 Customer B'),
  ('inactive_customer_id','customer','F07 Inactive Customer'),
  ('worker_a_id','worker','F07 Worker A'),
  ('worker_b_id','worker','F07 Worker B'),
  ('inactive_worker_id','worker','F07 Inactive Worker'),
  ('admin_id','admin','F07 Admin')
) AS x(key, user_role, full_name);

INSERT INTO public.profiles
  (id, full_name, email, company_name, role, is_active)
SELECT current_setting('app.f07_' || x.key)::uuid,
       x.full_name,
       current_setting('app.f07_' || x.key) || '@f07.example.invalid',
       CASE WHEN x.user_role = 'customer' THEN 'F07 Test Company' END,
       x.user_role::public.user_role,
       x.is_active
FROM (VALUES
  ('customer_a_id','customer','F07 Customer A',true),
  ('customer_b_id','customer','F07 Customer B',true),
  ('inactive_customer_id','customer','F07 Inactive Customer',false),
  ('worker_a_id','worker','F07 Worker A',true),
  ('worker_b_id','worker','F07 Worker B',true),
  ('inactive_worker_id','worker','F07 Inactive Worker',false),
  ('admin_id','admin','F07 Admin',true)
) AS x(key, user_role, full_name, is_active);

INSERT INTO public.worker_profiles
  (id, worker_status, service_radius_km, is_verified,
   rating, total_completed_jobs, is_featured)
SELECT current_setting('app.f07_' || x.key)::uuid,
       'offline'::public.worker_status, 10, false, 0, 0, false
FROM (VALUES ('worker_a_id'),('worker_b_id'),('inactive_worker_id')) AS x(key);

INSERT INTO public.services (id, name, is_active)
VALUES (
  current_setting('app.f07_service_id')::uuid,
  'F07 Test Service',
  true
);

INSERT INTO public.service_variants (id, service_id, name)
VALUES (
  current_setting('app.f07_variant_id')::uuid,
  current_setting('app.f07_service_id')::uuid,
  'F07 Test Variant'
);

INSERT INTO public.addresses
  (id, user_id, label, address_line, latitude, longitude, location)
VALUES
(
  current_setting('app.f07_address_a_id')::uuid,
  current_setting('app.f07_customer_a_id')::uuid,
  'F07 A',
  'F07 Test Address A',
  28.60, 77.20,
  ST_SetSRID(ST_MakePoint(77.20, 28.60),4326)::geography
),
(
  current_setting('app.f07_address_b_id')::uuid,
  current_setting('app.f07_customer_b_id')::uuid,
  'F07 B',
  'F07 Test Address B',
  28.61, 77.21,
  ST_SetSRID(ST_MakePoint(77.21, 28.61),4326)::geography
),
(
  current_setting('app.f07_address_inactive_id')::uuid,
  current_setting('app.f07_inactive_customer_id')::uuid,
  'F07 Inactive',
  'F07 Inactive Test Address',
  28.62, 77.22,
  ST_SetSRID(ST_MakePoint(77.22, 28.62),4326)::geography
);

INSERT INTO public.bookings
  (id, customer_id, worker_id, service_id, address_id, status,
   duration_value, duration_unit, scheduled_start, scheduled_end,
   base_amount, platform_fee, tax_amount, total_amount,
   fulfillment_type, service_variant_id, journey_started_at, journey_started_by)
VALUES
(
  current_setting('app.f07_booking_a_id')::uuid,
  current_setting('app.f07_customer_a_id')::uuid,
  current_setting('app.f07_worker_a_id')::uuid,
  current_setting('app.f07_service_id')::uuid,
  current_setting('app.f07_address_a_id')::uuid,
  'on_the_way'::public.booking_status,
  2, 'hour'::public.booking_duration_unit,
  now() + interval '3 days', now() + interval '3 days 2 hours',
  100, 0, 0, 100,
  'scheduled'::public.booking_fulfillment_type,
  current_setting('app.f07_variant_id')::uuid,
  now(), current_setting('app.f07_worker_a_id')::uuid
),
(
  current_setting('app.f07_booking_b_id')::uuid,
  current_setting('app.f07_customer_b_id')::uuid,
  current_setting('app.f07_worker_b_id')::uuid,
  current_setting('app.f07_service_id')::uuid,
  current_setting('app.f07_address_b_id')::uuid,
  'on_the_way'::public.booking_status,
  2, 'hour'::public.booking_duration_unit,
  now() + interval '3 days', now() + interval '3 days 2 hours',
  100, 0, 0, 100,
  'scheduled'::public.booking_fulfillment_type,
  current_setting('app.f07_variant_id')::uuid,
  now(), current_setting('app.f07_worker_b_id')::uuid
),
(
  current_setting('app.f07_booking_inactive_id')::uuid,
  current_setting('app.f07_inactive_customer_id')::uuid,
  current_setting('app.f07_inactive_worker_id')::uuid,
  current_setting('app.f07_service_id')::uuid,
  current_setting('app.f07_address_inactive_id')::uuid,
  'on_the_way'::public.booking_status,
  2, 'hour'::public.booking_duration_unit,
  now() + interval '3 days', now() + interval '3 days 2 hours',
  100, 0, 0, 100,
  'scheduled'::public.booking_fulfillment_type,
  current_setting('app.f07_variant_id')::uuid,
  now(), current_setting('app.f07_inactive_worker_id')::uuid
);

INSERT INTO public.payments (id, booking_id, amount, currency, status)
VALUES
(
  current_setting('app.f07_payment_a_id')::uuid,
  current_setting('app.f07_booking_a_id')::uuid, 100, 'INR',
  'pending'::public.payment_status
),
(
  current_setting('app.f07_payment_b_id')::uuid,
  current_setting('app.f07_booking_b_id')::uuid, 100, 'INR',
  'pending'::public.payment_status
),
(
  current_setting('app.f07_payment_inactive_id')::uuid,
  current_setting('app.f07_booking_inactive_id')::uuid, 100, 'INR',
  'pending'::public.payment_status
);

INSERT INTO public.payment_refunds (payment_id, booking_id, amount, currency, status)
VALUES
(current_setting('app.f07_payment_a_id')::uuid,
 current_setting('app.f07_booking_a_id')::uuid, 10, 'INR', 'pending'),
(current_setting('app.f07_payment_b_id')::uuid,
 current_setting('app.f07_booking_b_id')::uuid, 10, 'INR', 'pending'),
(current_setting('app.f07_payment_inactive_id')::uuid,
 current_setting('app.f07_booking_inactive_id')::uuid, 10, 'INR', 'pending');

INSERT INTO public.worker_applications (id, worker_id, onboarding_type)
VALUES
(current_setting('app.f07_application_a_id')::uuid,
 current_setting('app.f07_worker_a_id')::uuid, 'self_registered'),
(current_setting('app.f07_application_b_id')::uuid,
 current_setting('app.f07_worker_b_id')::uuid, 'self_registered'),
(current_setting('app.f07_application_inactive_id')::uuid,
 current_setting('app.f07_inactive_worker_id')::uuid, 'self_registered');

INSERT INTO public.worker_documents
  (application_id, worker_id, document_type, file_path,
   file_name, mime_type, file_size, status)
VALUES
(current_setting('app.f07_application_a_id')::uuid,
 current_setting('app.f07_worker_a_id')::uuid, 'pan',
 current_setting('app.f07_worker_a_id') || '/pan/f07-a.pdf',
 'f07-a.pdf', 'application/pdf', 1024, 'pending'),
(current_setting('app.f07_application_b_id')::uuid,
 current_setting('app.f07_worker_b_id')::uuid, 'pan',
 current_setting('app.f07_worker_b_id') || '/pan/f07-b.pdf',
 'f07-b.pdf', 'application/pdf', 1024, 'pending'),
(current_setting('app.f07_application_inactive_id')::uuid,
 current_setting('app.f07_inactive_worker_id')::uuid, 'pan',
 current_setting('app.f07_inactive_worker_id') || '/pan/f07-inactive.pdf',
 'f07-inactive.pdf', 'application/pdf', 1024, 'pending');

INSERT INTO public.worker_locations
  (worker_id, booking_id, latitude, longitude)
VALUES
(current_setting('app.f07_worker_a_id')::uuid,
 current_setting('app.f07_booking_a_id')::uuid, 28.60, 77.20),
(current_setting('app.f07_worker_b_id')::uuid,
 current_setting('app.f07_booking_b_id')::uuid, 28.61, 77.21),
(current_setting('app.f07_inactive_worker_id')::uuid,
 current_setting('app.f07_booking_inactive_id')::uuid, 28.62, 77.22);

INSERT INTO public.worker_payout_accounts (worker_id, account_type)
VALUES
(current_setting('app.f07_worker_a_id')::uuid, 'bank_account'),
(current_setting('app.f07_worker_b_id')::uuid, 'bank_account'),
(current_setting('app.f07_inactive_worker_id')::uuid, 'bank_account');

INSERT INTO public.worker_payouts (worker_id, idempotency_key, amount)
VALUES
(current_setting('app.f07_worker_a_id')::uuid, 'f07-worker-a', 100),
(current_setting('app.f07_worker_b_id')::uuid, 'f07-worker-b', 100),
(current_setting('app.f07_inactive_worker_id')::uuid, 'f07-worker-inactive', 100);

INSERT INTO public.support_tickets
  (user_id, category, subject, description, booking_id, payment_id)
VALUES
(current_setting('app.f07_customer_a_id')::uuid, 'technical',
 'F07 Ticket A', 'Synthetic F07 ticket A',
 current_setting('app.f07_booking_a_id')::uuid,
 current_setting('app.f07_payment_a_id')::uuid),
(current_setting('app.f07_customer_b_id')::uuid, 'technical',
 'F07 Ticket B', 'Synthetic F07 ticket B',
 current_setting('app.f07_booking_b_id')::uuid,
 current_setting('app.f07_payment_b_id')::uuid),
(current_setting('app.f07_inactive_customer_id')::uuid, 'technical',
 'F07 Ticket Inactive', 'Synthetic inactive F07 ticket',
 current_setting('app.f07_booking_inactive_id')::uuid,
 current_setting('app.f07_payment_inactive_id')::uuid);

INSERT INTO public.conversations
  (id, booking_id, customer_id, worker_id, status)
VALUES
(
 current_setting('app.f07_conversation_a_id')::uuid,
 current_setting('app.f07_booking_a_id')::uuid,
 current_setting('app.f07_customer_a_id')::uuid,
 current_setting('app.f07_worker_a_id')::uuid, 'active'
),
(
 current_setting('app.f07_conversation_b_id')::uuid,
 current_setting('app.f07_booking_b_id')::uuid,
 current_setting('app.f07_customer_b_id')::uuid,
 current_setting('app.f07_worker_b_id')::uuid, 'active'
),
(
 current_setting('app.f07_conversation_inactive_id')::uuid,
 current_setting('app.f07_booking_inactive_id')::uuid,
 current_setting('app.f07_inactive_customer_id')::uuid,
 current_setting('app.f07_inactive_worker_id')::uuid, 'active'
);

INSERT INTO public.messages
  (conversation_id, sender_id, sender_role, message_type, body)
VALUES
(current_setting('app.f07_conversation_a_id')::uuid,
 current_setting('app.f07_customer_a_id')::uuid, 'customer', 'text',
 'F07 test message from customer A'),
(current_setting('app.f07_conversation_a_id')::uuid,
 current_setting('app.f07_worker_a_id')::uuid, 'worker', 'text',
 'F07 test message from worker A'),
(current_setting('app.f07_conversation_b_id')::uuid,
 current_setting('app.f07_customer_b_id')::uuid, 'customer', 'text',
 'F07 test message from customer B'),
(current_setting('app.f07_conversation_b_id')::uuid,
 current_setting('app.f07_worker_b_id')::uuid, 'worker', 'text',
 'F07 test message from worker B'),
(current_setting('app.f07_conversation_inactive_id')::uuid,
 current_setting('app.f07_inactive_customer_id')::uuid, 'customer', 'text',
 'F07 test message from inactive customer');

SET LOCAL session_replication_role = origin;

-- Catalog assertions: test the effective table grants, not policy text alone.
DO $f07_catalog$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'addresses','bookings','profiles','worker_profiles','worker_documents',
    'worker_locations','messages','conversations','payments','payment_refunds',
    'worker_payout_accounts','worker_payouts','support_tickets',
    'worker_applications'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = v_table
        AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'F07_FAIL: RLS is not enabled on public.%', v_table;
    END IF;

    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('anon', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || v_table, 'DELETE')
       OR has_table_privilege('anon', 'public.' || v_table, 'TRUNCATE')
       OR has_table_privilege('anon', 'public.' || v_table, 'TRIGGER')
       OR has_table_privilege('anon', 'public.' || v_table, 'REFERENCES') THEN
      RAISE EXCEPTION 'F07_FAIL: anon has direct table privileges on public.%', v_table;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated','public.worker_profiles','INSERT')
     OR has_table_privilege('authenticated','public.worker_profiles','UPDATE')
     OR has_table_privilege('authenticated','public.worker_profiles','DELETE') THEN
    RAISE EXCEPTION 'F07_FAIL: authenticated can directly write worker_profiles';
  END IF;

  IF has_table_privilege('authenticated','public.messages','DELETE')
     OR has_table_privilege('authenticated','public.conversations','DELETE')
     OR has_table_privilege('authenticated','public.messages','TRUNCATE')
     OR has_table_privilege('authenticated','public.conversations','TRUNCATE')
     OR has_table_privilege('authenticated','public.messages','TRIGGER')
     OR has_table_privilege('authenticated','public.conversations','TRIGGER')
     OR has_table_privilege('authenticated','public.messages','REFERENCES')
     OR has_table_privilege('authenticated','public.conversations','REFERENCES') THEN
    RAISE EXCEPTION 'F07_FAIL: authenticated has excessive messages/conversations privileges';
  END IF;

  IF has_table_privilege('authenticated','public.worker_documents','TRIGGER') THEN
    RAISE EXCEPTION 'F07_FAIL: authenticated can create worker-document triggers';
  END IF;

  IF has_table_privilege('authenticated','public.worker_payout_accounts','SELECT')
     OR has_table_privilege('authenticated','public.worker_payouts','SELECT')
     OR has_table_privilege('authenticated','public.worker_payout_accounts','INSERT')
     OR has_table_privilege('authenticated','public.worker_payouts','INSERT')
     OR has_table_privilege('authenticated','public.worker_payout_accounts','UPDATE')
     OR has_table_privilege('authenticated','public.worker_payouts','UPDATE')
     OR has_table_privilege('authenticated','public.worker_payout_accounts','DELETE')
     OR has_table_privilege('authenticated','public.worker_payouts','DELETE') THEN
    RAISE EXCEPTION 'F07_FAIL: authenticated has direct payout table privileges';
  END IF;
END
$f07_catalog$;

-- Assert the complete client-role table grant matrix, including PostgreSQL 17
-- MAINTAIN privileges. This protects against grants inherited from PUBLIC.
DO $f07_complete_privilege_matrix$
DECLARE
  v_table text;
  v_privilege text;
  v_expected boolean;
  v_tables text[] := ARRAY[
    'addresses','bookings','profiles','worker_profiles','worker_documents',
    'worker_locations','messages','conversations','payments','payment_refunds',
    'worker_payout_accounts','worker_payouts','support_tickets',
    'worker_applications'
  ];
  v_privileges text[] := ARRAY[
    'SELECT','INSERT','UPDATE','DELETE','TRUNCATE',
    'TRIGGER','REFERENCES','MAINTAIN'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    FOREACH v_privilege IN ARRAY v_privileges LOOP
      IF has_table_privilege('anon', 'public.' || v_table, v_privilege) THEN
        RAISE EXCEPTION
          'F07_FAIL: anon has % privilege on public.%',
          v_privilege, v_table;
      END IF;

      v_expected := CASE v_table
        WHEN 'addresses' THEN
          v_privilege = ANY(ARRAY['SELECT','INSERT','UPDATE','DELETE'])
        WHEN 'bookings' THEN v_privilege = 'SELECT'
        WHEN 'profiles' THEN
          v_privilege = ANY(ARRAY['SELECT','INSERT','UPDATE'])
        WHEN 'worker_profiles' THEN v_privilege = 'SELECT'
        WHEN 'worker_documents' THEN
          v_privilege = ANY(ARRAY['SELECT','INSERT','UPDATE'])
        WHEN 'worker_locations' THEN
          v_privilege = ANY(ARRAY['SELECT','INSERT'])
        WHEN 'messages' THEN
          v_privilege = ANY(ARRAY['SELECT','INSERT','UPDATE'])
        WHEN 'conversations' THEN
          v_privilege = ANY(ARRAY['SELECT','INSERT','UPDATE'])
        WHEN 'payments' THEN v_privilege = 'SELECT'
        WHEN 'payment_refunds' THEN v_privilege = 'SELECT'
        WHEN 'support_tickets' THEN v_privilege = 'SELECT'
        WHEN 'worker_applications' THEN v_privilege = 'SELECT'
        ELSE false
      END;

      IF has_table_privilege(
        'authenticated', 'public.' || v_table, v_privilege
      ) IS DISTINCT FROM v_expected THEN
        RAISE EXCEPTION
          'F07_FAIL: authenticated privilege mismatch on public.%: %; expected %',
          v_table, v_privilege, v_expected;
      END IF;
    END LOOP;
  END LOOP;
END
$f07_complete_privilege_matrix$;

-- Temporary assertion helpers are SECURITY INVOKER: the dynamic SQL executes
-- with the tested API role and therefore observes its real grants and RLS.
CREATE FUNCTION pg_temp.f07_assert_count(
  p_sql text, p_expected bigint, p_label text
) RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_actual bigint;
BEGIN
  EXECUTE p_sql INTO v_actual;
  IF v_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION
      'F07_FAIL: % expected %, received %',
      p_label, p_expected, v_actual;
  END IF;
END;
$function$;

CREATE FUNCTION pg_temp.f07_assert_affected(
  p_sql text, p_expected bigint, p_label text
) RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_actual bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_actual = ROW_COUNT;
  IF v_actual IS DISTINCT FROM p_expected THEN
    RAISE EXCEPTION
      'F07_FAIL: % expected affected rows %, received %',
      p_label, p_expected, v_actual;
  END IF;
END;
$function$;

CREATE FUNCTION pg_temp.f07_assert_denied(
  p_sql text, p_label text
) RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_state text;
  v_message text;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_state = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;

    IF v_state IN ('42501','P0001')
       AND v_message NOT LIKE 'F07_SENTINEL:%' THEN
      RETURN;
    END IF;

    RAISE EXCEPTION
      'F07_FAIL: % failed unexpectedly [%] %',
      p_label, v_state, v_message;
  END;

  RAISE EXCEPTION 'F07_SENTINEL: % unexpectedly succeeded', p_label;
END;
$function$;

GRANT EXECUTE ON FUNCTION pg_temp.f07_assert_count(text,bigint,text)
  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.f07_assert_affected(text,bigint,text)
  TO authenticated, anon;
GRANT EXECUTE ON FUNCTION pg_temp.f07_assert_denied(text,text)
  TO authenticated, anon;

-- Customer A and B: rows stay within each customer's identity boundary.
SET LOCAL ROLE authenticated;

DO $f07_customers$
DECLARE
  a record;
BEGIN
  FOR a IN
    SELECT * FROM (VALUES
      (
        current_setting('app.f07_customer_a_id')::uuid,
        current_setting('app.f07_booking_a_id')::uuid,
        current_setting('app.f07_booking_b_id')::uuid,
        current_setting('app.f07_address_a_id')::uuid,
        current_setting('app.f07_address_b_id')::uuid,
        current_setting('app.f07_payment_a_id')::uuid,
        current_setting('app.f07_payment_b_id')::uuid,
        current_setting('app.f07_conversation_a_id')::uuid,
        current_setting('app.f07_conversation_b_id')::uuid,
        current_setting('app.f07_worker_a_id')::uuid,
        current_setting('app.f07_worker_b_id')::uuid,
        'Customer A'::text
      ),
      (
        current_setting('app.f07_customer_b_id')::uuid,
        current_setting('app.f07_booking_b_id')::uuid,
        current_setting('app.f07_booking_a_id')::uuid,
        current_setting('app.f07_address_b_id')::uuid,
        current_setting('app.f07_address_a_id')::uuid,
        current_setting('app.f07_payment_b_id')::uuid,
        current_setting('app.f07_payment_a_id')::uuid,
        current_setting('app.f07_conversation_b_id')::uuid,
        current_setting('app.f07_conversation_a_id')::uuid,
        current_setting('app.f07_worker_b_id')::uuid,
        current_setting('app.f07_worker_a_id')::uuid,
        'Customer B'::text
      )
    ) AS x(
      actor_id, own_booking, other_booking, own_address, other_address,
      own_payment, other_payment, own_conversation, other_conversation,
      own_worker, other_worker, actor_label
    )
  LOOP
    PERFORM set_config('request.jwt.claim.sub', a.actor_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config(
      'request.jwt.claims',
      jsonb_build_object('sub',a.actor_id,'role','authenticated')::text,
      true
    );

    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.profiles WHERE id=%L::uuid',a.actor_id),
      1, a.actor_label || ' can read own profile'
    );
    PERFORM pg_temp.f07_assert_count(
      format(
        'SELECT count(*) FROM public.profiles WHERE id=%L::uuid',
        CASE WHEN a.actor_id = current_setting('app.f07_customer_a_id')::uuid
          THEN current_setting('app.f07_customer_b_id')::uuid
          ELSE current_setting('app.f07_customer_a_id')::uuid
        END
      ),
      0, a.actor_label || ' cannot read the other profile'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.bookings WHERE id=%L::uuid',a.own_booking),
      1, a.actor_label || ' can read own booking'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.bookings WHERE id=%L::uuid',a.other_booking),
      0, a.actor_label || ' cannot read the other booking'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.addresses WHERE id=%L::uuid',a.own_address),
      1, a.actor_label || ' can read own address'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.addresses WHERE id=%L::uuid',a.other_address),
      0, a.actor_label || ' cannot read the other address'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.payments WHERE id=%L::uuid',a.own_payment),
      1, a.actor_label || ' can read own booking payment'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.payments WHERE id=%L::uuid',a.other_payment),
      0, a.actor_label || ' cannot read the other payment'
    );
    PERFORM pg_temp.f07_assert_count(
      format(
        'SELECT count(*) FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id WHERE c.id=%L::uuid',
        a.own_conversation
      ),
      2, a.actor_label || ' can read own conversation messages'
    );
    PERFORM pg_temp.f07_assert_count(
      format(
        'SELECT count(*) FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id WHERE c.id=%L::uuid',
        a.other_conversation
      ),
      0, a.actor_label || ' cannot read the other conversation messages'
    );

    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.conversations WHERE id=%L::uuid',
             a.own_conversation),
      1, a.actor_label || ' can read own conversation'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.conversations WHERE id=%L::uuid',
             a.other_conversation),
      0, a.actor_label || ' cannot read the other conversation'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_locations WHERE worker_id=%L::uuid',
             a.own_worker),
      1, a.actor_label || ' can read the assigned worker location'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_locations WHERE worker_id=%L::uuid',
             a.other_worker),
      0, a.actor_label || ' cannot read an unrelated worker location'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.payment_refunds WHERE booking_id=%L::uuid',a.own_booking),
      0, a.actor_label || ' cannot read refund rows'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.support_tickets WHERE user_id=%L::uuid',a.actor_id),
      1, a.actor_label || ' can read own support ticket'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.support_tickets WHERE user_id=%L::uuid',
             CASE WHEN a.actor_id = current_setting('app.f07_customer_a_id')::uuid
                  THEN current_setting('app.f07_customer_b_id')::uuid
                  ELSE current_setting('app.f07_customer_a_id')::uuid END),
      0, a.actor_label || ' cannot read the other support ticket'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_profiles WHERE id=%L::uuid OR id=%L::uuid',
             a.own_worker,a.other_worker),
      0, a.actor_label || ' cannot read worker-private profiles'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_applications WHERE worker_id=%L::uuid',
             a.own_worker),
      0, a.actor_label || ' cannot read worker applications'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_documents WHERE worker_id=%L::uuid',
             a.own_worker),
      0, a.actor_label || ' cannot read worker documents'
    );

    PERFORM pg_temp.f07_assert_affected(
      format('UPDATE public.addresses SET label=label WHERE id=%L::uuid',a.other_address),
      0, a.actor_label || ' cannot update another customer address'
    );
    PERFORM pg_temp.f07_assert_affected(
      format('DELETE FROM public.addresses WHERE id=%L::uuid',a.other_address),
      0, a.actor_label || ' cannot delete another customer address'
    );
    PERFORM pg_temp.f07_assert_affected(
      format('UPDATE public.profiles SET full_name=full_name WHERE id=%L::uuid',
             CASE WHEN a.actor_id = current_setting('app.f07_customer_a_id')::uuid
                  THEN current_setting('app.f07_customer_b_id')::uuid
                  ELSE current_setting('app.f07_customer_a_id')::uuid END),
      0, a.actor_label || ' cannot update another profile'
    );

    PERFORM pg_temp.f07_assert_denied(
      format(
        'INSERT INTO public.addresses(user_id,address_line,latitude,longitude,location) VALUES (%L::uuid,''F07 forged owner'',28.6,77.2,ST_SetSRID(ST_MakePoint(77.2,28.6),4326)::geography)',
        CASE WHEN a.actor_id = current_setting('app.f07_customer_a_id')::uuid
             THEN current_setting('app.f07_customer_b_id')::uuid
             ELSE current_setting('app.f07_customer_a_id')::uuid END
      ),
      a.actor_label || ' cannot insert an address for another user'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('UPDATE public.bookings SET notes=''forged'' WHERE id=%L::uuid',a.own_booking),
      a.actor_label || ' cannot directly update bookings'
    );

    PERFORM pg_temp.f07_assert_denied(
      format('DELETE FROM public.bookings WHERE id=%L::uuid', a.own_booking),
      a.actor_label || ' cannot directly delete bookings'
    );
    PERFORM pg_temp.f07_assert_denied(
      format(
        $sql$INSERT INTO public.bookings
          (customer_id,service_id,address_id,duration_value,duration_unit,
           scheduled_start,scheduled_end,service_variant_id)
          VALUES (%L::uuid,%L::uuid,%L::uuid,1,'hour',
                  now(),now()+interval '1 hour',%L::uuid)$sql$,
        a.actor_id,
        current_setting('app.f07_service_id'),
        a.own_address,
        current_setting('app.f07_variant_id')
      ),
      a.actor_label || ' cannot directly insert bookings'
    );

    PERFORM pg_temp.f07_assert_denied(
      format(
        'INSERT INTO public.payments(booking_id,amount,currency,status) VALUES (%L::uuid,1,''INR'',''pending'')',
        a.own_booking
      ),
      a.actor_label || ' cannot directly insert payments'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('UPDATE public.payments SET amount=amount WHERE id=%L::uuid',
             a.own_payment),
      a.actor_label || ' cannot directly update payments'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('DELETE FROM public.payments WHERE id=%L::uuid', a.own_payment),
      a.actor_label || ' cannot directly delete payments'
    );

    PERFORM pg_temp.f07_assert_denied(
      format(
        'INSERT INTO public.payment_refunds(payment_id,booking_id,amount,currency) VALUES (%L::uuid,%L::uuid,1,''INR'')',
        a.own_payment, a.own_booking
      ),
      a.actor_label || ' cannot directly insert refunds'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('UPDATE public.payment_refunds SET amount=amount WHERE booking_id=%L::uuid',
             a.own_booking),
      a.actor_label || ' cannot directly update refunds'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('DELETE FROM public.payment_refunds WHERE booking_id=%L::uuid',
             a.own_booking),
      a.actor_label || ' cannot directly delete refunds'
    );

    PERFORM pg_temp.f07_assert_denied(
      format(
        'INSERT INTO public.support_tickets(user_id,category,subject,description) VALUES (%L::uuid,''technical'',''F07 forged ticket'',''F07 test'')',
        a.actor_id
      ),
      a.actor_label || ' cannot directly insert support tickets'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('UPDATE public.support_tickets SET status=status WHERE user_id=%L::uuid',
             a.actor_id),
      a.actor_label || ' cannot directly update support tickets'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('DELETE FROM public.support_tickets WHERE user_id=%L::uuid',
             a.actor_id),
      a.actor_label || ' cannot directly delete support tickets'
    );

    PERFORM pg_temp.f07_assert_denied(
      format(
        'INSERT INTO public.worker_payout_accounts(worker_id,account_type) VALUES (%L::uuid,''bank_account'')',
        a.own_worker
      ),
      a.actor_label || ' cannot directly insert payout accounts'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('UPDATE public.worker_payout_accounts SET account_type=account_type WHERE worker_id=%L::uuid',
             a.own_worker),
      a.actor_label || ' cannot directly update payout accounts'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('DELETE FROM public.worker_payout_accounts WHERE worker_id=%L::uuid',
             a.own_worker),
      a.actor_label || ' cannot directly delete payout accounts'
    );
    PERFORM pg_temp.f07_assert_denied(
      format(
        'INSERT INTO public.worker_payouts(worker_id,idempotency_key,amount) VALUES (%L::uuid,%L,1)',
        a.own_worker, 'f07-forged-' || a.actor_id::text
      ),
      a.actor_label || ' cannot directly insert payouts'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('UPDATE public.worker_payouts SET amount=amount WHERE worker_id=%L::uuid',
             a.own_worker),
      a.actor_label || ' cannot directly update payouts'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('DELETE FROM public.worker_payouts WHERE worker_id=%L::uuid',
             a.own_worker),
      a.actor_label || ' cannot directly delete payouts'
    );

    PERFORM pg_temp.f07_assert_denied(
      format(
        'INSERT INTO public.worker_locations(worker_id,booking_id,latitude,longitude) VALUES (%L::uuid,%L::uuid,28.6,77.2)',
        a.own_worker, a.own_booking
      ),
      a.actor_label || ' cannot forge a worker location'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('DELETE FROM public.messages WHERE conversation_id=%L::uuid',a.own_conversation),
      a.actor_label || ' cannot directly delete messages'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('INSERT INTO public.messages(conversation_id,sender_id,sender_role,message_type,body) VALUES (%L::uuid,%L::uuid,''customer'',''text'',''F07 unauthorized cross-conversation message'')',
             a.other_conversation,a.actor_id),
      a.actor_label || ' cannot send a message into another conversation'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('UPDATE public.profiles SET role=''admin''::public.user_role WHERE id=%L::uuid',a.actor_id),
      a.actor_label || ' cannot promote own profile to admin'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('SELECT public.admin_update_support_ticket(gen_random_uuid(),''closed'',''F07'')'),
      a.actor_label || ' cannot call the admin ticket mutation'
    );
    PERFORM pg_temp.f07_assert_denied(
      'SELECT count(*) FROM public.worker_payouts',
      a.actor_label || ' cannot directly read payout rows'
    );
    PERFORM pg_temp.f07_assert_denied(
      'SELECT count(*) FROM public.worker_payout_accounts',
      a.actor_label || ' cannot directly read payout account rows'
    );
  END LOOP;
END
$f07_customers$;

-- Worker A and B: bookings, documents, locations, and payout RPCs are
-- restricted to the authenticated worker's identity.
DO $f07_workers$
DECLARE
  a record;
BEGIN
  FOR a IN
    SELECT * FROM (VALUES
      (
        current_setting('app.f07_worker_a_id')::uuid,
        current_setting('app.f07_booking_a_id')::uuid,
        current_setting('app.f07_booking_b_id')::uuid,
        current_setting('app.f07_worker_b_id')::uuid,
        current_setting('app.f07_application_a_id')::uuid,
        current_setting('app.f07_application_b_id')::uuid,
        current_setting('app.f07_conversation_a_id')::uuid,
        current_setting('app.f07_conversation_b_id')::uuid,
        'Worker A'::text
      ),
      (
        current_setting('app.f07_worker_b_id')::uuid,
        current_setting('app.f07_booking_b_id')::uuid,
        current_setting('app.f07_booking_a_id')::uuid,
        current_setting('app.f07_worker_a_id')::uuid,
        current_setting('app.f07_application_b_id')::uuid,
        current_setting('app.f07_application_a_id')::uuid,
        current_setting('app.f07_conversation_b_id')::uuid,
        current_setting('app.f07_conversation_a_id')::uuid,
        'Worker B'::text
      )
    ) AS x(
      actor_id, own_booking, other_booking, other_worker,
      own_application, other_application, own_conversation,
      other_conversation, actor_label
    )
  LOOP
    PERFORM set_config('request.jwt.claim.sub', a.actor_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config(
      'request.jwt.claims',
      jsonb_build_object('sub',a.actor_id,'role','authenticated')::text,
      true
    );

    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_profiles WHERE id=%L::uuid',a.actor_id),
      1, a.actor_label || ' can read own worker profile'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_profiles WHERE id=%L::uuid',a.other_worker),
      0, a.actor_label || ' cannot read another worker profile'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.bookings WHERE id=%L::uuid',a.own_booking),
      1, a.actor_label || ' can read own assigned booking'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.bookings WHERE id=%L::uuid',a.other_booking),
      0, a.actor_label || ' cannot read another worker booking'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_applications WHERE id=%L::uuid',a.own_application),
      1, a.actor_label || ' can read own application'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_applications WHERE id=%L::uuid',a.other_application),
      0, a.actor_label || ' cannot read another worker application'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_documents WHERE worker_id=%L::uuid',a.actor_id),
      1, a.actor_label || ' can read own documents'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_documents WHERE worker_id=%L::uuid',a.other_worker),
      0, a.actor_label || ' cannot read another worker documents'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_locations WHERE worker_id=%L::uuid',a.actor_id),
      1, a.actor_label || ' can read own locations'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_locations WHERE worker_id=%L::uuid',a.other_worker),
      0, a.actor_label || ' cannot read another worker locations'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.payments WHERE booking_id=%L::uuid',a.own_booking),
      1, a.actor_label || ' can read own booking payment'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.payments WHERE booking_id=%L::uuid',a.other_booking),
      0, a.actor_label || ' cannot read another booking payment'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id WHERE c.id=%L::uuid',
             a.own_conversation),
      2, a.actor_label || ' can read own conversation'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id WHERE c.id=%L::uuid',
             a.other_conversation),
      0, a.actor_label || ' cannot read another worker conversation'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_list_payouts(50) WHERE worker_id=%L::uuid',a.actor_id),
      1, a.actor_label || ' can list own payout'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_list_payouts(50) WHERE worker_id=%L::uuid',a.other_worker),
      0, a.actor_label || ' cannot list another worker payout'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_list_payout_accounts() WHERE worker_id=%L::uuid',a.actor_id),
      1, a.actor_label || ' can list own payout account'
    );
    PERFORM pg_temp.f07_assert_count(
      format('SELECT count(*) FROM public.worker_list_payout_accounts() WHERE worker_id=%L::uuid',a.other_worker),
      0, a.actor_label || ' cannot list another worker payout account'
    );

    PERFORM pg_temp.f07_assert_denied(
      format('UPDATE public.worker_profiles SET is_verified=true WHERE id=%L::uuid',a.actor_id),
      a.actor_label || ' cannot directly update worker profile'
    );
    PERFORM pg_temp.f07_assert_affected(
      format('UPDATE public.worker_documents SET file_name=file_name WHERE worker_id=%L::uuid',a.other_worker),
      0, a.actor_label || ' cannot update another worker document'
    );

    PERFORM pg_temp.f07_assert_denied(
      format(
        'UPDATE public.worker_documents SET status=''approved''::public.worker_document_status WHERE worker_id=%L::uuid',
        a.actor_id
      ),
      a.actor_label || ' cannot approve own document'
    );
    PERFORM pg_temp.f07_assert_denied(
      format(
        'INSERT INTO public.worker_documents(application_id,worker_id,document_type,file_path,file_name,mime_type,file_size,status) VALUES (%L::uuid,%L::uuid,''pan''::public.worker_document_type,%L,''f07-forged.pdf'',''application/pdf'',100,''pending''::public.worker_document_status)',
        a.other_application, a.other_worker,
        a.other_worker::text || '/pan/f07-forged.pdf'
      ),
      a.actor_label || ' cannot upload a document for another worker'
    );
    PERFORM pg_temp.f07_assert_denied(
      format(
        'INSERT INTO public.worker_locations(worker_id,booking_id,latitude,longitude) VALUES (%L::uuid,%L::uuid,28.6,77.2)',
        a.other_worker, a.other_booking
      ),
      a.actor_label || ' cannot write another worker location'
    );
    PERFORM pg_temp.f07_assert_denied(
      format(
        'INSERT INTO public.worker_applications(worker_id,onboarding_type) VALUES (%L::uuid,''self_registered'')',
        a.actor_id
      ),
      a.actor_label || ' cannot directly insert worker applications'
    );
    PERFORM pg_temp.f07_assert_denied(
      format(
        'UPDATE public.worker_applications SET status=status WHERE worker_id=%L::uuid',
        a.actor_id
      ),
      a.actor_label || ' cannot directly update worker applications'
    );
    PERFORM pg_temp.f07_assert_denied(
      format(
        'DELETE FROM public.worker_applications WHERE worker_id=%L::uuid',
        a.actor_id
      ),
      a.actor_label || ' cannot directly delete worker applications'
    );
    PERFORM pg_temp.f07_assert_denied(
      format('DELETE FROM public.worker_documents WHERE worker_id=%L::uuid',a.actor_id),
      a.actor_label || ' cannot directly delete worker documents'
    );
    PERFORM pg_temp.f07_assert_denied(
      'SELECT public.admin_update_support_ticket(gen_random_uuid(),''closed'',''F07'')',
      a.actor_label || ' cannot call the admin ticket mutation'
    );
  END LOOP;
END
$f07_workers$;

-- An inactive customer retains own-profile read access for account-status UI,
-- but cannot access operational/customer data or mutate the profile.
DO $f07_inactive_customer$
DECLARE
  v_id uuid := current_setting('app.f07_inactive_customer_id')::uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',v_id,'role','authenticated')::text,true);

  PERFORM pg_temp.f07_assert_count(
    format('SELECT count(*) FROM public.profiles WHERE id=%L::uuid',v_id),
    1, 'Inactive customer can inspect own profile'
  );
  PERFORM pg_temp.f07_assert_count(
    format('SELECT count(*) FROM public.addresses WHERE user_id=%L::uuid',v_id),
    0, 'Inactive customer cannot read own addresses'
  );
  PERFORM pg_temp.f07_assert_count(
    format('SELECT count(*) FROM public.bookings WHERE customer_id=%L::uuid',v_id),
    0, 'Inactive customer cannot read own bookings'
  );
  PERFORM pg_temp.f07_assert_count(
    format('SELECT count(*) FROM public.support_tickets WHERE user_id=%L::uuid',v_id),
    0, 'Inactive customer cannot read own support tickets'
  );
  PERFORM pg_temp.f07_assert_denied(
    format('UPDATE public.profiles SET full_name=full_name WHERE id=%L::uuid',v_id),
    'Inactive customer cannot mutate own profile'
  );
  PERFORM pg_temp.f07_assert_denied(
    'SELECT public.worker_list_payouts(10)',
    'Customer cannot call worker payout RPC'
  );
END
$f07_inactive_customer$;

-- An inactive worker must not access documents, locations, bookings, or
-- payouts, even when rows still reference its user ID.
DO $f07_inactive_worker$
DECLARE
  v_id uuid := current_setting('app.f07_inactive_worker_id')::uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',v_id,'role','authenticated')::text,true);

  PERFORM pg_temp.f07_assert_count(
    format('SELECT count(*) FROM public.bookings WHERE worker_id=%L::uuid',v_id),
    0, 'Inactive worker cannot read own bookings'
  );
  PERFORM pg_temp.f07_assert_count(
    format('SELECT count(*) FROM public.worker_applications WHERE worker_id=%L::uuid',v_id),
    0, 'Inactive worker cannot read own application'
  );
  PERFORM pg_temp.f07_assert_count(
    format('SELECT count(*) FROM public.worker_documents WHERE worker_id=%L::uuid',v_id),
    0, 'Inactive worker cannot read own documents'
  );
  PERFORM pg_temp.f07_assert_count(
    format('SELECT count(*) FROM public.worker_locations WHERE worker_id=%L::uuid',v_id),
    0, 'Inactive worker cannot read own locations'
  );
  PERFORM pg_temp.f07_assert_denied(
    'SELECT * FROM public.worker_list_payouts(10)',
    'Inactive worker cannot use payout RPC'
  );
  PERFORM pg_temp.f07_assert_denied(
    'SELECT * FROM public.worker_list_payout_accounts()',
    'Inactive worker cannot use payout-account RPC'
  );
END
$f07_inactive_worker$;

-- Anonymous requests are rejected at the privilege layer for private tables.
RESET ROLE;
SET LOCAL ROLE anon;

DO $f07_anon$
BEGIN
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claim.role','anon',true);
  PERFORM set_config('request.jwt.claims','{"role":"anon"}',true);

  PERFORM pg_temp.f07_assert_denied(
    'SELECT * FROM public.bookings',
    'Anonymous user cannot read bookings'
  );
  PERFORM pg_temp.f07_assert_denied(
    'SELECT * FROM public.messages',
    'Anonymous user cannot read messages'
  );
  PERFORM pg_temp.f07_assert_denied(
    'SELECT * FROM public.conversations',
    'Anonymous user cannot read conversations'
  );
  PERFORM pg_temp.f07_assert_denied(
    'SELECT * FROM public.worker_profiles',
    'Anonymous user cannot read worker profiles'
  );
END
$f07_anon$;

-- Admin rows are visible where the policies explicitly permit admin access.
RESET ROLE;
SET LOCAL ROLE authenticated;

DO $f07_admin$
DECLARE
  v_id uuid := current_setting('app.f07_admin_id')::uuid;
  v_error text;
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',v_id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub',v_id,'role','authenticated')::text,true);

  PERFORM pg_temp.f07_assert_count(
    'SELECT count(*) FROM public.bookings',
    3, 'Admin can read all fixture bookings'
  );
  PERFORM pg_temp.f07_assert_count(
    'SELECT count(*) FROM public.worker_profiles',
    3, 'Admin can read all worker profiles'
  );
  PERFORM pg_temp.f07_assert_count(
    'SELECT count(*) FROM public.worker_documents',
    3, 'Admin can read all worker documents'
  );
  PERFORM pg_temp.f07_assert_count(
    'SELECT count(*) FROM public.payments',
    3, 'Admin can read all fixture payments'
  );
  PERFORM pg_temp.f07_assert_count(
    'SELECT count(*) FROM public.payment_refunds',
    3, 'Admin can read all fixture refunds'
  );
  PERFORM pg_temp.f07_assert_count(
    'SELECT count(*) FROM public.support_tickets',
    3, 'Admin can read all fixture support tickets'
  );

  v_error := NULL;
  BEGIN
    PERFORM public.admin_update_support_ticket(
      gen_random_uuid(),'closed','F07 admin guard verification'
    );
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
  END;

  IF v_error IS DISTINCT FROM 'Support ticket not found' THEN
    RAISE EXCEPTION
      'F07_FAIL: admin RPC did not pass the admin guard; received %',
      COALESCE(v_error,'no error');
  END IF;

  v_result := public.admin_list_payments();
  IF jsonb_array_length(v_result) <> 3 THEN
    RAISE EXCEPTION 'F07_FAIL: admin payment RPC returned unexpected result';
  END IF;

  v_result := public.admin_list_payment_refunds();
  IF jsonb_array_length(v_result) <> 3 THEN
    RAISE EXCEPTION 'F07_FAIL: admin refund RPC returned unexpected result';
  END IF;
END
$f07_admin$;

RESET ROLE;

\echo 'F07 authorization matrix passed'
ROLLBACK;
