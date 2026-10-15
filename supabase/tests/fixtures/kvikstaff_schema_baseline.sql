


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."booking_duration_unit" AS ENUM (
    'day',
    'week',
    'month',
    'hour'
);


ALTER TYPE "public"."booking_duration_unit" OWNER TO "postgres";


CREATE TYPE "public"."booking_fulfillment_type" AS ENUM (
    'instant',
    'scheduled',
    'recurring'
);


ALTER TYPE "public"."booking_fulfillment_type" OWNER TO "postgres";


CREATE TYPE "public"."booking_status" AS ENUM (
    'pending_payment',
    'paid',
    'searching_worker',
    'assigned',
    'on_the_way',
    'arrived',
    'in_progress',
    'completed',
    'cancelled',
    'expired',
    'payment_failed'
);


ALTER TYPE "public"."booking_status" OWNER TO "postgres";


CREATE TYPE "public"."booking_worker_offer_status" AS ENUM (
    'pending',
    'accepted',
    'declined',
    'expired',
    'cancelled'
);


ALTER TYPE "public"."booking_worker_offer_status" OWNER TO "postgres";


CREATE TYPE "public"."idempotency_status" AS ENUM (
    'in_progress',
    'completed',
    'failed'
);


ALTER TYPE "public"."idempotency_status" OWNER TO "postgres";


CREATE TYPE "public"."otp_status" AS ENUM (
    'pending',
    'verified',
    'expired',
    'failed'
);


ALTER TYPE "public"."otp_status" OWNER TO "postgres";


CREATE TYPE "public"."otp_type" AS ENUM (
    'start',
    'end'
);


ALTER TYPE "public"."otp_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'paid',
    'failed',
    'refunded',
    'partially_refunded'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'customer',
    'worker',
    'admin'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE TYPE "public"."worker_application_status" AS ENUM (
    'draft',
    'submitted',
    'under_review',
    'changes_required',
    'approved',
    'rejected'
);


ALTER TYPE "public"."worker_application_status" OWNER TO "postgres";


CREATE TYPE "public"."worker_document_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."worker_document_status" OWNER TO "postgres";


CREATE TYPE "public"."worker_document_type" AS ENUM (
    'aadhaar',
    'pan',
    'passport_photo',
    'address_proof',
    'police_verification',
    'bank_account'
);


ALTER TYPE "public"."worker_document_type" OWNER TO "postgres";


CREATE TYPE "public"."worker_status" AS ENUM (
    'offline',
    'available',
    'busy',
    'suspended'
);


ALTER TYPE "public"."worker_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."calculate_automatic_promotion_discount"("p_service_id" "uuid", "p_total_working_hours" numeric, "p_gross_amount" numeric, "p_currency" "text", "p_service_discount_amount" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_promotion_id uuid;
  v_promotion_title text;
  v_discount_type text;
  v_discount_value numeric(12,2);
  v_discount_currency text;
  v_minimum_hours numeric(12,2);
  v_maximum_discount_amount numeric(12,2);
  v_stackable boolean;
  v_priority integer;
  v_discount_base numeric(12,2);
  v_promotion_discount numeric(12,2);
begin
  if p_service_id is null
     or p_total_working_hours is null
     or p_total_working_hours < 0
     or p_gross_amount is null
     or p_gross_amount < 0 then
    return jsonb_build_object(
      'applied', false,
      'promotion_id', null,
      'promotion_title', null,
      'discount_type', null,
      'discount_value', 0,
      'discount_amount', 0
    );
  end if;

  select
    hp.id,
    hp.title,
    pr.discount_type,
    pr.discount_value,
    pr.discount_currency,
    pr.minimum_hours,
    pr.maximum_discount_amount,
    pr.stackable_with_duration_discount,
    pr.priority
  into
    v_promotion_id,
    v_promotion_title,
    v_discount_type,
    v_discount_value,
    v_discount_currency,
    v_minimum_hours,
    v_maximum_discount_amount,
    v_stackable,
    v_priority
  from public.home_promotions hp
  join public.promotion_rules pr
    on pr.promotion_id = hp.id
  where hp.is_active = true
    and (hp.starts_at is null or hp.starts_at <= now())
    and (hp.ends_at is null or hp.ends_at > now())
    and pr.is_active = true
    and pr.minimum_hours <= p_total_working_hours
    and (
      hp.service_id is null
      or hp.service_id = p_service_id
    )
    and (
      pr.discount_type = 'percent'
      or upper(pr.discount_currency) = upper(coalesce(p_currency, 'INR'))
    )
  order by
    pr.priority desc,
    hp.sort_order asc,
    pr.created_at desc
  limit 1;

  if v_promotion_id is null then
    return jsonb_build_object(
      'applied', false,
      'promotion_id', null,
      'promotion_title', null,
      'discount_type', null,
      'discount_value', 0,
      'discount_amount', 0,
      'stackable_with_duration_discount', false
    );
  end if;

  v_discount_base := round(
    case
      when v_stackable then greatest(
        p_gross_amount - coalesce(p_service_discount_amount, 0),
        0
      )
      else p_gross_amount
    end,
    2
  );

  if v_discount_type = 'percent' then
    v_promotion_discount := round(
      v_discount_base * v_discount_value / 100.0,
      2
    );

    if v_maximum_discount_amount is not null then
      v_promotion_discount := least(
        v_promotion_discount,
        v_maximum_discount_amount
      );
    end if;
  else
    v_promotion_discount := least(
      v_discount_base,
      v_discount_value
    );
  end if;

  v_promotion_discount := greatest(
    round(coalesce(v_promotion_discount, 0), 2),
    0
  );

  return jsonb_build_object(
    'applied', true,
    'promotion_id', v_promotion_id,
    'promotion_title', v_promotion_title,
    'discount_type', v_discount_type,
    'discount_value', v_discount_value,
    'discount_currency', v_discount_currency,
    'discount_amount', v_promotion_discount,
    'discount_base', v_discount_base,
    'minimum_hours', v_minimum_hours,
    'maximum_discount_amount', v_maximum_discount_amount,
    'stackable_with_duration_discount', v_stackable,
    'priority', v_priority
  );
end;
$$;


ALTER FUNCTION "private"."calculate_automatic_promotion_discount"("p_service_id" "uuid", "p_total_working_hours" numeric, "p_gross_amount" numeric, "p_currency" "text", "p_service_discount_amount" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."expire_past_active_customer_bookings"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_booking record;
  v_count integer := 0;
BEGIN
  FOR v_booking IN
    SELECT
      b.id,
      b.status
    FROM public.bookings b
    WHERE b.status IN (
      'paid'::public.booking_status,
      'searching_worker'::public.booking_status,
      'assigned'::public.booking_status
    )
      AND b.scheduled_end IS NOT NULL
      AND b.scheduled_end <= now()
    ORDER BY b.scheduled_end
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.bookings
    SET
      status = 'expired'::public.booking_status,
      updated_at = now()
    WHERE id = v_booking.id
      AND status = v_booking.status;

    IF FOUND THEN
      INSERT INTO public.booking_status_history (
        booking_id,
        old_status,
        new_status,
        changed_by,
        created_at
      )
      VALUES (
        v_booking.id,
        v_booking.status,
        'expired'::public.booking_status,
        NULL,
        now()
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "private"."expire_past_active_customer_bookings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."expire_past_unpaid_customer_bookings"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_booking record;
  v_count integer := 0;
BEGIN
  FOR v_booking IN
    SELECT
      b.id,
      b.status
    FROM public.bookings b
    WHERE b.status IN (
      'pending_payment'::public.booking_status,
      'payment_failed'::public.booking_status
    )
      AND b.fulfillment_type IN (
        'instant'::public.booking_fulfillment_type,
        'scheduled'::public.booking_fulfillment_type
      )
      AND b.scheduled_start IS NOT NULL
      AND b.scheduled_start <= now()
    ORDER BY b.scheduled_start
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.bookings
    SET status = 'expired'::public.booking_status,
        updated_at = now()
    WHERE id = v_booking.id
      AND status = v_booking.status;

    IF FOUND THEN
      INSERT INTO public.booking_status_history (
        booking_id,
        old_status,
        new_status,
        changed_by,
        created_at
      )
      VALUES (
        v_booking.id,
        v_booking.status,
        'expired'::public.booking_status,
        NULL,
        now()
      );

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "private"."expire_past_unpaid_customer_bookings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."get_customer_booking_refunds"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', pr.id,
            'booking_id', pr.booking_id,
            'occurrence_id', pr.occurrence_id,
            'amount', pr.amount,
            'currency', pr.currency,
            'status', pr.status,
            'requested_at', pr.requested_at,
            'processed_at', pr.processed_at
          )
          order by
            pr.requested_at desc,
            pr.created_at desc,
            pr.id desc
        )
        from public.payment_refunds pr
        where
          pr.booking_id = p_booking_id
          and exists (
            select 1
            from public.bookings b
            where
              b.id = p_booking_id
              and b.customer_id = (select auth.uid())
          )
      ),
      '[]'::jsonb
    );
$$;


ALTER FUNCTION "private"."get_customer_booking_refunds"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."profile_security_fields_unchanged"("p_user_id" "uuid", "p_role" "public"."user_role", "p_is_active" boolean) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.id = p_user_id
      and p.role = p_role
      and p.is_active = p_is_active
  );
$$;


ALTER FUNCTION "private"."profile_security_fields_unchanged"("p_user_id" "uuid", "p_role" "public"."user_role", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_booking_promotion_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_discount numeric(12,2);
  v_promotion_id uuid;
  v_promotion_text text;
begin
  v_discount := coalesce(
    (new.pricing_snapshot->>'discount_amount')::numeric,
    new.discount_amount,
    0
  );

  v_promotion_text := nullif(
    new.pricing_snapshot->>'promotion_id',
    ''
  );

  if v_promotion_text is not null then
    begin
      v_promotion_id := v_promotion_text::uuid;
    exception when invalid_text_representation then
      v_promotion_id := null;
    end;
  else
    v_promotion_id := new.applied_promotion_id;
  end if;

  new.discount_amount := greatest(round(v_discount, 2), 0);
  new.applied_promotion_id := v_promotion_id;

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_booking_promotion_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_occurrence_promotion_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'private'
    AS $$
declare
  v_discount numeric(12,2);
begin
  v_discount := coalesce(
    (new.pricing_snapshot->>'discount_amount')::numeric,
    (
      new.pricing_snapshot
      ->'pricing'
      ->>'discount_amount'
    )::numeric,
    new.discount_amount,
    0
  );

  new.discount_amount := greatest(round(v_discount, 2), 0);

  return new;
end;
$$;


ALTER FUNCTION "private"."sync_occurrence_promotion_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_assign_booking_worker"("p_booking_id" "uuid", "p_worker_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_old_worker uuid;
  v_old_status public.booking_status;
  v_before jsonb;
  v_after jsonb;
  v_address public.geography;
  v_worker_location public.geography;
  v_worker_radius numeric;
  v_result jsonb;
  v_is_scheduled boolean := false;
  v_old_worker_has_active boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_booking_id is null then
    raise exception 'Booking ID is required';
  end if;

  if p_worker_id is null then
    raise exception 'Worker is required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id=p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.status not in (
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status,
    'assigned'::public.booking_status
  ) then
    raise exception 'Booking cannot be assigned or reassigned in its current status';
  end if;

  if v_booking.worker_id is not null and v_booking.worker_id <> p_worker_id then
    perform 1
    from public.worker_profiles
    where id in (v_booking.worker_id, p_worker_id)
    order by id
    for update;
  else
    perform 1
    from public.worker_profiles
    where id=p_worker_id
    for update;
  end if;

  v_is_scheduled :=
    v_booking.fulfillment_type in (
      'scheduled'::public.booking_fulfillment_type,
      'recurring'::public.booking_fulfillment_type
    );

  if not exists (
    select 1
    from public.worker_profiles wp
    join public.profiles p
      on p.id=wp.id
    where wp.id=p_worker_id
      and p.role='worker'::public.user_role
      and p.is_active=true
      and wp.is_verified=true
      and wp.worker_status in (
        'available'::public.worker_status,
        'offline'::public.worker_status
      )
      and NOT public.worker_has_active_assignment(wp.id)
  ) then
    raise exception 'Selected worker is not an active, verified, eligible worker';
  end if;

  if not exists (
    select 1
    from public.worker_services ws
    where ws.worker_id=p_worker_id
      and ws.service_id=v_booking.service_id
  ) then
    raise exception 'Selected worker does not provide this service';
  end if;

  if v_is_scheduled then

    if exists (
      select 1
      from public.booking_schedule_occurrences o
      where o.booking_id=v_booking.id
    ) then
      if not public.worker_can_cover_scheduled_booking(
        v_booking.id,
        p_worker_id
      ) then
        raise exception 'Selected worker cannot cover the scheduled booking';
      end if;
    else
      if not public.worker_covers_booking_interval(
        v_booking.service_id,
        p_worker_id,
        v_booking.scheduled_start,
        v_booking.scheduled_end
      ) then
        raise exception 'Selected worker cannot cover the scheduled booking';
      end if;
    end if;

  else

    select wp.service_radius_km
    into v_worker_radius
    from public.worker_profiles wp
    where wp.id=p_worker_id;

    select coalesce(
      a.location,
      public.st_setsrid(
        public.st_makepoint(a.longitude,a.latitude),
        4326
      )::public.geography
    )
    into v_address
    from public.addresses a
    where a.id=v_booking.address_id;

    if v_address is null then
      raise exception 'Booking location is missing';
    end if;

    select wl.location
    into v_worker_location
    from public.worker_locations wl
    where wl.worker_id=p_worker_id
      and wl.recorded_at>=now()-interval '10 minutes'
      and wl.location is not null
    order by wl.recorded_at desc nulls last
    limit 1;

    if v_worker_location is null then
      raise exception 'Selected worker does not have a current location';
    end if;

    if v_worker_radius is null
       or v_worker_radius <= 0
       or not public.st_dwithin(
         v_worker_location,
         v_address,
         least(v_worker_radius,10)*1000
       )
       or not public.st_dwithin(
         v_worker_location,
         v_address,
         10000
       ) then
      raise exception 'Selected worker is outside the allowed service radius for this booking';
    end if;

    if exists (
      select 1
      from public.bookings b
      where b.worker_id=p_worker_id
        and b.id<>p_booking_id
        and b.status in (
          'assigned'::public.booking_status,
          'on_the_way'::public.booking_status,
          'arrived'::public.booking_status,
          'in_progress'::public.booking_status
        )
        and b.scheduled_start<v_booking.scheduled_end
        and b.scheduled_end>v_booking.scheduled_start
    ) then
      raise exception 'Selected worker is already booked during this time';
    end if;

  end if;

  v_old_worker:=v_booking.worker_id;
  v_old_status:=v_booking.status;
  v_before:=to_jsonb(v_booking);

  -- Availability is reconciled by the assignment triggers after the booking update.

  v_result:=public.transition_booking_state(
    v_booking.id,
    'assigned'::public.booking_status,
    p_worker_id,
    true,
    false
  );

  /*
   * Admin assignment is not worker acceptance.
   * Leave worker_accepted_at unchanged.
   */
  update public.booking_worker_offers
  set
    status='cancelled',
    responded_at=coalesce(responded_at,now()),
    updated_at=now()
  where booking_id=v_booking.id
    and status='pending';

  if not v_is_scheduled then
    perform set_config(
      'app.worker_profile_internal_mutation',
      'presence',
      true
    );

    update public.worker_profiles
    set worker_status='busy'::public.worker_status,
        updated_at=now()
    where id=p_worker_id;

    update public.worker_presence
    set is_available=false,
        expires_at=now(),
        updated_at=now()
    where worker_id=p_worker_id;
  end if;

  select to_jsonb(b)
  into v_after
  from public.bookings b
  where b.id=p_booking_id;

  perform public.write_admin_audit(
    case
      when v_old_worker is null
      then 'admin_assign_booking_worker'
      else 'admin_reassign_booking_worker'
    end,
    'booking',
    p_booking_id,
    v_before,
    v_after,
    jsonb_build_object(
      'old_worker_id',v_old_worker,
      'new_worker_id',p_worker_id,
      'scheduled_assignment',v_is_scheduled
    )
  );

  return jsonb_build_object(
    'success',true,
    'booking_id',p_booking_id,
    'worker_id',p_worker_id,
    'old_worker_id',v_old_worker,
    'old_status',v_old_status::text,
    'status',v_result->>'status',
    'scheduled_assignment',v_is_scheduled
  );
end;
$$;


ALTER FUNCTION "public"."admin_assign_booking_worker"("p_booking_id" "uuid", "p_worker_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_cancel_booking"("p_booking_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_refund public.payment_refunds%rowtype;
  v_occ record;
  v_before jsonb;
  v_after jsonb;
  v_old_status public.booking_status;
  v_transition jsonb;
  v_quote jsonb;
  v_quotes jsonb := '[]'::jsonb;
  v_quote_amount numeric := 0;
  v_total_refund numeric := 0;
  v_reserved_refund numeric := 0;
  v_cancelled_occurrences integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'Booking ID is required';
  END IF;

  SELECT b.*
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  v_before := to_jsonb(v_booking);
  v_old_status := v_booking.status;

  IF v_old_status = 'cancelled'::public.booking_status THEN
    RAISE EXCEPTION 'Booking is already cancelled';
  END IF;

  IF v_old_status IN (
    'completed'::public.booking_status,
    'expired'::public.booking_status
  ) THEN
    RAISE EXCEPTION 'Completed or expired bookings cannot be cancelled';
  END IF;

  -- Build the refund quote before changing any booking state.
  -- For recurring series, only non-completed, non-cancelled occurrences
  -- contribute to the refund total. Lock occurrences after the parent booking.
  IF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type THEN
    FOR v_occ IN
      SELECT id, occurrence_index, total_amount, scheduled_start, status
      FROM public.booking_schedule_occurrences
      WHERE booking_id = v_booking.id
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY occurrence_index
      FOR UPDATE
    LOOP
      v_quote := public.calculate_cancellation_refund(
        COALESCE(v_occ.total_amount, 0),
        v_occ.scheduled_start,
        now()
      );

      v_quote_amount := GREATEST(
        COALESCE((v_quote->>'refund_amount')::numeric, 0),
        0
      );
      v_total_refund := v_total_refund + v_quote_amount;
      v_cancelled_occurrences := v_cancelled_occurrences + 1;
      v_quotes := v_quotes || jsonb_build_array(
        jsonb_build_object(
          'occurrence_id', v_occ.id,
          'occurrence_index', v_occ.occurrence_index,
          'quote', v_quote
        )
      );
    END LOOP;
  ELSE
    v_quote := public.calculate_cancellation_refund(
      COALESCE(v_booking.total_amount, 0),
      v_booking.scheduled_start,
      now()
    );
    v_total_refund := GREATEST(
      COALESCE((v_quote->>'refund_amount')::numeric, 0),
      0
    );
  END IF;

  v_total_refund := round(v_total_refund, 2);

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE booking_id = v_booking.id
    AND status IN (
      'paid'::public.payment_status,
      'partially_refunded'::public.payment_status
    )
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_payment.id IS NOT NULL AND v_total_refund > 0 THEN
    SELECT COALESCE(SUM(pr.amount), 0)
    INTO v_reserved_refund
    FROM public.payment_refunds pr
    WHERE pr.payment_id = v_payment.id
      AND pr.status IN ('pending', 'processing', 'succeeded');

    IF v_reserved_refund + v_total_refund > v_payment.amount THEN
      RAISE EXCEPTION
        'Refund would exceed the remaining refundable amount; reconcile existing refunds before cancelling';
    END IF;
  END IF;

  v_transition := public.transition_booking_state(
    p_booking_id,
    'cancelled'::public.booking_status,
    NULL,
    false,
    true
  );

  IF v_payment.id IS NOT NULL AND v_total_refund > 0 THEN
    INSERT INTO public.payment_refunds (
      payment_id,
      booking_id,
      amount,
      currency,
      reason,
      status,
      requested_by,
      requested_at
    )
    VALUES (
      v_payment.id,
      v_booking.id,
      v_total_refund,
      v_payment.currency,
      COALESCE(NULLIF(TRIM(p_reason), ''), 'Admin booking cancellation'),
      'pending',
      auth.uid(),
      now()
    )
    RETURNING * INTO v_refund;
  END IF;

  SELECT to_jsonb(b)
  INTO v_after
  FROM public.bookings b
  WHERE b.id = p_booking_id;

  PERFORM public.write_admin_audit(
    'admin_cancel_booking',
    'booking',
    p_booking_id,
    v_before,
    v_after,
    jsonb_build_object(
      'reason', p_reason,
      'old_status', v_old_status::text,
      'new_status', 'cancelled',
      'payment_id', v_payment.id,
      'refund_id', v_refund.id,
      'refund_amount', COALESCE(v_refund.amount, 0),
      'refund_status', CASE
        WHEN v_refund.id IS NULL THEN NULL
        ELSE v_refund.status
      END,
      'refund_quote_amount', v_total_refund,
      'cancelled_occurrences', v_cancelled_occurrences
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'old_status', v_old_status::text,
    'status', 'cancelled',
    'worker_id', NULL,
    'transitioned', COALESCE((v_transition->>'transitioned')::boolean, true),
    'refund_amount', COALESCE(v_refund.amount, 0),
    'refund_id', v_refund.id,
    'refund_status', CASE
      WHEN v_refund.id IS NULL THEN NULL
      ELSE v_refund.status
    END,
    'refund_quote_amount', v_total_refund,
    'cancelled_occurrences', v_cancelled_occurrences,
    'refund_policy', CASE
      WHEN v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type
      THEN v_quotes
      ELSE v_quote
    END
  );
END;
$$;


ALTER FUNCTION "public"."admin_cancel_booking"("p_booking_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_cancel_booking_occurrence"("p_occurrence_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_occurrence_booking_id uuid;
  v_occ public.booking_schedule_occurrences%rowtype;
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_quote jsonb;
  v_refund public.payment_refunds%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_remaining integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'Occurrence ID is required';
  END IF;

  -- Discover the parent without locking the occurrence. Global lock order:
  -- parent booking first, then occurrence, then payment/refund rows.
  SELECT booking_id
  INTO v_occurrence_booking_id
  FROM public.booking_schedule_occurrences
  WHERE id = p_occurrence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence not found';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = v_occurrence_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent booking not found';
  END IF;

  SELECT *
  INTO v_occ
  FROM public.booking_schedule_occurrences
  WHERE id = p_occurrence_id
    AND booking_id = v_booking.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence not found or its parent changed';
  END IF;

  IF v_booking.fulfillment_type <> 'recurring'::public.booking_fulfillment_type THEN
    RAISE EXCEPTION 'Only recurring booking occurrences can be cancelled through the occurrence flow';
  END IF;

  v_before := to_jsonb(v_occ);

  IF v_occ.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Occurrence cannot be cancelled from status %', v_occ.status;
  END IF;

  v_quote := public.calculate_cancellation_refund(
    COALESCE(v_occ.total_amount, 0),
    v_occ.scheduled_start,
    now()
  );

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE booking_id = v_booking.id
    AND status IN ('paid', 'partially_refunded')
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_payment.id IS NOT NULL
     AND COALESCE((v_quote->>'refund_amount')::numeric, 0) > 0 THEN
    IF COALESCE((
      SELECT SUM(pr.amount)
      FROM public.payment_refunds pr
      WHERE pr.payment_id = v_payment.id
        AND pr.status IN ('pending', 'processing', 'succeeded')
    ), 0) + (v_quote->>'refund_amount')::numeric > v_payment.amount THEN
      RAISE EXCEPTION 'Refund would exceed remaining refundable amount';
    END IF;

    INSERT INTO public.payment_refunds(
      payment_id,
      booking_id,
      occurrence_id,
      amount,
      currency,
      reason,
      status,
      requested_by,
      requested_at
    )
    VALUES(
      v_payment.id,
      v_booking.id,
      v_occ.id,
      (v_quote->>'refund_amount')::numeric,
      v_payment.currency,
      COALESCE(NULLIF(TRIM(p_reason), ''), 'Admin occurrence cancellation'),
      'pending',
      auth.uid(),
      now()
    )
    RETURNING * INTO v_refund;
  END IF;

  UPDATE public.booking_schedule_occurrences
  SET status = 'cancelled',
      worker_id = NULL,
      updated_at = now(),
      last_modified_at = now(),
      last_modified_by = auth.uid()
  WHERE id = v_occ.id;

  SELECT COUNT(*)
  INTO v_remaining
  FROM public.booking_schedule_occurrences
  WHERE booking_id = v_booking.id
    AND status <> 'cancelled';

  IF v_remaining > 0 THEN
    UPDATE public.bookings
    SET scheduled_start = (
          SELECT MIN(o.scheduled_start)
          FROM public.booking_schedule_occurrences o
          WHERE o.booking_id = v_booking.id
            AND o.status <> 'cancelled'
        ),
        scheduled_end = (
          SELECT MAX(o.scheduled_end)
          FROM public.booking_schedule_occurrences o
          WHERE o.booking_id = v_booking.id
            AND o.status <> 'cancelled'
        ),
        updated_at = now()
    WHERE id = v_booking.id;
  ELSE
    PERFORM public.transition_booking_state(
      v_booking.id,
      'cancelled'::public.booking_status,
      NULL,
      false,
      true
    );
  END IF;

  SELECT to_jsonb(o)
  INTO v_after
  FROM public.booking_schedule_occurrences o
  WHERE o.id = v_occ.id;

  PERFORM public.write_admin_audit(
    'admin_cancel_booking_occurrence',
    'booking_occurrence',
    v_occ.id,
    v_before,
    v_after,
    jsonb_build_object(
      'booking_id', v_booking.id,
      'reason', p_reason,
      'refund_id', v_refund.id,
      'refund_amount', COALESCE(v_refund.amount, 0),
      'remaining_occurrences', v_remaining
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'occurrence_id', v_occ.id,
    'booking_id', v_booking.id,
    'status', 'cancelled',
    'refund_id', v_refund.id,
    'refund_amount', COALESCE(v_refund.amount, 0),
    'refund_status', CASE
      WHEN v_refund.id IS NULL THEN NULL
      ELSE v_refund.status
    END,
    'remaining_occurrences', v_remaining,
    'parent_cancelled', v_remaining = 0
  );
END;
$$;


ALTER FUNCTION "public"."admin_cancel_booking_occurrence"("p_occurrence_id" "uuid", "p_reason" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "notification_type" "text",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "booking_worker_offer_id" "uuid",
    CONSTRAINT "notifications_message_nonblank" CHECK (("btrim"("message") <> ''::"text")),
    CONSTRAINT "notifications_title_nonblank" CHECK (("btrim"("title") <> ''::"text")),
    CONSTRAINT "notifications_type_nonblank" CHECK ((("notification_type" IS NULL) OR ("btrim"("notification_type") <> ''::"text")))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_notification_type" "text" DEFAULT 'admin'::"text", "p_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."notifications"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_notification public.notifications;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_user_id is null then
    raise exception 'User is required';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.is_active = true
  ) then
    raise exception 'Active user not found';
  end if;
  if nullif(trim(p_title), '') is null then
    raise exception 'Notification title is required';
  end if;
  if nullif(trim(p_message), '') is null then
    raise exception 'Notification message is required';
  end if;
  if p_notification_type is not null and nullif(trim(p_notification_type), '') is null then
    raise exception 'Notification type cannot be blank';
  end if;
  if p_booking_id is not null and not exists (
    select 1 from public.bookings b where b.id = p_booking_id
  ) then
    raise exception 'Booking not found';
  end if;

  insert into public.notifications(
    user_id, booking_id, title, message, notification_type, is_read, created_at
  )
  values(
    p_user_id,
    p_booking_id,
    trim(p_title),
    trim(p_message),
    coalesce(nullif(trim(p_notification_type), ''), 'admin'),
    false,
    now()
  )
  returning * into v_notification;

  perform public.write_admin_audit(
    'create_notification',
    'notification',
    v_notification.id,
    null,
    to_jsonb(v_notification)
  );

  return v_notification;
end;
$$;


ALTER FUNCTION "public"."admin_create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_notification_type" "text", "p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text" DEFAULT NULL::"text", "p_hourly_price" numeric DEFAULT 0, "p_currency" "text" DEFAULT 'INR'::"text", "p_is_active" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_service public.services;
  v_variant public.service_variants;
  v_price public.service_variant_prices;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Service name is required';
  end if;

  if p_hourly_price is null or p_hourly_price < 0 then
    raise exception 'Hourly price cannot be negative';
  end if;

  if nullif(trim(coalesce(p_currency, '')), '') is null then
    raise exception 'Currency is required';
  end if;

  if exists (
    select 1
    from public.services s
    where lower(trim(s.name)) = lower(trim(p_name))
  ) then
    raise exception 'A service with this name already exists';
  end if;

  insert into public.services (
    name,
    description,
    is_active
  )
  values (
    trim(p_name),
    nullif(trim(p_description), ''),
    coalesce(p_is_active, true)
  )
  returning * into v_service;

  insert into public.service_variants (
    service_id,
    name,
    description,
    billing_type,
    duration_value,
    duration_unit,
    min_quantity,
    max_quantity,
    is_active,
    sort_order
  )
  values (
    v_service.id,
    'Hourly',
    'Hourly staffing service.',
    'hourly',
    null,
    null,
    1,
    null,
    true,
    0
  )
  returning * into v_variant;

  insert into public.service_variant_prices (
    service_variant_id,
    price,
    currency,
    effective_from,
    effective_to,
    is_active
  )
  values (
    v_variant.id,
    p_hourly_price,
    upper(trim(p_currency)),
    now(),
    null,
    true
  )
  returning * into v_price;

  perform public.write_admin_audit(
    'create_service',
    'service',
    v_service.id,
    null,
    jsonb_build_object(
      'service', to_jsonb(v_service),
      'variant', to_jsonb(v_variant),
      'price', to_jsonb(v_price)
    )
  );

  return jsonb_build_object(
    'service', to_jsonb(v_service),
    'variant', to_jsonb(v_variant),
    'price', to_jsonb(v_price)
  );
end;
$$;


ALTER FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text" DEFAULT NULL::"text", "p_hourly_price" numeric DEFAULT 0, "p_currency" "text" DEFAULT 'INR'::"text", "p_image_url" "text" DEFAULT NULL::"text", "p_is_active" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_service public.services;
  v_variant public.service_variants;
  v_variant_price public.service_variant_prices;
  v_hourly_price public.service_hourly_prices;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Service name is required';
  end if;

  if p_hourly_price is null or p_hourly_price < 0 then
    raise exception 'Hourly price cannot be negative';
  end if;

  if nullif(trim(coalesce(p_currency, '')), '') is null then
    raise exception 'Currency is required';
  end if;

  if p_image_url is not null and length(trim(p_image_url)) > 2048 then
    raise exception 'Image URL is too long';
  end if;

  if exists (
    select 1
    from public.services s
    where lower(trim(s.name)) = lower(trim(p_name))
  ) then
    raise exception 'A service with this name already exists';
  end if;

  insert into public.services (
    name,
    description,
    image_url,
    is_active
  )
  values (
    trim(p_name),
    nullif(trim(p_description), ''),
    nullif(trim(p_image_url), ''),
    coalesce(p_is_active, true)
  )
  returning * into v_service;

  insert into public.service_variants (
    service_id,
    name,
    description,
    billing_type,
    duration_value,
    duration_unit,
    min_quantity,
    max_quantity,
    is_active,
    sort_order
  )
  values (
    v_service.id,
    'Hourly',
    'Hourly staffing service.',
    'hourly',
    null,
    null,
    1,
    null,
    true,
    0
  )
  returning * into v_variant;

  insert into public.service_variant_prices (
    service_variant_id,
    price,
    currency,
    effective_from,
    effective_to,
    is_active
  )
  values (
    v_variant.id,
    p_hourly_price,
    upper(trim(p_currency)),
    now(),
    null,
    true
  )
  returning * into v_variant_price;

  insert into public.service_hourly_prices (
    service_id,
    price,
    currency,
    effective_from,
    effective_to,
    is_active
  )
  values (
    v_service.id,
    p_hourly_price,
    upper(trim(p_currency)),
    now(),
    null,
    true
  )
  returning * into v_hourly_price;

  perform public.write_admin_audit(
    'create_service',
    'service',
    v_service.id,
    null,
    jsonb_build_object(
      'service', to_jsonb(v_service),
      'variant', to_jsonb(v_variant),
      'variant_price', to_jsonb(v_variant_price),
      'hourly_price', to_jsonb(v_hourly_price)
    )
  );

  return jsonb_build_object(
    'service', to_jsonb(v_service),
    'variant', to_jsonb(v_variant),
    'variant_price', to_jsonb(v_variant_price),
    'hourly_price', to_jsonb(v_hourly_price)
  );
end;
$$;


ALTER FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_image_url" "text", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text" DEFAULT NULL::"text", "p_hourly_price" numeric DEFAULT 0, "p_currency" "text" DEFAULT 'INR'::"text", "p_image_url" "text" DEFAULT NULL::"text", "p_is_active" boolean DEFAULT true, "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_display_order" integer DEFAULT 0, "p_is_featured" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_service public.services;
  v_variant public.service_variants;
  v_variant_price public.service_variant_prices;
  v_hourly_price public.service_hourly_prices;
  v_category_id uuid := p_category_id;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Service name is required';
  end if;

  if p_hourly_price is null or p_hourly_price < 0 then
    raise exception 'Hourly price cannot be negative';
  end if;

  if nullif(trim(coalesce(p_currency, '')), '') is null then
    raise exception 'Currency is required';
  end if;

  if p_display_order is null or p_display_order < 0 then
    raise exception 'Display order cannot be negative';
  end if;

  if p_image_url is not null and length(trim(p_image_url)) > 2048 then
    raise exception 'Image URL is too long';
  end if;

  if v_category_id is null then
    select id into v_category_id
    from public.service_categories
    where slug = 'general'
      and is_active = true
    limit 1;
  end if;

  if v_category_id is not null and not exists (
    select 1 from public.service_categories
    where id = v_category_id and is_active = true
  ) then
    raise exception 'Category not found or inactive';
  end if;

  if exists (
    select 1 from public.services s
    where lower(trim(s.name)) = lower(trim(p_name))
  ) then
    raise exception 'A service with this name already exists';
  end if;

  insert into public.services (
    name, description, image_url, is_active,
    category_id, display_order, is_featured
  )
  values (
    trim(p_name),
    nullif(trim(p_description), ''),
    nullif(trim(p_image_url), ''),
    coalesce(p_is_active, true),
    v_category_id,
    coalesce(p_display_order, 0),
    coalesce(p_is_featured, false)
  )
  returning * into v_service;

  insert into public.service_variants (
    service_id, name, description, billing_type,
    duration_value, duration_unit, min_quantity,
    max_quantity, is_active, sort_order
  )
  values (
    v_service.id, 'Hourly', 'Hourly staffing service.',
    'hourly', null, null, 1, null, true, 0
  )
  returning * into v_variant;

  insert into public.service_variant_prices (
    service_variant_id, price, currency,
    effective_from, effective_to, is_active
  )
  values (
    v_variant.id, p_hourly_price, upper(trim(p_currency)),
    now(), null, true
  )
  returning * into v_variant_price;

  insert into public.service_hourly_prices (
    service_id, price, currency,
    effective_from, effective_to, is_active
  )
  values (
    v_service.id, p_hourly_price, upper(trim(p_currency)),
    now(), null, true
  )
  returning * into v_hourly_price;

  perform public.write_admin_audit(
    'create_service',
    'service',
    v_service.id,
    null,
    jsonb_build_object(
      'service', to_jsonb(v_service),
      'variant', to_jsonb(v_variant),
      'variant_price', to_jsonb(v_variant_price),
      'hourly_price', to_jsonb(v_hourly_price)
    )
  );

  return jsonb_build_object(
    'service', to_jsonb(v_service),
    'variant', to_jsonb(v_variant),
    'variant_price', to_jsonb(v_variant_price),
    'hourly_price', to_jsonb(v_hourly_price)
  );
end;
$$;


ALTER FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_image_url" "text", "p_is_active" boolean, "p_category_id" "uuid", "p_display_order" integer, "p_is_featured" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_payouts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "payout_account_id" "uuid",
    "provider" "text" DEFAULT 'razorpayx'::"text" NOT NULL,
    "provider_payout_id" "text",
    "idempotency_key" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "mode" "text",
    "purpose" "text" DEFAULT 'payout'::"text" NOT NULL,
    "failure_reason" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "provider_status" "text",
    "utr" "text",
    "provider_fee_amount" numeric DEFAULT 0 NOT NULL,
    "provider_tax_amount" numeric DEFAULT 0 NOT NULL,
    "provider_status_details" "jsonb",
    "provider_created_at" timestamp with time zone,
    "failure_code" "text",
    "last_reconciled_at" timestamp with time zone,
    "reconciliation_attempts" integer DEFAULT 0 NOT NULL,
    "reconciliation_error" "text",
    CONSTRAINT "worker_payouts_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "worker_payouts_currency_check" CHECK (("currency" = 'INR'::"text")),
    CONSTRAINT "worker_payouts_provider_check" CHECK (("provider" = 'razorpayx'::"text")),
    CONSTRAINT "worker_payouts_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'pending'::"text", 'rejected'::"text", 'processing'::"text", 'processed'::"text", 'cancelled'::"text", 'reversed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."worker_payouts" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_create_worker_payout"("p_worker_id" "uuid", "p_payout_account_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_mode" "text" DEFAULT NULL::"text") RETURNS "public"."worker_payouts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_payout public.worker_payouts%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  v_payout :=
    public.create_worker_payout_internal(
      p_worker_id,
      p_payout_account_id,
      p_amount,
      p_idempotency_key,
      p_mode
    );

  return v_payout;
end;
$$;


ALTER FUNCTION "public"."admin_create_worker_payout"("p_worker_id" "uuid", "p_payout_account_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_mode" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_booking_change_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "occurrence_id" "uuid",
    "request_type" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "requested_start" timestamp with time zone,
    "requested_end" timestamp with time zone,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "admin_notes" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_booking_change_requests_check" CHECK ((("request_type" <> 'reschedule'::"text") OR (("requested_start" IS NOT NULL) AND ("requested_end" IS NOT NULL) AND ("requested_end" > "requested_start")))),
    CONSTRAINT "worker_booking_change_requests_check1" CHECK ((("request_type" <> 'cancel'::"text") OR (("requested_start" IS NULL) AND ("requested_end" IS NULL)))),
    CONSTRAINT "worker_booking_change_requests_reason_check" CHECK ((("length"("btrim"("reason")) >= 1) AND ("length"("btrim"("reason")) <= 2000))),
    CONSTRAINT "worker_booking_change_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['cancel'::"text", 'reschedule'::"text"]))),
    CONSTRAINT "worker_booking_change_requests_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'approved'::"text", 'rejected'::"text", 'withdrawn'::"text"])))
);


ALTER TABLE "public"."worker_booking_change_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_execute_worker_booking_change_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_notes" "text" DEFAULT NULL::"text") RETURNS "public"."worker_booking_change_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_request public.worker_booking_change_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_occurrence public.booking_schedule_occurrences%rowtype;
  v_payment public.payments%rowtype;
  v_refund public.payment_refunds%rowtype;
  v_before jsonb;
  v_status text := lower(btrim(coalesce(p_decision, '')));
  v_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
  v_quote jsonb;
  v_timezone text := 'Asia/Kolkata';
  v_local_start timestamp;
  v_local_end timestamp;
  v_date date;
  v_old_date date;
  v_duration_seconds numeric;
  v_new_duration_seconds numeric;
  v_remaining integer;
  v_customer_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  if v_status not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select *
  into v_request
  from public.worker_booking_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Worker booking change request not found';
  end if;

  if v_request.status <> 'open' then
    raise exception 'Only open worker change requests can be reviewed';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = v_request.booking_id
  for update;

  if not found then
    raise exception 'Parent booking not found';
  end if;

  v_customer_id := v_booking.customer_id;
  v_before := to_jsonb(v_request);

  if v_status = 'rejected' then
    update public.worker_booking_change_requests
    set
      status = 'rejected',
      admin_notes = v_notes,
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      updated_at = now()
    where id = v_request.id
    returning * into v_request;

    perform public.write_admin_audit(
      'admin_reject_worker_booking_change_request',
      'worker_booking_change_request',
      v_request.id,
      v_before,
      to_jsonb(v_request),
      jsonb_build_object('status', 'rejected')
    );

    begin
      perform public.admin_create_notification(
        v_request.worker_id,
        'Change request rejected',
        case
          when v_request.request_type = 'cancel'
            then 'Your booking cancellation request was not approved.'
          else 'Your booking reschedule request was not approved.'
        end,
        'worker_booking_change_request',
        v_request.booking_id
      );
    exception when others then
      null;
    end;

    return v_request;
  end if;

  if v_request.occurrence_id is not null then
    select *
    into v_occurrence
    from public.booking_schedule_occurrences
    where id = v_request.occurrence_id
      and booking_id = v_request.booking_id
    for update;

    if not found then
      raise exception 'Booking occurrence not found';
    end if;

    if v_occurrence.worker_id is distinct from v_request.worker_id then
      raise exception 'Worker is no longer assigned to this occurrence';
    end if;
  elsif v_booking.worker_id is distinct from v_request.worker_id then
    raise exception 'Worker is no longer assigned to this booking';
  end if;

  if v_request.request_type = 'cancel' then
    if v_request.occurrence_id is not null then
      perform public.admin_cancel_booking_occurrence(
        v_request.occurrence_id,
        'Worker cancellation request approved'
      );
    else
      if v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type then
        raise exception 'Recurring booking cancellations require an occurrence request';
      end if;

      if v_booking.status <> 'assigned'::public.booking_status then
        raise exception 'Booking can no longer be cancelled through this worker request';
      end if;

      select *
      into v_payment
      from public.payments
      where booking_id = v_booking.id
        and status in ('paid','partially_refunded')
      order by updated_at desc
      limit 1
      for update;

      v_quote := public.calculate_cancellation_refund(
        coalesce(v_booking.total_amount, 0),
        v_booking.scheduled_start,
        now()
      );

      perform public.transition_booking_state(
        v_booking.id,
        'cancelled'::public.booking_status,
        null,
        false,
        true
      );

      if v_payment.id is not null
         and coalesce((v_quote->>'refund_amount')::numeric, 0) > 0 then

        if coalesce((
          select sum(pr.amount)
          from public.payment_refunds pr
          where pr.payment_id = v_payment.id
            and pr.status in ('pending','processing','succeeded')
        ), 0) + (v_quote->>'refund_amount')::numeric > v_payment.amount then
          raise exception 'Refund would exceed the remaining refundable amount';
        end if;

        insert into public.payment_refunds(
          payment_id,
          booking_id,
          amount,
          currency,
          reason,
          status,
          requested_by,
          requested_at
        )
        values(
          v_payment.id,
          v_booking.id,
          (v_quote->>'refund_amount')::numeric,
          v_payment.currency,
          'Worker cancellation request approved',
          'pending',
          (select auth.uid()),
          now()
        )
        returning * into v_refund;
      end if;
    end if;
  else
    select coalesce(
      nullif(trim(value->>'value'), ''),
      'Asia/Kolkata'
    )
    into v_timezone
    from public.platform_settings
    where key = 'operations.timezone'
      and is_active = true
    order by updated_at desc
    limit 1;

    v_timezone := coalesce(v_timezone, 'Asia/Kolkata');

    if v_request.requested_start is null
       or v_request.requested_end is null
       or v_request.requested_end <= v_request.requested_start
       or v_request.requested_start <= now() then
      raise exception 'Requested reschedule time is invalid or already passed';
    end if;

    if v_request.occurrence_id is null
       and v_booking.fulfillment_type <> 'scheduled'::public.booking_fulfillment_type then
      raise exception 'Only scheduled bookings can be rescheduled';
    end if;

    if v_request.occurrence_id is not null
       and v_occurrence.status not in ('scheduled','assigned') then
      raise exception 'Occurrence can no longer be rescheduled';
    end if;

    if v_request.occurrence_id is null
       and v_booking.status <> 'assigned'::public.booking_status then
      raise exception 'Booking can no longer be rescheduled';
    end if;

    v_duration_seconds := extract(
      epoch from (
        case
          when v_request.occurrence_id is null then v_booking.scheduled_end
          else v_occurrence.scheduled_end
        end
        -
        case
          when v_request.occurrence_id is null then v_booking.scheduled_start
          else v_occurrence.scheduled_start
        end
      )
    );

    v_new_duration_seconds := extract(
      epoch from (
        v_request.requested_end -
        v_request.requested_start
      )
    );

    if v_duration_seconds <> v_new_duration_seconds then
      raise exception 'Rescheduling must preserve the original booking duration';
    end if;

    v_local_start := v_request.requested_start at time zone v_timezone;
    v_local_end := v_request.requested_end at time zone v_timezone;
    v_date := v_local_start::date;

    if v_local_end::date <> v_date then
      raise exception 'Booking must start and end on the same local date';
    end if;

    if not public.is_booking_within_operating_hours(
      v_request.requested_start,
      v_request.requested_end
    ) then
      raise exception 'Requested working hours are outside configured operating hours';
    end if;

    if v_request.occurrence_id is null then
      v_old_date :=
        (v_booking.scheduled_start at time zone v_timezone)::date;

      update public.booking_worker_offers
      set
        status = 'cancelled',
        responded_at = coalesce(responded_at, now()),
        updated_at = now()
      where booking_id = v_booking.id
        and status = 'pending';

      perform public.transition_booking_state(
        v_booking.id,
        'searching_worker'::public.booking_status,
        null,
        false,
        true
      );

      update public.bookings
      set
        scheduled_start = v_request.requested_start,
        scheduled_end = v_request.requested_end,
        schedule_start_date = v_date,
        schedule_end_date = v_date,
        daily_start_time = v_local_start::time,
        daily_end_time = v_local_end::time,
        selected_weekdays = array[
          extract(dow from v_date)::smallint
        ],
        off_dates = '{}'::date[],
        updated_at = now()
      where id = v_booking.id;

      update public.booking_schedule_occurrences
      set
        occurrence_date = v_date,
        scheduled_start = v_request.requested_start,
        scheduled_end = v_request.requested_end,
        original_occurrence_date =
          coalesce(original_occurrence_date, v_old_date),
        worker_id = null,
        status = 'scheduled',
        last_modified_at = now(),
        last_modified_by = (select auth.uid()),
        updated_at = now()
      where id = (
        select o.id
        from public.booking_schedule_occurrences o
        where o.booking_id = v_booking.id
        order by o.occurrence_index
        limit 1
      );
    else
      v_old_date := (
        v_occurrence.scheduled_start at time zone v_timezone
      )::date;

      update public.booking_schedule_occurrences
      set
        occurrence_date = v_date,
        scheduled_start = v_request.requested_start,
        scheduled_end = v_request.requested_end,
        original_occurrence_date =
          coalesce(original_occurrence_date, v_old_date),
        worker_id = null,
        status = 'scheduled',
        last_modified_at = now(),
        last_modified_by = (select auth.uid()),
        updated_at = now()
      where id = v_occurrence.id;

      select count(*)
      into v_remaining
      from public.booking_schedule_occurrences o
      where o.booking_id = v_booking.id
        and o.status <> 'cancelled';

      if v_remaining > 0 then
        update public.bookings
        set
          scheduled_start = (
            select min(o.scheduled_start)
            from public.booking_schedule_occurrences o
            where o.booking_id = v_booking.id
              and o.status <> 'cancelled'
          ),
          scheduled_end = (
            select max(o.scheduled_end)
            from public.booking_schedule_occurrences o
            where o.booking_id = v_booking.id
              and o.status <> 'cancelled'
          ),
          updated_at = now()
        where id = v_booking.id;
      end if;
    end if;
  end if;

  update public.worker_booking_change_requests
  set
    status = 'approved',
    admin_notes = v_notes,
    reviewed_at = now(),
    reviewed_by = (select auth.uid()),
    updated_at = now()
  where id = v_request.id
  returning * into v_request;

  perform public.write_admin_audit(
    'admin_approve_worker_booking_change_request',
    'worker_booking_change_request',
    v_request.id,
    v_before,
    to_jsonb(v_request),
    jsonb_build_object(
      'request_type', v_request.request_type,
      'booking_id', v_request.booking_id,
      'occurrence_id', v_request.occurrence_id
    )
  );

  begin
    perform public.admin_create_notification(
      v_request.worker_id,
      'Change request approved',
      case
        when v_request.request_type = 'cancel'
          then 'Your booking cancellation request was approved.'
        else 'Your booking reschedule request was approved.'
      end,
      'worker_booking_change_request',
      v_request.booking_id
    );
  exception when others then
    null;
  end;

  begin
    if v_customer_id is not null then
      perform public.admin_create_notification(
        v_customer_id,
        case
          when v_request.request_type = 'cancel'
            then 'Booking cancelled'
          else 'Booking rescheduled'
        end,
        case
          when v_request.request_type = 'cancel'
            then 'Your booking was cancelled after a worker change request was approved.'
          when v_request.occurrence_id is not null
            then 'One scheduled occurrence was rescheduled after a worker change request was approved.'
          else
            'Your scheduled booking was rescheduled after a worker change request was approved.'
        end,
        'worker_booking_change_request',
        v_request.booking_id
      );
    end if;
  exception when others then
    null;
  end;

  return v_request;
end;
$$;


ALTER FUNCTION "public"."admin_execute_worker_booking_change_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_booking_detail"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_customer jsonb;
  v_worker jsonb;
  v_service jsonb;
  v_variant jsonb;
  v_address jsonb;
  v_payment jsonb;
  v_refunds jsonb;
  v_refund_requests jsonb;
  v_occurrences jsonb;
  v_status_history jsonb;
  v_audit_logs jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  select to_jsonb(x) into v_customer
  from (
    select p.id, p.full_name, p.email, p.phone
    from public.profiles p
    where p.id = v_booking.customer_id
  ) x;

  select to_jsonb(x) into v_worker
  from (
    select p.id, p.full_name, p.email, p.phone,
           wp.worker_status, wp.is_verified, wp.rating,
           wp.total_completed_jobs, wp.service_radius_km
    from public.profiles p
    left join public.worker_profiles wp on wp.id = p.id
    where p.id = v_booking.worker_id
  ) x;

  select to_jsonb(x) into v_service
  from (
    select id, name, description, is_active
    from public.services where id = v_booking.service_id
  ) x;

  select to_jsonb(x) into v_variant
  from (
    select id, name, description, billing_type, duration_value,
           duration_unit, min_quantity, max_quantity, is_active
    from public.service_variants
    where id = v_booking.service_variant_id
  ) x;

  select to_jsonb(x) into v_address
  from (
    select id, user_id, label, address_line, latitude, longitude
    from public.addresses where id = v_booking.address_id
  ) x;

  select to_jsonb(x) into v_payment
  from (
    select id, booking_id, provider, provider_order_id,
           provider_payment_id, amount, currency, status,
           paid_at, created_at, updated_at
    from public.payments
    where booking_id = p_booking_id
    order by created_at desc limit 1
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_refunds
  from (
    select id, payment_id, booking_id, amount, currency, reason,
           status, provider_refund_id, failure_reason,
           requested_by, requested_at, processed_at,
           created_at, updated_at, refund_request_id
    from public.payment_refunds
    where booking_id = p_booking_id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_refund_requests
  from (
    select id, booking_id, payment_id, amount, currency,
           status, reason, provider_refund_id,
           requested_at, processed_at, created_at, updated_at
    from public.refund_requests
    where booking_id = p_booking_id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurrence_index), '[]'::jsonb)
  into v_occurrences
  from (
    select id, booking_id, worker_id, occurrence_index,
           occurrence_date, scheduled_start, scheduled_end,
           status, created_at, updated_at,
           base_amount, discount_amount, platform_fee,
           tax_amount, total_amount,
           journey_started_at, arrived_at, started_at,
           start_otp_verified_at, completed_at, end_otp_verified_at,
           original_occurrence_date, last_modified_at, last_modified_by
    from public.booking_schedule_occurrences
    where booking_id = p_booking_id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_status_history
  from (
    select id, booking_id,
           old_status::text as old_status,
           new_status::text as new_status,
           changed_by,
           created_at
    from public.booking_status_history
    where booking_id = p_booking_id
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
  into v_audit_logs
  from (
    select id, admin_id, action, entity_type, entity_id,
           metadata, created_at
    from public.admin_audit_logs
    where entity_type = 'booking'
      and entity_id = p_booking_id
    order by created_at desc
    limit 100
  ) x;

  return jsonb_build_object(
    'booking', to_jsonb(v_booking),
    'customer', coalesce(v_customer, '{}'::jsonb),
    'worker', coalesce(v_worker, '{}'::jsonb),
    'service', coalesce(v_service, '{}'::jsonb),
    'variant', coalesce(v_variant, '{}'::jsonb),
    'address', coalesce(v_address, '{}'::jsonb),
    'payment', coalesce(v_payment, '{}'::jsonb),
    'refunds', v_refunds,
    'refund_requests', v_refund_requests,
    'occurrences', v_occurrences,
    'status_history', v_status_history,
    'audit_logs', v_audit_logs
  );
end;
$$;


ALTER FUNCTION "public"."admin_get_booking_detail"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_get_live_map_data"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'Admin or service-role access required';
  end if;

  select jsonb_build_object(
    'workers', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'worker_id', w.id,
          'name', p.full_name,
          'status', w.worker_status,
          'latitude', wl.latitude,
          'longitude', wl.longitude,
          'last_seen', wl.recorded_at
        )
      ), '[]'::jsonb)
      from public.worker_profiles w
      join public.profiles p on p.id = w.id
      join (
        select distinct on (worker_id) worker_id, latitude, longitude, recorded_at
        from public.worker_locations
        order by worker_id, recorded_at desc
      ) wl on wl.worker_id = w.id
    ),
    'bookings', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'booking_id', b.id,
          'status', b.status,
          'latitude', a.latitude,
          'longitude', a.longitude,
          'worker_id', b.worker_id,
          'service_name', s.name
        )
      ), '[]'::jsonb)
      from public.bookings b
      join public.addresses a on a.id = b.address_id
      left join public.services s on s.id = b.service_id
      where b.status in ('assigned', 'on_the_way', 'arrived', 'in_progress')
    )
  ) into v_result;

  return v_result;
END;
$$;


ALTER FUNCTION "public"."admin_get_live_map_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_account_deletion_requests"() RETURNS TABLE("id" "uuid", "user_id" "uuid", "reason" "text", "status" "text", "requested_at" timestamp with time zone, "reviewed_at" timestamp with time zone, "full_name" "text", "email" "text", "phone" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.user_id, r.reason, r.status, r.requested_at, r.reviewed_at,
         p.full_name, p.email, p.phone
  FROM public.account_deletion_requests r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  ORDER BY
    CASE r.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END,
    r.requested_at DESC;
END;
$$;


ALTER FUNCTION "public"."admin_list_account_deletion_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_invoices"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return coalesce(
    (
      select jsonb_agg(to_jsonb(i) order by i.created_at desc)
      from public.invoices i
      limit 500
    ),
    '[]'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."admin_list_invoices"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_payment_refunds"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return coalesce(
    (
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.payment_refunds r
      limit 500
    ),
    '[]'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."admin_list_payment_refunds"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_payment_webhook_events"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return coalesce(
    (
      select jsonb_agg(to_jsonb(e) order by e.received_at desc)
      from public.payment_webhook_events e
      limit 500
    ),
    '[]'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."admin_list_payment_webhook_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_payments"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return coalesce(
    (
      select jsonb_agg(to_jsonb(p) order by p.created_at desc)
      from public.payments p
      limit 500
    ),
    '[]'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."admin_list_payments"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_razorpay_webhook_events"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return coalesce(
    (
      select jsonb_agg(to_jsonb(e) order by e.received_at desc)
      from public.razorpay_webhook_events e
      limit 500
    ),
    '[]'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."admin_list_razorpay_webhook_events"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_refund_requests"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return coalesce(
    (
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from public.refund_requests r
      limit 500
    ),
    '[]'::jsonb
  );
end;
$$;


ALTER FUNCTION "public"."admin_list_refund_requests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_service_areas"() RETURNS TABLE("id" "uuid", "service_id" "uuid", "service_name" "text", "name" "text", "city" "text", "state" "text", "center_latitude" double precision, "center_longitude" double precision, "radius_km" numeric, "is_active" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    sa.id,
    sa.service_id,
    s.name as service_name,
    sa.name,
    sa.city,
    sa.state,
    sa.center_latitude,
    sa.center_longitude,
    sa.radius_km,
    sa.is_active,
    sa.created_at,
    sa.updated_at
  from public.service_areas sa
  left join public.services s on s.id = sa.service_id
  order by sa.created_at desc;
end;
$$;


ALTER FUNCTION "public"."admin_list_service_areas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_list_service_areas_v3"() RETURNS TABLE("id" "uuid", "name" "text", "city" "text", "state" "text", "center_latitude" double precision, "center_longitude" double precision, "radius_km" numeric, "is_active" boolean, "service_ids" "uuid"[], "service_names" "text"[], "service_count" integer, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "is_legacy" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return query
  select
    g.id,
    g.name,
    g.city,
    g.state,
    g.center_latitude,
    g.center_longitude,
    g.radius_km,
    g.is_active,
    coalesce(
      array_agg(distinct sa.service_id order by sa.service_id)
        filter (where sa.service_id is not null),
      '{}'::uuid[]
    ),
    coalesce(
      array_agg(distinct s.name order by s.name)
        filter (where s.id is not null),
      '{}'::text[]
    ),
    count(distinct sa.service_id)::integer,
    g.created_at,
    g.updated_at,
    false
  from public.service_area_groups g
  left join public.service_areas sa on sa.group_id = g.id
  left join public.services s on s.id = sa.service_id
  group by g.id

  union all

  select
    sa.id,
    sa.name,
    sa.city,
    sa.state,
    sa.center_latitude,
    sa.center_longitude,
    sa.radius_km,
    sa.is_active,
    case
      when sa.service_id is null then '{}'::uuid[]
      else array[sa.service_id]
    end,
    case
      when s.id is null then '{}'::text[]
      else array[s.name]
    end,
    case when sa.service_id is null then 0 else 1 end::integer,
    sa.created_at,
    sa.updated_at,
    true
  from public.service_areas sa
  left join public.services s on s.id = sa.service_id
  where sa.group_id is null
  order by created_at desc;
end;
$$;


ALTER FUNCTION "public"."admin_list_service_areas_v3"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_moderate_review"("p_review_id" "uuid", "p_moderation_status" "text", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_moderation_status not in ('published','hidden','flagged') then raise exception 'Invalid moderation status'; end if;
  select to_jsonb(r) into v_before from public.reviews r where r.id=p_review_id for update;
  if v_before is null then raise exception 'Review not found'; end if;
  update public.reviews set moderation_status=p_moderation_status,moderated_at=now(),moderated_by=auth.uid(),moderation_reason=p_reason where id=p_review_id;
  select to_jsonb(r) into v_after from public.reviews r where r.id=p_review_id;
  perform public.write_admin_audit('moderate_review','review',p_review_id,v_before,v_after);
  return jsonb_build_object('success',true,'review_id',p_review_id,'moderation_status',p_moderation_status);
end;
$$;


ALTER FUNCTION "public"."admin_moderate_review"("p_review_id" "uuid", "p_moderation_status" "text", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_remove_worker"("p_worker_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before jsonb;
  v_after jsonb;
  v_worker public.worker_profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_sessions_invalidated integer := 0;
  v_refresh_tokens_revoked integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select *
  into v_worker
  from public.worker_profiles
  where id = p_worker_id
  for update;

  if not found then
    raise exception 'Worker not found';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_worker_id
  for update;

  if not found then
    raise exception 'Worker profile not found';
  end if;

  v_before := jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'worker', to_jsonb(v_worker)
  );

  update public.profiles
  set is_active = false,
      updated_at = now()
  where id = p_worker_id;

  update public.worker_profiles
  set worker_status = 'suspended'::public.worker_status,
      is_verified = false,
      updated_at = now()
  where id = p_worker_id;

  update auth.refresh_tokens
  set revoked = true,
      updated_at = now()
  where user_id = p_worker_id::text
    and coalesce(revoked, false) = false;

  get diagnostics v_refresh_tokens_revoked = row_count;

  update auth.sessions
  set not_after = least(coalesce(not_after, now()), now()),
      updated_at = now()
  where user_id = p_worker_id
    and (not_after is null or not_after > now());

  get diagnostics v_sessions_invalidated = row_count;

  select *
  into v_worker
  from public.worker_profiles
  where id = p_worker_id;

  select *
  into v_profile
  from public.profiles
  where id = p_worker_id;

  v_after := jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'worker', to_jsonb(v_worker)
  );

  perform public.write_admin_audit(
    'admin_remove_worker',
    'worker',
    p_worker_id,
    v_before,
    v_after,
    jsonb_build_object(
      'refresh_tokens_revoked', v_refresh_tokens_revoked,
      'sessions_invalidated', v_sessions_invalidated
    )
  );

  return jsonb_build_object(
    'success', true,
    'worker_id', p_worker_id,
    'refresh_tokens_revoked', v_refresh_tokens_revoked,
    'sessions_invalidated', v_sessions_invalidated
  );
end;
$$;


ALTER FUNCTION "public"."admin_remove_worker"("p_worker_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_account_deletion"("p_request_id" "uuid", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_before jsonb;
  v_after jsonb;
  v_user_id uuid;
  v_old_status text;
  v_role public.user_role;
  v_active_booking_count integer := 0;
  v_active_occurrence_count integer := 0;
  v_payout_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('approved','rejected','cancelled') then
    raise exception 'Invalid deletion request status';
  end if;

  select to_jsonb(r), r.user_id, r.status
  into v_before, v_user_id, v_old_status
  from public.account_deletion_requests r
  where r.id = p_request_id
  for update;

  if v_user_id is null then
    raise exception 'Deletion request not found';
  end if;

  if v_old_status <> 'pending' then
    raise exception 'Deletion request is no longer pending';
  end if;

  select role
  into v_role
  from public.profiles
  where id = v_user_id
  for update;

  if v_role is null then
    raise exception 'Account profile not found';
  end if;

  if p_status = 'approved' and v_role = 'worker'::public.user_role then
    select count(*)
    into v_active_booking_count
    from public.bookings b
    where b.worker_id = v_user_id
      and b.status in (
        'assigned'::public.booking_status,
        'on_the_way'::public.booking_status,
        'arrived'::public.booking_status,
        'in_progress'::public.booking_status
      );

    select count(*)
    into v_active_occurrence_count
    from public.booking_schedule_occurrences o
    where o.worker_id = v_user_id
      and o.status in ('assigned','on_the_way','arrived','in_progress');

    select count(*)
    into v_payout_count
    from public.worker_payouts p
    where p.worker_id = v_user_id
      and p.status in ('queued','pending','processing');

    if v_active_booking_count > 0 or v_active_occurrence_count > 0 then
      raise exception 'Worker has active bookings or occurrences and cannot be deactivated yet';
    end if;

    if v_payout_count > 0 then
      raise exception 'Worker has an active payout and cannot be deactivated yet';
    end if;
  end if;

  if p_status = 'approved' then
    update public.profiles
    set is_active = false,
        updated_at = now()
    where id = v_user_id;

    if v_role = 'worker'::public.user_role then
      update public.worker_presence
      set is_available = false,
          expires_at = now(),
          updated_at = now()
      where worker_id = v_user_id;

      update public.worker_availability
      set is_available = false
      where worker_id = v_user_id;

      update public.worker_profiles
      set worker_status = 'suspended'::public.worker_status,
          is_verified = false,
          updated_at = now()
      where id = v_user_id;

      update public.worker_push_tokens
      set is_active = false
      where worker_id = v_user_id;
    end if;
  end if;

  update public.account_deletion_requests
  set status = p_status,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_request_id;

  select to_jsonb(r)
  into v_after
  from public.account_deletion_requests r
  where r.id = p_request_id;

  perform public.write_admin_audit(
    'review_account_deletion',
    'account_deletion_request',
    p_request_id,
    v_before,
    v_after
  );

  begin
    perform public.admin_create_notification(
      v_user_id,
      case
        when p_status = 'approved' then 'Account deletion approved'
        when p_status = 'rejected' then 'Account deletion request rejected'
        else 'Account deletion request cancelled'
      end,
      case
        when p_status = 'approved'
          then 'Your account has been deactivated as requested.'
        when p_status = 'rejected'
          then 'Your account deletion request was not approved.'
        else 'Your account deletion request was cancelled.'
      end,
      'account_deletion',
      null
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', p_status
  );
end;
$$;


ALTER FUNCTION "public"."admin_review_account_deletion"("p_request_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_worker_application"("p_application_id" "uuid", "p_status" "public"."worker_application_status", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before jsonb;
  v_after jsonb;
  v_worker_id uuid;
  v_doc_count integer;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select to_jsonb(a), a.worker_id
    into v_before, v_worker_id
  from public.worker_applications a
  where a.id=p_application_id
  for update;

  if v_worker_id is null then
    raise exception 'Application not found';
  end if;

  if p_status = 'approved'::public.worker_application_status then
    select count(distinct d.document_type)
      into v_doc_count
    from public.worker_documents d
    where d.worker_id = v_worker_id
      and d.document_type in (
        'aadhaar'::public.worker_document_type,
        'pan'::public.worker_document_type,
        'passport_photo'::public.worker_document_type,
        'address_proof'::public.worker_document_type,
        'police_verification'::public.worker_document_type,
        'bank_account'::public.worker_document_type
      )
      and d.status = 'approved'::public.worker_document_status;

    if v_doc_count < 6 then
      raise exception 'All required worker documents must be approved before application approval';
    end if;
  end if;

  update public.worker_applications
  set status=p_status,
      review_notes=p_notes,
      reviewed_at=now(),
      reviewed_by=auth.uid(),
      updated_at=now()
  where id=p_application_id;

  select to_jsonb(a) into v_after
  from public.worker_applications a
  where a.id=p_application_id;

  perform public.write_admin_audit('review_application','worker_application',p_application_id,v_before,v_after);

  return jsonb_build_object(
    'success',true,
    'application_id',p_application_id,
    'worker_id',v_worker_id,
    'status',p_status::text
  );
end;
$$;


ALTER FUNCTION "public"."admin_review_worker_application"("p_application_id" "uuid", "p_status" "public"."worker_application_status", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_worker_booking_change_request"("p_request_id" "uuid", "p_status" "text", "p_admin_notes" "text" DEFAULT NULL::"text") RETURNS "public"."worker_booking_change_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return public.admin_execute_worker_booking_change_request(
    p_request_id,
    p_status,
    p_admin_notes
  );
end;
$$;


ALTER FUNCTION "public"."admin_review_worker_booking_change_request"("p_request_id" "uuid", "p_status" "text", "p_admin_notes" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_booking_incidents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "occurrence_id" "uuid",
    "incident_type" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "admin_notes" "text",
    "reported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_by" "uuid",
    CONSTRAINT "worker_booking_incidents_description_check" CHECK ((("length"("btrim"("description")) >= 1) AND ("length"("btrim"("description")) <= 2000))),
    CONSTRAINT "worker_booking_incidents_incident_type_check" CHECK (("incident_type" = ANY (ARRAY['customer_unavailable'::"text", 'wrong_address'::"text", 'unsafe_location'::"text", 'access_problem'::"text", 'extra_work_requested'::"text", 'customer_behaviour'::"text", 'worker_emergency'::"text", 'other'::"text"]))),
    CONSTRAINT "worker_booking_incidents_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_review'::"text", 'resolved'::"text", 'dismissed'::"text"])))
);


ALTER TABLE "public"."worker_booking_incidents" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_worker_booking_incident"("p_incident_id" "uuid", "p_status" "text", "p_admin_notes" "text" DEFAULT NULL::"text") RETURNS "public"."worker_booking_incidents"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_incident public.worker_booking_incidents%rowtype;
  v_before jsonb;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
  v_admin_id uuid := (select auth.uid());
  v_old_status text;
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  if v_status not in ('open','in_review','resolved','dismissed') then
    raise exception 'Invalid incident status';
  end if;

  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'Admin notes must not exceed 2000 characters';
  end if;

  select *
  into v_incident
  from public.worker_booking_incidents
  where id = p_incident_id
  for update;

  if not found then
    raise exception 'Worker booking incident not found';
  end if;

  v_old_status := v_incident.status;
  v_before := to_jsonb(v_incident);

  if v_old_status in ('resolved','dismissed') and v_status <> v_old_status then
    raise exception 'Resolved or dismissed incidents are terminal';
  end if;

  if v_status in ('resolved','dismissed') and v_notes is null then
    raise exception 'Admin notes are required when resolving or dismissing an incident';
  end if;

  if v_old_status = 'open' and v_status not in ('open','in_review','resolved','dismissed') then
    raise exception 'Invalid incident status transition';
  end if;

  if v_old_status = 'in_review' and v_status not in ('open','in_review','resolved','dismissed') then
    raise exception 'Invalid incident status transition';
  end if;

  update public.worker_booking_incidents
  set
    status = v_status,
    admin_notes = v_notes,
    resolved_at = case
      when v_status in ('resolved','dismissed')
        then coalesce(resolved_at, now())
      else null
    end,
    resolved_by = case
      when v_status in ('resolved','dismissed')
        then coalesce(resolved_by, v_admin_id)
      else null
    end,
    updated_at = now()
  where id = v_incident.id
  returning * into v_incident;

  perform public.write_admin_audit(
    'admin_review_worker_booking_incident',
    'worker_booking_incident',
    v_incident.id,
    v_before,
    to_jsonb(v_incident),
    jsonb_build_object(
      'old_status', v_old_status,
      'status', v_status
    )
  );

  if v_status in ('resolved','dismissed') then
    begin
      perform public.admin_create_notification(
        v_incident.worker_id,
        case
          when v_status = 'resolved' then 'Booking incident resolved'
          else 'Booking incident dismissed'
        end,
        case
          when v_status = 'resolved'
            then 'Your reported booking incident has been resolved by support.'
          else 'Your reported booking incident was dismissed by support.'
        end,
        'worker_booking_incident',
        v_incident.booking_id
      );
    exception when others then
      null;
    end;
  end if;

  return v_incident;
end;
$$;


ALTER FUNCTION "public"."admin_review_worker_booking_incident"("p_incident_id" "uuid", "p_status" "text", "p_admin_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_worker_document"("p_document_id" "uuid", "p_status" "public"."worker_document_status", "p_rejection_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_before jsonb; v_after jsonb; v_worker_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select to_jsonb(d), d.worker_id into v_before, v_worker_id from public.worker_documents d where d.id=p_document_id for update;
  if v_worker_id is null then raise exception 'Document not found'; end if;
  if p_status='rejected' and nullif(trim(coalesce(p_rejection_reason,'')),'') is null then raise exception 'Rejection reason is required'; end if;
  update public.worker_documents set status=p_status, rejection_reason=case when p_status='rejected' then p_rejection_reason else null end, reviewed_at=now(), reviewed_by=auth.uid(), updated_at=now() where id=p_document_id;
  select to_jsonb(d) into v_after from public.worker_documents d where d.id=p_document_id;
  perform public.write_admin_audit('review_document','worker_document',p_document_id,v_before,v_after);
  return jsonb_build_object('success',true,'document_id',p_document_id,'worker_id',v_worker_id,'status',p_status::text);
end;
$$;


ALTER FUNCTION "public"."admin_review_worker_document"("p_document_id" "uuid", "p_status" "public"."worker_document_status", "p_rejection_reason" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_payout_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'razorpayx'::"text" NOT NULL,
    "provider_contact_id" "text",
    "provider_fund_account_id" "text",
    "account_type" "text" NOT NULL,
    "account_holder_name" "text",
    "bank_name" "text",
    "account_last4" "text",
    "upi_id_masked" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "verified_at" timestamp with time zone,
    CONSTRAINT "worker_payout_accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['bank_account'::"text", 'upi'::"text"]))),
    CONSTRAINT "worker_payout_accounts_provider_check" CHECK (("provider" = 'razorpayx'::"text")),
    CONSTRAINT "worker_payout_accounts_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."worker_payout_accounts" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_review_worker_payout_account"("p_payout_account_id" "uuid", "p_status" "text", "p_rejection_reason" "text" DEFAULT NULL::"text") RETURNS "public"."worker_payout_accounts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_account public.worker_payout_accounts%rowtype;
  v_before jsonb;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  if v_status not in ('pending','verified','rejected','disabled') then
    raise exception 'Invalid payout account status';
  end if;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id
  for update;

  if not found then
    raise exception 'Worker payout account not found';
  end if;

  v_before := to_jsonb(v_account);

  if v_status = 'verified' and nullif(v_account.provider_fund_account_id, '') is null then
    raise exception 'Provider fund account is required before verification';
  end if;

  if v_status = 'rejected' and v_reason is null then
    raise exception 'Rejection reason is required';
  end if;

  update public.worker_payout_accounts
  set status = v_status,
      rejection_reason =
        case
          when v_status = 'rejected' then v_reason
          else null
        end,
      verified_at =
        case
          when v_status = 'verified' then coalesce(verified_at, now())
          else null
        end,
      is_default =
        case
          when v_status = 'disabled' or v_status = 'rejected'
            then false
          else is_default
        end,
      updated_at = now()
  where id = v_account.id
  returning * into v_account;

  if v_status = 'verified'
     and not exists (
       select 1
       from public.worker_payout_accounts a
       where a.worker_id = v_account.worker_id
         and a.id <> v_account.id
         and a.status = 'verified'
         and a.is_default = true
     ) then
    update public.worker_payout_accounts
    set is_default = true,
        updated_at = now()
    where id = v_account.id
    returning * into v_account;
  end if;

  perform public.write_admin_audit(
    'admin_review_worker_payout_account',
    'worker_payout_account',
    v_account.id,
    v_before,
    to_jsonb(v_account),
    jsonb_build_object(
      'status', v_status,
      'rejection_reason', v_reason
    )
  );

  return v_account;
end;
$$;


ALTER FUNCTION "public"."admin_review_worker_payout_account"("p_payout_account_id" "uuid", "p_status" "text", "p_rejection_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_customer_active"("p_customer_id" "uuid", "p_is_active" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before jsonb;
  v_after jsonb;
  v_profile public.profiles%rowtype;
  v_sessions_invalidated integer := 0;
  v_refresh_tokens_revoked integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_customer_id
    and role = 'customer'::public.user_role
  for update;

  if not found then
    raise exception 'Customer not found';
  end if;

  v_before := to_jsonb(v_profile);

  update public.profiles
  set is_active = p_is_active,
      updated_at = now()
  where id = p_customer_id;

  if p_is_active = false then
    update auth.refresh_tokens
    set revoked = true,
        updated_at = now()
    where user_id = p_customer_id::text
      and coalesce(revoked, false) = false;

    get diagnostics v_refresh_tokens_revoked = row_count;

    update auth.sessions
    set not_after = least(coalesce(not_after, now()), now()),
        updated_at = now()
    where user_id = p_customer_id
      and (not_after is null or not_after > now());

    get diagnostics v_sessions_invalidated = row_count;
  end if;

  select to_jsonb(p)
  into v_after
  from public.profiles p
  where p.id = p_customer_id;

  perform public.write_admin_audit(
    'admin_set_customer_active',
    'customer',
    p_customer_id,
    v_before,
    v_after,
    jsonb_build_object(
      'is_active', p_is_active,
      'refresh_tokens_revoked', v_refresh_tokens_revoked,
      'sessions_invalidated', v_sessions_invalidated
    )
  );

  return jsonb_build_object(
    'success', true,
    'customer_id', p_customer_id,
    'is_active', p_is_active,
    'refresh_tokens_revoked', v_refresh_tokens_revoked,
    'sessions_invalidated', v_sessions_invalidated
  );
end;
$$;


ALTER FUNCTION "public"."admin_set_customer_active"("p_customer_id" "uuid", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_service_active"("p_service_id" "uuid", "p_is_active" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select to_jsonb(s) into v_before from public.services s where s.id=p_service_id for update;
  if v_before is null then raise exception 'Service not found'; end if;
  update public.services set is_active=p_is_active,updated_at=now() where id=p_service_id;
  select to_jsonb(s) into v_after from public.services s where s.id=p_service_id;
  perform public.write_admin_audit('set_service_active','service',p_service_id,v_before,v_after);
  return jsonb_build_object('success',true,'service_id',p_service_id,'is_active',p_is_active);
end;
$$;


ALTER FUNCTION "public"."admin_set_service_active"("p_service_id" "uuid", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_set_worker_status"("p_worker_id" "uuid", "p_status" "public"."worker_status") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_before jsonb; v_after jsonb;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select to_jsonb(w) into v_before from public.worker_profiles w where w.id=p_worker_id for update;
  if v_before is null then raise exception 'Worker not found'; end if;
  update public.worker_profiles set worker_status=p_status, updated_at=now() where id=p_worker_id;
  update public.profiles set is_active=(p_status <> 'suspended') where id=p_worker_id;
  select to_jsonb(w) into v_after from public.worker_profiles w where w.id=p_worker_id;
  perform public.write_admin_audit('set_worker_status','worker',p_worker_id,v_before,v_after,jsonb_build_object('status',p_status::text));
  return jsonb_build_object('success',true,'worker_id',p_worker_id,'status',p_status::text);
end;
$$;


ALTER FUNCTION "public"."admin_set_worker_status"("p_worker_id" "uuid", "p_status" "public"."worker_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_current_hourly_service_price"("p_service_id" "uuid", "p_price" numeric, "p_currency" "text" DEFAULT 'INR'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_variant public.service_variants;
  v_old_variant_price public.service_variant_prices;
  v_old_hourly_price public.service_hourly_prices;
  v_new_variant_price public.service_variant_prices;
  v_new_hourly_price public.service_hourly_prices;
  v_currency text;
  v_now timestamptz := now();
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_service_id is null then
    raise exception 'Service is required';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'Hourly price cannot be negative';
  end if;

  v_currency := upper(trim(coalesce(p_currency, '')));
  if v_currency = '' then
    raise exception 'Currency is required';
  end if;

  select *
    into v_variant
    from public.service_variants
   where service_id = p_service_id
     and billing_type = 'hourly'
     and is_active = true
   order by sort_order asc, created_at asc
   limit 1
   for update;

  if v_variant.id is null then
    raise exception 'Active hourly service variant not found';
  end if;

  select *
    into v_old_variant_price
    from public.service_variant_prices
   where service_variant_id = v_variant.id
     and is_active = true
     and effective_from <= v_now
     and (effective_to is null or v_now < effective_to)
   order by effective_from desc, created_at desc
   limit 1
   for update;

  if v_old_variant_price.id is not null then
    update public.service_variant_prices
       set effective_to = v_now,
           is_active = false
     where id = v_old_variant_price.id;
  end if;

  insert into public.service_variant_prices (
    service_variant_id, price, currency,
    effective_from, effective_to, is_active
  )
  values (
    v_variant.id, p_price, v_currency,
    v_now, null, true
  )
  returning * into v_new_variant_price;

  select *
    into v_old_hourly_price
    from public.service_hourly_prices
   where service_id = p_service_id
     and is_active = true
     and effective_from <= v_now
     and (effective_to is null or v_now < effective_to)
   order by effective_from desc, created_at desc
   limit 1
   for update;

  if v_old_hourly_price.id is not null then
    update public.service_hourly_prices
       set effective_to = v_now,
           is_active = false
     where id = v_old_hourly_price.id;
  end if;

  insert into public.service_hourly_prices (
    service_id, price, currency,
    effective_from, effective_to, is_active
  )
  values (
    p_service_id, p_price, v_currency,
    v_now, null, true
  )
  returning * into v_new_hourly_price;

  perform public.write_admin_audit(
    'update_hourly_service_price',
    'service',
    p_service_id,
    jsonb_build_object(
      'previous_variant_price', to_jsonb(v_old_variant_price),
      'previous_hourly_price', to_jsonb(v_old_hourly_price)
    ),
    jsonb_build_object(
      'new_variant_price', to_jsonb(v_new_variant_price),
      'new_hourly_price', to_jsonb(v_new_hourly_price)
    )
  );

  return jsonb_build_object(
    'service_id', p_service_id,
    'service_variant_id', v_variant.id,
    'variant_price', to_jsonb(v_new_variant_price),
    'hourly_price', to_jsonb(v_new_hourly_price)
  );
end;
$$;


ALTER FUNCTION "public"."admin_update_current_hourly_service_price"("p_service_id" "uuid", "p_price" numeric, "p_currency" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_availability_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_availability_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'notified'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."service_availability_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_service_availability_request"("p_request_id" "uuid", "p_status" "text") RETURNS "public"."service_availability_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_result public.service_availability_requests;
  v_old_status text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('notified','cancelled') then
    raise exception 'Invalid availability request status';
  end if;

  select status into v_old_status
  from public.service_availability_requests
  where id = p_request_id
  for update;

  if v_old_status is null then
    raise exception 'Availability request not found';
  end if;

  if v_old_status <> 'pending' then
    raise exception 'Availability request is no longer pending';
  end if;

  update public.service_availability_requests
  set status = p_status, updated_at = now()
  where id = p_request_id
  returning * into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."admin_update_service_availability_request"("p_request_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "category_id" "uuid",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_service_catalog"("p_service_id" "uuid", "p_name" "text", "p_description" "text" DEFAULT NULL::"text", "p_image_url" "text" DEFAULT NULL::"text", "p_is_active" boolean DEFAULT true, "p_category_id" "uuid" DEFAULT NULL::"uuid", "p_display_order" integer DEFAULT 0, "p_is_featured" boolean DEFAULT false) RETURNS "public"."services"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before jsonb;
  v_after public.services;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_service_id is null then
    raise exception 'Service is required';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Service name is required';
  end if;

  if p_display_order is null or p_display_order < 0 then
    raise exception 'Display order cannot be negative';
  end if;

  if p_image_url is not null and length(trim(p_image_url)) > 2048 then
    raise exception 'Image URL is too long';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.service_categories
    where id = p_category_id and is_active = true
  ) then
    raise exception 'Category not found or inactive';
  end if;

  select to_jsonb(s)
    into v_before
    from public.services s
   where s.id = p_service_id
   for update;

  if v_before is null then
    raise exception 'Service not found';
  end if;

  update public.services
     set name = trim(p_name),
         description = nullif(trim(p_description), ''),
         image_url = case
           when p_image_url is null then image_url
           when nullif(trim(p_image_url), '') is null then null
           else trim(p_image_url)
         end,
         is_active = coalesce(p_is_active, true),
         category_id = p_category_id,
         display_order = coalesce(p_display_order, 0),
         is_featured = coalesce(p_is_featured, false),
         updated_at = now()
   where id = p_service_id
   returning * into v_after;

  perform public.write_admin_audit(
    'update_service_catalog',
    'service',
    v_after.id,
    v_before,
    to_jsonb(v_after)
  );

  return v_after;
end;
$$;


ALTER FUNCTION "public"."admin_update_service_catalog"("p_service_id" "uuid", "p_name" "text", "p_description" "text", "p_image_url" "text", "p_is_active" boolean, "p_category_id" "uuid", "p_display_order" integer, "p_is_featured" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."support_tickets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "description" "text" NOT NULL,
    "booking_id" "uuid",
    "payment_id" "uuid",
    "worker_id" "uuid",
    "refund_request_id" "uuid",
    "payment_refund_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "admin_notes" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_tickets_category_check" CHECK (("category" = ANY (ARRAY['booking'::"text", 'payment'::"text", 'worker'::"text", 'refund'::"text", 'technical'::"text"]))),
    CONSTRAINT "support_tickets_check" CHECK ((("resolved_at" IS NULL) OR ("status" = ANY (ARRAY['resolved'::"text", 'closed'::"text"])))),
    CONSTRAINT "support_tickets_description_check" CHECK (("btrim"("description") <> ''::"text")),
    CONSTRAINT "support_tickets_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'in_progress'::"text", 'resolved'::"text", 'closed'::"text"]))),
    CONSTRAINT "support_tickets_subject_check" CHECK (("btrim"("subject") <> ''::"text"))
);


ALTER TABLE "public"."support_tickets" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_support_ticket"("p_ticket_id" "uuid", "p_status" "text", "p_admin_notes" "text" DEFAULT NULL::"text") RETURNS "public"."support_tickets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_result public.support_tickets;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_status not in ('open','in_progress','resolved','closed') then raise exception 'Invalid ticket status'; end if;
  update public.support_tickets
  set status=p_status,
      admin_notes=case when p_admin_notes is null then admin_notes else nullif(btrim(p_admin_notes),'') end,
      updated_at=now()
  where id=p_ticket_id
  returning * into v_result;
  if v_result.id is null then raise exception 'Support ticket not found'; end if;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."admin_update_support_ticket"("p_ticket_id" "uuid", "p_status" "text", "p_admin_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_worker"("p_worker_id" "uuid", "p_full_name" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_worker_status" "public"."worker_status" DEFAULT NULL::"public"."worker_status", "p_is_verified" boolean DEFAULT NULL::boolean, "p_service_radius_km" numeric DEFAULT NULL::numeric, "p_is_featured" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_before jsonb; v_after jsonb; v_profile public.profiles%rowtype; v_worker public.worker_profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  select * into v_worker from public.worker_profiles where id=p_worker_id for update;
  if not found then raise exception 'Worker not found'; end if;
  select * into v_profile from public.profiles where id=p_worker_id for update;
  if not found then raise exception 'Worker profile not found'; end if;
  v_before=jsonb_build_object('profile',to_jsonb(v_profile),'worker',to_jsonb(v_worker));
  update public.profiles set full_name=coalesce(p_full_name,full_name),phone=coalesce(p_phone,phone),updated_at=now() where id=p_worker_id;
  update public.worker_profiles set worker_status=coalesce(p_worker_status,worker_status),is_verified=coalesce(p_is_verified,is_verified),service_radius_km=coalesce(p_service_radius_km,service_radius_km),is_featured=coalesce(p_is_featured,is_featured),updated_at=now() where id=p_worker_id;
  select * into v_worker from public.worker_profiles where id=p_worker_id;
  select * into v_profile from public.profiles where id=p_worker_id;
  v_after=jsonb_build_object('profile',to_jsonb(v_profile),'worker',to_jsonb(v_worker));
  perform public.write_admin_audit('admin_update_worker','worker',p_worker_id,v_before,v_after,'{}'::jsonb);
  return jsonb_build_object('success',true,'worker_id',p_worker_id);
end;
$$;


ALTER FUNCTION "public"."admin_update_worker"("p_worker_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_worker_status" "public"."worker_status", "p_is_verified" boolean, "p_service_radius_km" numeric, "p_is_featured" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_worker"("p_worker_id" "uuid", "p_full_name" "text" DEFAULT NULL::"text", "p_phone" "text" DEFAULT NULL::"text", "p_worker_status" "public"."worker_status" DEFAULT NULL::"public"."worker_status", "p_is_verified" boolean DEFAULT NULL::boolean, "p_service_radius_km" numeric DEFAULT NULL::numeric, "p_is_featured" boolean DEFAULT NULL::boolean, "p_service_ids" "uuid"[] DEFAULT NULL::"uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_profile public.profiles%rowtype;
  v_worker public.worker_profiles%rowtype;
  v_service_count integer;
  v_requested_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT *
  INTO v_worker
  FROM public.worker_profiles
  WHERE id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worker not found';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worker profile not found';
  END IF;

  IF p_service_ids IS NULL
     OR array_length(p_service_ids, 1) IS NULL
     OR array_length(p_service_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Select at least one service';
  END IF;

  SELECT count(*)
  INTO v_requested_count
  FROM (
    SELECT DISTINCT service_id
    FROM unnest(p_service_ids) AS service_id
  ) requested;

  IF v_requested_count <> array_length(p_service_ids, 1) THEN
    RAISE EXCEPTION 'Duplicate services are not allowed';
  END IF;

  SELECT count(*)
  INTO v_service_count
  FROM unnest(p_service_ids) AS service_id
  JOIN public.services s
    ON s.id = service_id
   AND s.is_active = true;

  IF v_service_count <> array_length(p_service_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected services are invalid or inactive';
  END IF;

  v_before := jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'worker', to_jsonb(v_worker),
    'services', COALESCE(
      (
        SELECT jsonb_agg(ws.service_id ORDER BY ws.service_id)
        FROM public.worker_services ws
        WHERE ws.worker_id = p_worker_id
      ),
      '[]'::jsonb
    )
  );

  UPDATE public.profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    phone = COALESCE(p_phone, phone),
    updated_at = now()
  WHERE id = p_worker_id;

  UPDATE public.worker_profiles
  SET
    worker_status = COALESCE(p_worker_status, worker_status),
    is_verified = COALESCE(p_is_verified, is_verified),
    service_radius_km = COALESCE(
      p_service_radius_km,
      service_radius_km
    ),
    is_featured = COALESCE(
      p_is_featured,
      is_featured
    ),
    updated_at = now()
  WHERE id = p_worker_id;

  DELETE FROM public.worker_services
  WHERE worker_id = p_worker_id;

  INSERT INTO public.worker_services (
    worker_id,
    service_id,
    created_at
  )
  SELECT
    p_worker_id,
    service_id,
    now()
  FROM unnest(p_service_ids) AS service_id;

  SELECT *
  INTO v_worker
  FROM public.worker_profiles
  WHERE id = p_worker_id;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_worker_id;

  v_after := jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'worker', to_jsonb(v_worker),
    'services', COALESCE(
      (
        SELECT jsonb_agg(ws.service_id ORDER BY ws.service_id)
        FROM public.worker_services ws
        WHERE ws.worker_id = p_worker_id
      ),
      '[]'::jsonb
    )
  );

  PERFORM public.write_admin_audit(
    'admin_update_worker',
    'worker',
    p_worker_id,
    v_before,
    v_after,
    jsonb_build_object(
      'services_updated', true
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'worker_id', p_worker_id,
    'service_count', array_length(p_service_ids, 1)
  );
END;
$$;


ALTER FUNCTION "public"."admin_update_worker"("p_worker_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_worker_status" "public"."worker_status", "p_is_verified" boolean, "p_service_radius_km" numeric, "p_is_featured" boolean, "p_service_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_service"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_is_active" boolean DEFAULT true) RETURNS "public"."services"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_before jsonb; v_after public.services;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Service name is required'; end if;
  if p_id is null then
    insert into public.services(name,description,is_active) values(trim(p_name),p_description,coalesce(p_is_active,true)) returning * into v_after;
  else
    select to_jsonb(s) into v_before from public.services s where s.id=p_id for update;
    if v_before is null then raise exception 'Service not found'; end if;
    update public.services set name=trim(p_name),description=p_description,is_active=coalesce(p_is_active,true),updated_at=now() where id=p_id returning * into v_after;
  end if;
  perform public.write_admin_audit(case when p_id is null then 'create_service' else 'update_service' end,'service',v_after.id,v_before,to_jsonb(v_after));
  return v_after;
end;
$$;


ALTER FUNCTION "public"."admin_upsert_service"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_service"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_is_active" boolean DEFAULT true, "p_image_url" "text" DEFAULT NULL::"text") RETURNS "public"."services"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before jsonb;
  v_after public.services;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if nullif(trim(p_name), '') is null then
    raise exception 'Service name is required';
  end if;

  if p_image_url is not null and length(trim(p_image_url)) > 2048 then
    raise exception 'Image URL is too long';
  end if;

  if p_id is null then
    insert into public.services (
      name,
      description,
      is_active,
      image_url
    )
    values (
      trim(p_name),
      nullif(trim(p_description), ''),
      coalesce(p_is_active, true),
      nullif(trim(p_image_url), '')
    )
    returning * into v_after;
  else
    select to_jsonb(s)
      into v_before
      from public.services s
     where s.id = p_id
     for update;

    if v_before is null then
      raise exception 'Service not found';
    end if;

    update public.services
       set name = trim(p_name),
           description = nullif(trim(p_description), ''),
           is_active = coalesce(p_is_active, true),
           image_url = case
             when p_image_url is null then image_url
             when nullif(trim(p_image_url), '') is null then null
             else trim(p_image_url)
           end,
           updated_at = now()
     where id = p_id
     returning * into v_after;
  end if;

  perform public.write_admin_audit(
    case when p_id is null then 'create_service' else 'update_service' end,
    'service',
    v_after.id,
    v_before,
    to_jsonb(v_after)
  );

  return v_after;
end;
$$;


ALTER FUNCTION "public"."admin_upsert_service"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_is_active" boolean, "p_image_url" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "center_latitude" double precision NOT NULL,
    "center_longitude" double precision NOT NULL,
    "radius_km" numeric NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "service_id" "uuid",
    "group_id" "uuid",
    CONSTRAINT "service_areas_center_latitude_check" CHECK ((("center_latitude" >= ('-90'::integer)::double precision) AND ("center_latitude" <= (90)::double precision))),
    CONSTRAINT "service_areas_center_longitude_check" CHECK ((("center_longitude" >= ('-180'::integer)::double precision) AND ("center_longitude" <= (180)::double precision))),
    CONSTRAINT "service_areas_city_not_blank_check" CHECK (("length"(TRIM(BOTH FROM "city")) > 0)),
    CONSTRAINT "service_areas_name_not_blank_check" CHECK (("length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "service_areas_radius_km_check" CHECK ((("radius_km" > (0)::numeric) AND ("radius_km" <= (10)::numeric))),
    CONSTRAINT "service_areas_state_not_blank_check" CHECK (("length"(TRIM(BOTH FROM "state")) > 0))
);


ALTER TABLE "public"."service_areas" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_service_area"("p_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean DEFAULT true) RETURNS "public"."service_areas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_before jsonb; v_after public.service_areas;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Area name is required'; end if;
  if p_radius_km is null or p_radius_km <= 0 then raise exception 'Radius must be greater than zero'; end if;
  if p_center_latitude < -90 or p_center_latitude > 90 or p_center_longitude < -180 or p_center_longitude > 180 then raise exception 'Invalid coordinates'; end if;
  if p_id is null then
    insert into public.service_areas(name,city,state,center_latitude,center_longitude,radius_km,is_active) values(trim(p_name),trim(p_city),trim(p_state),p_center_latitude,p_center_longitude,p_radius_km,coalesce(p_is_active,true)) returning * into v_after;
  else
    select to_jsonb(a) into v_before from public.service_areas a where a.id=p_id for update;
    if v_before is null then raise exception 'Service area not found'; end if;
    update public.service_areas set name=trim(p_name),city=trim(p_city),state=trim(p_state),center_latitude=p_center_latitude,center_longitude=p_center_longitude,radius_km=p_radius_km,is_active=coalesce(p_is_active,true),updated_at=now() where id=p_id returning * into v_after;
  end if;
  perform public.write_admin_audit(case when p_id is null then 'create_service_area' else 'update_service_area' end,'service_area',v_after.id,v_before,to_jsonb(v_after));
  return v_after;
end;
$$;


ALTER FUNCTION "public"."admin_upsert_service_area"("p_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_service_area_v2"("p_id" "uuid", "p_service_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean DEFAULT true) RETURNS "public"."service_areas"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_before jsonb;
  v_after public.service_areas;
  v_was_active boolean := false;
  v_request record;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_service_id is null then
    raise exception 'Service is required';
  end if;
  if not exists (select 1 from public.services s where s.id = p_service_id) then
    raise exception 'Service not found';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'Area name is required';
  end if;
  if p_radius_km is null or p_radius_km <= 0 or p_radius_km > 10 then
    raise exception 'Radius must be greater than zero and at most 10 km';
  end if;
  if p_center_latitude is null or p_center_latitude < -90 or p_center_latitude > 90
     or p_center_longitude is null or p_center_longitude < -180 or p_center_longitude > 180 then
    raise exception 'Invalid coordinates';
  end if;

  if p_id is null then
    insert into public.service_areas(
      service_id, name, city, state,
      center_latitude, center_longitude, radius_km, is_active
    ) values (
      p_service_id, trim(p_name), nullif(trim(p_city), ''), nullif(trim(p_state), ''),
      p_center_latitude, p_center_longitude, p_radius_km, coalesce(p_is_active, true)
    ) returning * into v_after;
  else
    select to_jsonb(a), a.is_active
      into v_before, v_was_active
      from public.service_areas a
      where a.id = p_id
      for update;

    if v_before is null then
      raise exception 'Service area not found';
    end if;

    update public.service_areas
    set service_id = p_service_id,
        name = trim(p_name),
        city = nullif(trim(p_city), ''),
        state = nullif(trim(p_state), ''),
        center_latitude = p_center_latitude,
        center_longitude = p_center_longitude,
        radius_km = p_radius_km,
        is_active = coalesce(p_is_active, true),
        updated_at = now()
    where id = p_id
    returning * into v_after;
  end if;

  perform public.write_admin_audit(
    case when p_id is null then 'create_service_area' else 'update_service_area' end,
    'service_area',
    v_after.id,
    v_before,
    to_jsonb(v_after)
  );

  if v_after.is_active = true and (p_id is null or v_was_active = false) then
    for v_request in
      select r.id, r.customer_id, s.name as service_name
      from public.service_availability_requests r
      join public.services s on s.id = r.service_id
      join public.profiles p on p.id = r.customer_id and p.is_active = true
      where r.status = 'pending'
        and r.service_id = v_after.service_id
        and st_dwithin(
          st_setsrid(st_makepoint(v_after.center_longitude, v_after.center_latitude), 4326)::geography,
          st_setsrid(st_makepoint(r.longitude, r.latitude), 4326)::geography,
          v_after.radius_km * 1000
        )
    loop
      insert into public.notifications(
        user_id, booking_id, title, message, notification_type, is_read
      ) values (
        v_request.customer_id,
        null,
        'Service now available',
        v_request.service_name || ' is now available in your area. You can book it from TempStaff.',
        'service_availability',
        false
      );

      update public.service_availability_requests
      set status = 'notified', updated_at = now()
      where id = v_request.id;
    end loop;
  end if;

  return v_after;
end;
$$;


ALTER FUNCTION "public"."admin_upsert_service_area_v2"("p_id" "uuid", "p_service_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_area_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "center_latitude" double precision NOT NULL,
    "center_longitude" double precision NOT NULL,
    "radius_km" numeric NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_area_groups_center_latitude_check" CHECK ((("center_latitude" >= ('-90'::integer)::double precision) AND ("center_latitude" <= (90)::double precision))),
    CONSTRAINT "service_area_groups_center_longitude_check" CHECK ((("center_longitude" >= ('-180'::integer)::double precision) AND ("center_longitude" <= (180)::double precision))),
    CONSTRAINT "service_area_groups_city_not_blank_check" CHECK (("btrim"("city") <> ''::"text")),
    CONSTRAINT "service_area_groups_name_not_blank_check" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "service_area_groups_radius_km_check" CHECK ((("radius_km" > (0)::numeric) AND ("radius_km" <= (10)::numeric))),
    CONSTRAINT "service_area_groups_state_not_blank_check" CHECK (("btrim"("state") <> ''::"text"))
);


ALTER TABLE "public"."service_area_groups" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_service_area_v3"("p_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean, "p_service_ids" "uuid"[] DEFAULT '{}'::"uuid"[]) RETURNS "public"."service_area_groups"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_group public.service_area_groups;
  v_existing_legacy public.service_areas;
  v_before jsonb;
  v_service_ids uuid[];
  v_service_id uuid;
  v_group_id uuid;
  v_had_group boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Area name is required';
  end if;

  if nullif(btrim(p_city), '') is null then
    raise exception 'City is required';
  end if;

  if nullif(btrim(p_state), '') is null then
    raise exception 'State is required';
  end if;

  if p_center_latitude is null
     or p_center_latitude < -90
     or p_center_latitude > 90
     or p_center_longitude is null
     or p_center_longitude < -180
     or p_center_longitude > 180 then
    raise exception 'Invalid coordinates';
  end if;

  if p_radius_km is null or p_radius_km <= 0 or p_radius_km > 10 then
    raise exception 'Radius must be greater than zero and at most 10 km';
  end if;

  select array_agg(distinct x order by x)
  into v_service_ids
  from unnest(coalesce(p_service_ids, '{}'::uuid[])) x;

  v_service_ids := coalesce(v_service_ids, '{}'::uuid[]);

  if cardinality(v_service_ids) = 0 then
    raise exception 'At least one service must be selected';
  end if;

  if exists (
    select 1
    from unnest(v_service_ids) x
    left join public.services s on s.id = x
    where s.id is null or s.is_active <> true
  ) then
    raise exception 'All selected services must exist and be active';
  end if;

  if p_id is null then
    insert into public.service_area_groups (
      name, city, state, center_latitude, center_longitude,
      radius_km, is_active
    ) values (
      btrim(p_name), btrim(p_city), btrim(p_state),
      p_center_latitude, p_center_longitude,
      p_radius_km, coalesce(p_is_active, true)
    )
    returning * into v_group;

    v_group_id := v_group.id;
  else
    select * into v_group
    from public.service_area_groups g
    where g.id = p_id
    for update;

    if found then
      v_had_group := true;
      select to_jsonb(v_group) into v_before;
      v_group_id := v_group.id;

      update public.service_area_groups
      set name = btrim(p_name),
          city = btrim(p_city),
          state = btrim(p_state),
          center_latitude = p_center_latitude,
          center_longitude = p_center_longitude,
          radius_km = p_radius_km,
          is_active = coalesce(p_is_active, true),
          updated_at = now()
      where id = v_group_id
      returning * into v_group;
    else
      select * into v_existing_legacy
      from public.service_areas sa
      where sa.id = p_id
      for update;

      if not found then
        raise exception 'Service area not found';
      end if;

      insert into public.service_area_groups (
        name, city, state, center_latitude, center_longitude,
        radius_km, is_active
      ) values (
        btrim(p_name), btrim(p_city), btrim(p_state),
        p_center_latitude, p_center_longitude,
        p_radius_km, coalesce(p_is_active, true)
      )
      returning * into v_group;

      v_group_id := v_group.id;
      v_before := to_jsonb(v_existing_legacy);

      update public.service_areas
      set group_id = v_group_id, updated_at = now()
      where id = v_existing_legacy.id;
    end if;
  end if;

  delete from public.service_areas sa
  where sa.group_id = v_group_id
    and not (sa.service_id = any(v_service_ids));

  foreach v_service_id in array v_service_ids loop
    if exists (
      select 1 from public.service_areas sa
      where sa.group_id = v_group_id and sa.service_id = v_service_id
    ) then
      update public.service_areas sa
      set name = v_group.name,
          city = v_group.city,
          state = v_group.state,
          center_latitude = v_group.center_latitude,
          center_longitude = v_group.center_longitude,
          radius_km = v_group.radius_km,
          is_active = v_group.is_active,
          updated_at = now()
      where sa.group_id = v_group_id and sa.service_id = v_service_id;
    else
      insert into public.service_areas (
        group_id, service_id, name, city, state,
        center_latitude, center_longitude, radius_km, is_active
      ) values (
        v_group_id, v_service_id, v_group.name, v_group.city, v_group.state,
        v_group.center_latitude, v_group.center_longitude,
        v_group.radius_km, v_group.is_active
      );
    end if;
  end loop;

  perform public.write_admin_audit(
    case when p_id is null and not v_had_group
      then 'create_service_area_group'
      else 'update_service_area_group'
    end,
    'service_area_group',
    v_group_id,
    v_before,
    jsonb_build_object(
      'group', to_jsonb(v_group),
      'service_ids', v_service_ids
    )
  );

  return v_group;
end;
$$;


ALTER FUNCTION "public"."admin_upsert_service_area_v3"("p_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean, "p_service_ids" "uuid"[]) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_variant_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_variant_id" "uuid" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_to" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_variant_prices_currency_check" CHECK (("currency" = 'INR'::"text")),
    CONSTRAINT "service_variant_prices_price_check" CHECK (("price" >= (0)::numeric)),
    CONSTRAINT "valid_price_period" CHECK ((("effective_to" IS NULL) OR ("effective_to" > "effective_from")))
);


ALTER TABLE "public"."service_variant_prices" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_service_price"("p_id" "uuid", "p_service_variant_id" "uuid", "p_price" numeric, "p_currency" "text" DEFAULT 'INR'::"text", "p_effective_from" timestamp with time zone DEFAULT "now"(), "p_effective_to" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_is_active" boolean DEFAULT true) RETURNS "public"."service_variant_prices"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_before jsonb; v_after public.service_variant_prices;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if p_price is null or p_price < 0 then raise exception 'Price cannot be negative'; end if;
  if not exists(select 1 from public.service_variants where id=p_service_variant_id) then raise exception 'Service variant not found'; end if;
  if p_id is null then
    insert into public.service_variant_prices(service_variant_id,price,currency,effective_from,effective_to,is_active)
    values(p_service_variant_id,p_price,coalesce(p_currency,'INR'),coalesce(p_effective_from,now()),p_effective_to,coalesce(p_is_active,true)) returning * into v_after;
  else
    select to_jsonb(p) into v_before from public.service_variant_prices p where p.id=p_id for update;
    if v_before is null then raise exception 'Price record not found'; end if;
    update public.service_variant_prices set service_variant_id=p_service_variant_id,price=p_price,currency=coalesce(p_currency,'INR'),effective_from=coalesce(p_effective_from,effective_from),effective_to=p_effective_to,is_active=coalesce(p_is_active,true) where id=p_id returning * into v_after;
  end if;
  perform public.write_admin_audit(case when p_id is null then 'create_service_price' else 'update_service_price' end,'service_variant_price',v_after.id,v_before,to_jsonb(v_after));
  return v_after;
end;
$$;


ALTER FUNCTION "public"."admin_upsert_service_price"("p_id" "uuid", "p_service_variant_id" "uuid", "p_price" numeric, "p_currency" "text", "p_effective_from" timestamp with time zone, "p_effective_to" timestamp with time zone, "p_is_active" boolean) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "billing_type" "text" DEFAULT 'hourly'::"text" NOT NULL,
    "duration_value" integer,
    "duration_unit" "text",
    "min_quantity" integer DEFAULT 1 NOT NULL,
    "max_quantity" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_variants_billing_type_check" CHECK (("billing_type" = ANY (ARRAY['hourly'::"text", 'daily'::"text", 'fixed'::"text"]))),
    CONSTRAINT "service_variants_check" CHECK ((("max_quantity" IS NULL) OR ("max_quantity" >= "min_quantity"))),
    CONSTRAINT "service_variants_duration_unit_check" CHECK ((("duration_unit" IS NULL) OR ("duration_unit" = ANY (ARRAY['hour'::"text", 'day'::"text", 'shift'::"text", 'task'::"text"])))),
    CONSTRAINT "service_variants_min_quantity_check" CHECK (("min_quantity" > 0))
);


ALTER TABLE "public"."service_variants" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_service_variant"("p_id" "uuid", "p_service_id" "uuid", "p_name" "text", "p_description" "text", "p_billing_type" "text", "p_duration_value" integer, "p_duration_unit" "text", "p_min_quantity" integer, "p_max_quantity" integer, "p_is_active" boolean DEFAULT true, "p_sort_order" integer DEFAULT 0) RETURNS "public"."service_variants"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_before jsonb; v_after public.service_variants;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  if not exists(select 1 from public.services where id=p_service_id) then raise exception 'Service not found'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Variant name is required'; end if;
  if p_min_quantity is null or p_min_quantity < 1 then raise exception 'Minimum quantity must be at least 1'; end if;
  if p_max_quantity is not null and p_max_quantity < p_min_quantity then raise exception 'Maximum quantity cannot be less than minimum quantity'; end if;
  if p_id is null then
    insert into public.service_variants(service_id,name,description,billing_type,duration_value,duration_unit,min_quantity,max_quantity,is_active,sort_order)
    values(p_service_id,trim(p_name),p_description,p_billing_type,p_duration_value,p_duration_unit,p_min_quantity,p_max_quantity,coalesce(p_is_active,true),coalesce(p_sort_order,0)) returning * into v_after;
  else
    select to_jsonb(sv) into v_before from public.service_variants sv where sv.id=p_id for update;
    if v_before is null then raise exception 'Variant not found'; end if;
    update public.service_variants set service_id=p_service_id,name=trim(p_name),description=p_description,billing_type=p_billing_type,duration_value=p_duration_value,duration_unit=p_duration_unit,min_quantity=p_min_quantity,max_quantity=p_max_quantity,is_active=coalesce(p_is_active,true),sort_order=coalesce(p_sort_order,0),updated_at=now() where id=p_id returning * into v_after;
  end if;
  perform public.write_admin_audit(case when p_id is null then 'create_service_variant' else 'update_service_variant' end,'service_variant',v_after.id,v_before,to_jsonb(v_after));
  return v_after;
end;
$$;


ALTER FUNCTION "public"."admin_upsert_service_variant"("p_id" "uuid", "p_service_id" "uuid", "p_name" "text", "p_description" "text", "p_billing_type" "text", "p_duration_value" integer, "p_duration_unit" "text", "p_min_quantity" integer, "p_max_quantity" integer, "p_is_active" boolean, "p_sort_order" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_worker_payout_provider_update"("p_payout_id" "uuid", "p_provider_payout_id" "text", "p_provider_status" "text", "p_amount_paise" bigint, "p_currency" "text", "p_fund_account_id" "text", "p_utr" "text" DEFAULT NULL::"text", "p_fees_paise" bigint DEFAULT NULL::bigint, "p_tax_paise" bigint DEFAULT NULL::bigint, "p_status_details" "jsonb" DEFAULT NULL::"jsonb", "p_failure_reason" "text" DEFAULT NULL::"text", "p_created_at" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "public"."worker_payouts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_payout public.worker_payouts%rowtype;
  v_account public.worker_payout_accounts%rowtype;
  v_status text := lower(btrim(coalesce(p_provider_status, '')));
  v_local_rank integer;
  v_provider_rank integer;
begin
  if p_payout_id is null
     or nullif(btrim(coalesce(p_provider_payout_id, '')), '') is null
     or v_status not in (
       'queued','pending','rejected','processing',
       'processed','cancelled','reversed','failed'
     ) then
    raise exception 'Invalid payout provider update';
  end if;

  if coalesce(p_amount_paise, 0) <= 0
     or p_currency <> 'INR' then
    raise exception 'Invalid provider payout amount or currency';
  end if;

  select *
  into v_payout
  from public.worker_payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'Worker payout not found';
  end if;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = v_payout.payout_account_id
    and worker_id = v_payout.worker_id;

  if not found then
    raise exception 'Worker payout account not found';
  end if;

  if v_account.provider_fund_account_id is not null
     and v_account.provider_fund_account_id <> p_fund_account_id then
    raise exception 'Provider fund account does not match the local payout account';
  end if;

  if round(v_payout.amount * 100, 0)::bigint <> p_amount_paise
     or v_payout.currency <> p_currency then
    raise exception 'Provider payout amount or currency does not match the local payout';
  end if;

  if v_payout.provider_payout_id is not null
     and v_payout.provider_payout_id <> btrim(p_provider_payout_id) then
    raise exception 'Payout is already linked to a different provider payout';
  end if;

  v_local_rank := case v_payout.status
    when 'pending' then 20
    when 'queued' then 30
    when 'processing' then 50
    when 'rejected' then 100
    when 'failed' then 100
    when 'cancelled' then 100
    when 'processed' then 100
    when 'reversed' then 100
    else 0
  end;

  v_provider_rank := case v_status
    when 'pending' then 20
    when 'queued' then 30
    when 'processing' then 50
    when 'rejected' then 100
    when 'failed' then 100
    when 'cancelled' then 100
    when 'processed' then 100
    when 'reversed' then 100
    else 0
  end;

  if v_local_rank = 100 then
    select *
    into v_payout
    from public.worker_payouts
    where id = v_payout.id;

    return v_payout;
  end if;

  if v_provider_rank < v_local_rank then
    return v_payout;
  end if;

  update public.worker_payouts
  set
    provider_payout_id = btrim(p_provider_payout_id),
    provider_status = v_status,
    status = v_status,
    utr = nullif(btrim(coalesce(p_utr, '')), ''),
    provider_fee_amount = case
      when p_fees_paise is null then provider_fee_amount
      else round(p_fees_paise / 100.0, 2)
    end,
    provider_tax_amount = case
      when p_tax_paise is null then provider_tax_amount
      else round(p_tax_paise / 100.0, 2)
    end,
    provider_status_details = p_status_details,
    failure_reason = nullif(btrim(coalesce(p_failure_reason, '')), ''),
    provider_created_at = coalesce(p_created_at, provider_created_at),
    processed_at = case
      when v_status = 'processed' then coalesce(processed_at, now())
      when v_status in ('reversed','failed','cancelled','rejected') then processed_at
      else null
    end,
    last_reconciled_at = now(),
    reconciliation_error = null,
    reconciliation_attempts = reconciliation_attempts + 1,
    updated_at = now()
  where id = v_payout.id
  returning * into v_payout;

  return v_payout;
end;
$$;


ALTER FUNCTION "public"."apply_worker_payout_provider_update"("p_payout_id" "uuid", "p_provider_payout_id" "text", "p_provider_status" "text", "p_amount_paise" bigint, "p_currency" "text", "p_fund_account_id" "text", "p_utr" "text", "p_fees_paise" bigint, "p_tax_paise" bigint, "p_status_details" "jsonb", "p_failure_reason" "text", "p_created_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."assign_paid_booking_worker"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_is_service_role boolean := coalesce(auth.role(),'')='service_role';
begin
  if not v_is_service_role and not public.is_admin() then
    raise exception 'Administrator or service role required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id=p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.fulfillment_type in (
    'scheduled'::public.booking_fulfillment_type,
    'recurring'::public.booking_fulfillment_type
  ) then
    return jsonb_build_object(
      'success',true,
      'booking_id',v_booking.id,
      'assigned',false,
      'worker_id',null,
      'status',v_booking.status::text,
      'admin_assignment_required',true,
      'created_offers',0
    );
  end if;

  if v_booking.fulfillment_type <>
       'instant'::public.booking_fulfillment_type then
    raise exception 'Unsupported booking fulfillment type';
  end if;

  return public.dispatch_booking_worker_offers_internal(p_booking_id);
end;
$$;


ALTER FUNCTION "public"."assign_paid_booking_worker"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_assign_waiting_scheduled_bookings_for_worker"("p_worker_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return 0;
end;
$$;


ALTER FUNCTION "public"."auto_assign_waiting_scheduled_bookings_for_worker"("p_worker_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auto_dispatch_waiting_bookings_for_worker"("p_worker_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking record;
  v_offer_count integer := 0;
  v_result jsonb;
begin
  if p_worker_id is null then
    return 0;
  end if;

  /*
   * Re-dispatch never assigns directly.
   * It only creates a pending worker offer. The worker must accept
   * through worker_respond_to_offer() before the booking becomes assigned.
   */
  for v_booking in
    select b.id
    from public.bookings b
    where b.status in (
      'paid'::public.booking_status,
      'searching_worker'::public.booking_status
    )
      and b.worker_id is null
      and b.scheduled_end > now()
      and exists (
        select 1
        from public.payments p
        where p.booking_id = b.id
          and p.status = 'paid'::public.payment_status
      )
    order by b.scheduled_start asc, b.created_at asc
  loop
    begin
      v_result :=
        public.dispatch_booking_worker_offers_internal(
          v_booking.id
        );

      v_offer_count :=
        v_offer_count
        + coalesce(
            (v_result->>'created_offers')::integer,
            0
          );
    exception
      when others then
        null;
    end;
  end loop;

  return v_offer_count;
end;
$$;


ALTER FUNCTION "public"."auto_dispatch_waiting_bookings_for_worker"("p_worker_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_cancellation_refund"("p_amount" numeric, "p_scheduled_start" timestamp with time zone, "p_reference_time" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_hours numeric;
  v_refund_percent numeric := 0;
  v_fee numeric := 0;
  v_policy public.cancellation_policies%rowtype;
  v_refund numeric;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Cancellation amount is invalid';
  end if;

  if p_scheduled_start is null then
    raise exception 'Scheduled start is required';
  end if;

  v_hours :=
    extract(
      epoch from (
        p_scheduled_start - p_reference_time
      )
    ) / 3600.0;

  select *
  into v_policy
  from public.cancellation_policies cp
  where cp.is_active = true
    and cp.effective_from <= p_reference_time
    and (
      cp.effective_to is null
      or cp.effective_to > p_reference_time
    )
    and cp.hours_before_start <= greatest(v_hours, 0)
  order by
    cp.hours_before_start desc,
    cp.priority desc,
    cp.effective_from desc,
    cp.created_at desc
  limit 1;

  if found then
    v_refund_percent := v_policy.refund_percentage;
    v_fee := least(
      p_amount,
      coalesce(v_policy.cancellation_fee, 0)
    );
  end if;

  if v_hours < 0 then
    v_refund_percent := 0;
    v_fee := 0;
  end if;

  v_refund := greatest(
    round(
      (
        p_amount * v_refund_percent / 100.0
      ) - v_fee,
      2
    ),
    0
  );

  return jsonb_build_object(
    'hours_before_start',
      round(v_hours, 2),
    'refund_percentage',
      v_refund_percent,
    'cancellation_fee',
      round(v_fee, 2),
    'refund_amount',
      v_refund,
    'gross_amount',
      round(p_amount, 2)
  );
end;
$$;


ALTER FUNCTION "public"."calculate_cancellation_refund"("p_amount" numeric, "p_scheduled_start" timestamp with time zone, "p_reference_time" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_customer_booking_schedule"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[] DEFAULT '{}'::"date"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := auth.uid();
  v_service_id uuid;
  v_date date;
  v_weekday smallint;
  v_hours numeric;
  v_total_hours numeric := 0;
  v_working_days integer := 0;
  v_occurrences jsonb := '[]'::jsonb;
  v_area_exists boolean;
  v_selected_weekdays smallint[];
  v_off_dates date[] := coalesce(p_off_dates,'{}'::date[]);
  v_service_variant public.service_variants%rowtype;
  v_start_time time;
  v_end_time time;
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_service_variant_id is null then raise exception 'Service package is required'; end if;
  if p_address_id is null then raise exception 'Booking address is required'; end if;
  if p_start_date is null or p_end_date is null then raise exception 'Booking date range is required'; end if;
  if p_end_date < p_start_date then raise exception 'End date must be on or after start date'; end if;
  if p_daily_start_time is null or p_daily_end_time is null then raise exception 'Working hours are required'; end if;
  if p_daily_end_time <= p_daily_start_time then raise exception 'Working end time must be after start time'; end if;
  if p_selected_weekdays is null or cardinality(p_selected_weekdays) = 0 then raise exception 'At least one working weekday is required'; end if;
  if p_selected_weekdays <@ array[0,1,2,3,4,5,6]::smallint[] is not true then raise exception 'Invalid working weekday'; end if;
  if exists (select 1 from unnest(v_off_dates) d where d < p_start_date or d > p_end_date) then raise exception 'Off dates must be inside the selected booking date range'; end if;

  select * into v_service_variant from public.service_variants sv where sv.id = p_service_variant_id and sv.is_active = true;
  if not found then raise exception 'Service package is not available'; end if;

  select s.id into v_service_id from public.services s where s.id = v_service_variant.service_id and s.is_active = true;
  if v_service_id is null then raise exception 'Service is not available'; end if;

  if not exists (select 1 from public.addresses a where a.id = p_address_id and a.user_id = v_customer_id and a.latitude is not null and a.longitude is not null) then
    raise exception 'Valid customer address is required';
  end if;

  select exists (
    select 1 from public.service_areas sa join public.addresses a on a.id = p_address_id
    where sa.is_active = true
      and (sa.service_id = v_service_id or sa.service_id is null)
      and st_dwithin(st_setsrid(st_makepoint(sa.center_longitude,sa.center_latitude),4326)::geography,
                     coalesce(a.location,st_setsrid(st_makepoint(a.longitude,a.latitude),4326)::geography),sa.radius_km*1000)
  ) into v_area_exists;
  if not v_area_exists then raise exception 'This service is not currently available at the selected booking location'; end if;

  select coalesce((value->>'value')::time,'08:00:00'::time) into v_start_time
  from public.platform_settings where key='operations.default_start_time' and is_active=true limit 1;
  select coalesce((value->>'value')::time,'22:00:00'::time) into v_end_time
  from public.platform_settings where key='operations.default_end_time' and is_active=true limit 1;
  select coalesce(nullif(trim(value->>'value'),''),'Asia/Kolkata') into v_timezone
  from public.platform_settings where key='operations.timezone' and is_active=true limit 1;

  if v_start_time >= v_end_time then raise exception 'Operating hours configuration must have start time before end time'; end if;

  v_selected_weekdays := array(select distinct x from unnest(p_selected_weekdays) x order by x);
  v_hours := round(extract(epoch from (p_daily_end_time-p_daily_start_time))/3600.0,2);
  if v_hours < 1 then raise exception 'Minimum booking duration is 1 hour'; end if;
  if p_daily_start_time < v_start_time or p_daily_end_time > v_end_time then raise exception 'Requested working hours are outside configured operating hours'; end if;

  v_date := p_start_date;
  while v_date <= p_end_date loop
    v_weekday := extract(dow from v_date)::smallint;
    if v_weekday = any(v_selected_weekdays) and not (v_date = any(v_off_dates)) then
      v_local_start := (v_date::text || ' ' || p_daily_start_time::text || ' ' || v_timezone)::timestamptz at time zone v_timezone;
      v_local_end := (v_date::text || ' ' || p_daily_end_time::text || ' ' || v_timezone)::timestamptz at time zone v_timezone;
      if v_local_start::time < v_start_time or v_local_end::time > v_end_time then
        raise exception 'Requested working hours are outside configured operating hours';
      end if;
      if (v_date::text || ' ' || p_daily_start_time::text || ' ' || v_timezone)::timestamptz <= now() then
        raise exception 'Scheduled booking occurrences must be in the future';
      end if;
      v_working_days := v_working_days + 1;
      v_total_hours := v_total_hours + v_hours;
      v_occurrences := v_occurrences || jsonb_build_array(jsonb_build_object(
        'occurrence_index',v_working_days,
        'occurrence_date',v_date,
        'daily_start_time',p_daily_start_time,
        'daily_end_time',p_daily_end_time,
        'hours',v_hours
      ));
    end if;
    v_date := v_date + 1;
  end loop;

  if v_working_days = 0 then raise exception 'No working days remain after applying your selected weekdays and off days'; end if;

  return jsonb_build_object(
    'success',true,
    'service_id',v_service_id,
    'service_variant_id',p_service_variant_id,
    'address_id',p_address_id,
    'start_date',p_start_date,
    'end_date',p_end_date,
    'daily_start_time',p_daily_start_time,
    'daily_end_time',p_daily_end_time,
    'working_days',v_working_days,
    'hours_per_working_day',v_hours,
    'total_working_hours',v_total_hours,
    'working_weekdays',v_selected_weekdays,
    'off_dates',v_off_dates,
    'operating_start_time',v_start_time,
    'operating_end_time',v_end_time,
    'timezone',v_timezone,
    'occurrences',v_occurrences
  );
end;
$$;


ALTER FUNCTION "public"."calculate_customer_booking_schedule"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_multi_occurrence_booking_price"("p_service_variant_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[] DEFAULT '{}'::"date"[], "p_booking_type" "public"."booking_fulfillment_type" DEFAULT 'scheduled'::"public"."booking_fulfillment_type") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := auth.uid();
  v_service_id uuid;
  v_timezone text;
  v_date date;
  v_weekday smallint;
  v_daily_hours numeric(12,2);
  v_commit_days numeric(12,2);
  v_occurrence_count integer := 0;
  v_total_hours numeric(12,2) := 0;
  v_gross numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_service_discount numeric(12,2) := 0;
  v_promotion_discount numeric(12,2) := 0;
  v_recurring_commitment_discount numeric(12,2) := 0;
  v_platform_fee numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_final numeric(12,2) := 0;
  v_currency text := 'INR';
  v_price jsonb;
  v_prices jsonb := '[]'::jsonb;
  v_duration_tier_name text;
  v_promotion_id uuid;
  v_promotion_title text;
  v_promotion_discount_type text;
  v_promotion_discount_value numeric(12,2) := 0;
  v_promotion_stackable boolean := false;
begin
  if v_customer_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_customer_id
      and p.role = 'customer'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Active customer account required';
  end if;

  if p_booking_type not in (
    'scheduled'::public.booking_fulfillment_type,
    'recurring'::public.booking_fulfillment_type
  ) then
    raise exception 'Only scheduled or recurring pricing is supported';
  end if;

  if p_service_variant_id is null then
    raise exception 'Service package is required';
  end if;

  if p_schedule_start_date is null
     or p_schedule_end_date is null
     or p_schedule_end_date < p_schedule_start_date then
    raise exception 'Invalid booking date range';
  end if;

  if p_daily_start_time is null
     or p_daily_end_time is null
     or p_daily_end_time <= p_daily_start_time then
    raise exception 'Invalid daily working hours';
  end if;

  if p_selected_weekdays is null
     or cardinality(p_selected_weekdays) = 0 then
    raise exception 'At least one weekday is required';
  end if;

  if exists (
    select 1
    from unnest(p_selected_weekdays) d
    where d < 0 or d > 6
  ) then
    raise exception 'Invalid weekday selection';
  end if;

  p_off_dates := coalesce(p_off_dates, '{}'::date[]);

  if exists (
    select 1
    from unnest(p_off_dates) d
    where d < p_schedule_start_date
       or d > p_schedule_end_date
  ) then
    raise exception 'Off dates must be inside the selected date range';
  end if;

  select sv.service_id
  into v_service_id
  from public.service_variants sv
  join public.services s on s.id = sv.service_id
  where sv.id = p_service_variant_id
    and sv.is_active = true
    and lower(sv.billing_type) = 'hourly'
    and s.is_active = true;

  if v_service_id is null then
    raise exception 'An active hourly service variant is required';
  end if;

  select coalesce(
    nullif(trim(value->>'value'), ''),
    'Asia/Kolkata'
  )
  into v_timezone
  from public.platform_settings
  where key = 'operations.timezone'
    and is_active = true
  order by updated_at desc
  limit 1;

  v_timezone := coalesce(v_timezone, 'Asia/Kolkata');

  v_daily_hours := round(
    extract(epoch from (p_daily_end_time - p_daily_start_time)) / 3600.0,
    2
  );

  if v_daily_hours < 1 then
    raise exception 'Each occurrence must be at least 1 hour';
  end if;

  if p_daily_start_time <
     coalesce(
       (
         select (value->>'value')::time
         from public.platform_settings
         where key='operations.default_start_time'
           and is_active = true
         order by updated_at desc
         limit 1
       ),
       '08:00:00'::time
     )
     or p_daily_end_time >
     coalesce(
       (
         select (value->>'value')::time
         from public.platform_settings
         where key='operations.default_end_time'
           and is_active = true
         order by updated_at desc
         limit 1
       ),
       '22:00:00'::time
     ) then
    raise exception 'Requested working hours are outside configured operating hours';
  end if;

  v_commit_days := (p_schedule_end_date - p_schedule_start_date) + 1;
  v_date := p_schedule_start_date;

  while v_date <= p_schedule_end_date loop
    v_weekday := extract(dow from v_date)::smallint;

    if v_weekday = any(p_selected_weekdays)
       and not(v_date = any(p_off_dates)) then

      /*
       * Keep pricing aligned with create_customer_multi_occurrence_booking:
       * scheduled occurrences must be future, while recurring bookings
       * skip only a selected occurrence whose start has already passed.
       */
      if (
        (
          v_date::text || ' ' ||
          p_daily_start_time::text || ' ' ||
          v_timezone
        )::timestamptz <= now()
        and p_booking_type = 'scheduled'::public.booking_fulfillment_type
      ) then
        raise exception 'All selected booking occurrences must be in the future';
      end if;

      if (
        (
          v_date::text || ' ' ||
          p_daily_start_time::text || ' ' ||
          v_timezone
        )::timestamptz > now()
      ) then

        v_occurrence_count := v_occurrence_count + 1;
      v_total_hours := v_total_hours + v_daily_hours;

      if p_booking_type = 'recurring'::public.booking_fulfillment_type then
        v_price := public.calculate_recurring_occurrence_price(
          p_service_variant_id,
          v_daily_hours,
          v_commit_days
        );
      else
        v_price := public.calculate_service_booking_price(
          p_service_variant_id,
          v_daily_hours
        );
      end if;

      v_gross := v_gross +
        coalesce((v_price->>'gross_amount')::numeric, 0);

      v_discount := v_discount +
        coalesce((v_price->>'discount_amount')::numeric, 0);

      v_service_discount := v_service_discount +
        coalesce((v_price->>'service_discount_amount')::numeric, 0);

      v_promotion_discount := v_promotion_discount +
        coalesce((v_price->>'promotion_discount_amount')::numeric, 0);

      v_recurring_commitment_discount := v_recurring_commitment_discount +
        coalesce((v_price->>'recurring_discount_amount')::numeric, 0);

      v_platform_fee := v_platform_fee +
        coalesce((v_price->>'platform_fee')::numeric, 0);

      v_tax := v_tax +
        coalesce((v_price->>'tax_amount')::numeric, 0);

      v_final := v_final +
        coalesce((v_price->>'final_amount')::numeric, 0);

      v_currency := coalesce(v_price->>'currency', v_currency);

      if v_duration_tier_name is null
         and nullif(v_price->>'discount_tier_name', '') is not null
         and coalesce((v_price->>'service_discount_amount')::numeric, 0) > 0 then
        v_duration_tier_name := v_price->>'discount_tier_name';
      end if;

      if v_promotion_id is null
         and nullif(v_price->>'promotion_id', '') is not null then
        v_promotion_id := (v_price->>'promotion_id')::uuid;
        v_promotion_title := v_price->>'promotion_title';
        v_promotion_discount_type := v_price->>'promotion_discount_type';
        v_promotion_discount_value :=
          coalesce((v_price->>'promotion_discount_value')::numeric, 0);
        v_promotion_stackable :=
          coalesce((v_price->>'promotion_stackable_with_duration_discount')::boolean, false);
      end if;

      v_prices := v_prices || jsonb_build_array(
        jsonb_build_object(
          'occurrence_index', v_occurrence_count,
          'occurrence_date', v_date,
          'hours', v_daily_hours,
          'gross_amount', round(coalesce((v_price->>'gross_amount')::numeric, 0), 2),
          'discount_tier_id', v_price->'discount_tier_id',
          'discount_tier_name', v_price->>'discount_tier_name',
          'service_discount_percent', coalesce((v_price->>'service_discount_percent')::numeric, 0),
          'service_discount_amount', round(coalesce((v_price->>'service_discount_amount')::numeric, 0), 2),
          'discount_percent', coalesce((v_price->>'discount_percent')::numeric, 0),
          'discount_amount', round(coalesce((v_price->>'discount_amount')::numeric, 0), 2),
          'promotion_id', v_price->'promotion_id',
          'promotion_title', v_price->>'promotion_title',
          'promotion_discount_type', v_price->>'promotion_discount_type',
          'promotion_discount_value', coalesce((v_price->>'promotion_discount_value')::numeric, 0),
          'promotion_discount_amount', round(coalesce((v_price->>'promotion_discount_amount')::numeric, 0), 2),
          'promotion_stackable_with_duration_discount',
            coalesce((v_price->>'promotion_stackable_with_duration_discount')::boolean, false),
          'recurring_discount_tier_id', v_price->'recurring_discount_tier_id',
          'recurring_discount_tier_name', v_price->>'recurring_discount_tier_name',
          'recurring_discount_percent', coalesce((v_price->>'recurring_discount_percent')::numeric, 0),
          'recurring_discount_amount', round(coalesce((v_price->>'recurring_discount_amount')::numeric, 0), 2),
          'subtotal_after_discount', round(coalesce((v_price->>'subtotal_after_discount')::numeric, 0), 2),
          'platform_fee', round(coalesce((v_price->>'platform_fee')::numeric, 0), 2),
          'tax_amount', round(coalesce((v_price->>'tax_amount')::numeric, 0), 2),
          'total_amount', round(coalesce((v_price->>'final_amount')::numeric, 0), 2),
          'currency', v_price->>'currency'
        )
      );

      end if;
    end if;

    v_date := v_date + 1;
  end loop;

  if v_occurrence_count = 0 then
    raise exception 'No booking occurrences remain after weekday and off-date selection';
  end if;

  return jsonb_build_object(
    'success', true,
    'pricing_version', 8,
    'pricing_engine',
      case when p_booking_type = 'recurring'
        then 'service_hourly_recurring'
        else 'service_hourly_scheduled'
      end,
    'service_id', v_service_id,
    'service_variant_id', p_service_variant_id,
    'booking_type', p_booking_type,
    'occurrence_count', v_occurrence_count,
    'hours_per_occurrence', v_daily_hours,
    'total_working_hours', v_total_hours,
    'gross_amount', round(v_gross, 2),
    'discount_amount', round(v_discount, 2),
    'service_discount_percent',
      round(
        case when v_gross > 0
          then v_service_discount / v_gross * 100
          else 0
        end,
        2
      ),
    'service_discount_amount', round(v_service_discount, 2),
    'discount_tier_name', v_duration_tier_name,
    'promotion_id', v_promotion_id,
    'promotion_title', v_promotion_title,
    'promotion_discount_type', v_promotion_discount_type,
    'promotion_discount_value', v_promotion_discount_value,
    'promotion_discount_amount', round(v_promotion_discount, 2),
    'promotion_stackable_with_duration_discount', v_promotion_stackable,
    'recurring_commitment_discount_amount',
      round(v_recurring_commitment_discount, 2),
    'platform_fee', round(v_platform_fee, 2),
    'tax_amount', round(v_tax, 2),
    'final_amount', round(v_final, 2),
    'currency', v_currency,
    'commitment_days',
      case when p_booking_type = 'recurring'
        then v_commit_days
        else null
      end,
    'timezone', v_timezone,
    'occurrences', v_prices
  );
end;
$$;


ALTER FUNCTION "public"."calculate_multi_occurrence_booking_price"("p_service_variant_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_booking_type" "public"."booking_fulfillment_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_platform_charges"("p_subtotal" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_subtotal numeric(12,2);
  v_fee_percent numeric(8,4) := 0;
  v_fee_fixed numeric(12,2) := 0;
  v_tax_percent numeric(8,4) := 0;
  v_platform_fee numeric(12,2);
  v_taxable_amount numeric(12,2);
  v_tax_amount numeric(12,2);
  v_final_amount numeric(12,2);
begin
  if p_subtotal is null or p_subtotal < 0 then
    raise exception 'Invalid pricing subtotal';
  end if;

  v_subtotal := round(p_subtotal,2);

  select coalesce((value->>'value')::numeric,0)
    into v_fee_percent
  from public.platform_settings
  where key='pricing.platform_fee_percent'
    and is_active=true
  order by updated_at desc
  limit 1;

  select coalesce((value->>'value')::numeric,0)
    into v_fee_fixed
  from public.platform_settings
  where key='pricing.platform_fee_fixed'
    and is_active=true
  order by updated_at desc
  limit 1;

  select coalesce((value->>'value')::numeric,0)
    into v_tax_percent
  from public.platform_settings
  where key='pricing.tax_percent'
    and is_active=true
  order by updated_at desc
  limit 1;

  v_fee_percent := greatest(coalesce(v_fee_percent,0),0);
  v_fee_fixed := greatest(coalesce(v_fee_fixed,0),0);
  v_tax_percent := greatest(coalesce(v_tax_percent,0),0);

  v_platform_fee := round(
    (v_subtotal * v_fee_percent / 100.0) + v_fee_fixed,
    2
  );

  v_taxable_amount := round(v_subtotal + v_platform_fee,2);

  v_tax_amount := round(
    v_taxable_amount * v_tax_percent / 100.0,
    2
  );

  v_final_amount := round(
    v_subtotal + v_platform_fee + v_tax_amount,
    2
  );

  return jsonb_build_object(
    'subtotal_after_discount', v_subtotal,
    'platform_fee_percent', v_fee_percent,
    'platform_fee_fixed', v_fee_fixed,
    'platform_fee', v_platform_fee,
    'tax_percent', v_tax_percent,
    'taxable_amount', v_taxable_amount,
    'tax_amount', v_tax_amount,
    'final_amount', v_final_amount
  );
end;
$$;


ALTER FUNCTION "public"."calculate_platform_charges"("p_subtotal" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_recurring_occurrence_price"("p_service_variant_id" "uuid", "p_occurrence_hours" numeric, "p_commitment_days" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_base jsonb;
  v_service_id uuid;
  v_gross numeric(12,2);
  v_hourly_discount numeric(12,2);
  v_hourly_subtotal numeric(12,2);
  v_recurring_discount numeric(12,2) := 0;
  v_recurring_percent numeric(8,4) := 0;
  v_total_discount numeric(12,2);
  v_subtotal numeric(12,2);
  v_charges jsonb;
  v_tier_id uuid;
  v_tier_name text;
begin
  if p_occurrence_hours is null or p_occurrence_hours<1 then
    raise exception 'Occurrence hours must be at least 1 hour';
  end if;

  if p_commitment_days is null or p_commitment_days<=0 then
    raise exception 'Recurring commitment duration is required';
  end if;

  v_base := public.calculate_service_booking_price(
    p_service_variant_id,
    p_occurrence_hours
  );

  v_service_id := (v_base->>'service_id')::uuid;
  v_gross := round((v_base->>'gross_amount')::numeric,2);
  v_hourly_discount := round(coalesce((v_base->>'discount_amount')::numeric,0),2);
  v_hourly_subtotal := round(
    coalesce(
      (v_base->>'subtotal_after_discount')::numeric,
      v_gross-v_hourly_discount
    ),
    2
  );

  select
    t.id,
    t.name,
    coalesce(t.discount_percent,0)
  into
    v_tier_id,
    v_tier_name,
    v_recurring_percent
  from public.service_recurring_discount_tiers t
  where t.service_id=v_service_id
    and t.is_active=true
    and t.min_calendar_days<=p_commitment_days
    and (
      t.max_calendar_days is null
      or p_commitment_days<t.max_calendar_days
    )
    and t.effective_from<=now()
    and (
      t.effective_to is null
      or t.effective_to>now()
    )
  order by
    t.min_calendar_days desc,
    t.priority desc,
    t.effective_from desc,
    t.created_at desc
  limit 1;

  v_recurring_discount := round(
    v_hourly_subtotal*coalesce(v_recurring_percent,0)/100.0,
    2
  );

  v_total_discount := round(
    v_hourly_discount+v_recurring_discount,
    2
  );

  v_subtotal := round(
    v_gross-v_total_discount,
    2
  );

  v_charges := public.calculate_platform_charges(v_subtotal);

  return v_base || jsonb_build_object(
    'discount_source','hourly_plus_recurring_commitment',
    'hourly_discount_amount',v_hourly_discount,
    'recurring_discount_tier_id',v_tier_id,
    'recurring_discount_tier_name',v_tier_name,
    'recurring_discount_percent',coalesce(v_recurring_percent,0),
    'recurring_discount_amount',v_recurring_discount,
    'discount_tier_id',v_tier_id,
    'discount_tier_name',v_tier_name,
    'discount_percent',
      round(
        case when v_gross>0
          then v_total_discount/v_gross*100
          else 0
        end,
        2
      ),
    'discount_amount',v_total_discount,
    'subtotal_after_discount',v_subtotal,
    'platform_fee_percent',coalesce((v_charges->>'platform_fee_percent')::numeric,0),
    'platform_fee_fixed',coalesce((v_charges->>'platform_fee_fixed')::numeric,0),
    'platform_fee',coalesce((v_charges->>'platform_fee')::numeric,0),
    'tax_percent',coalesce((v_charges->>'tax_percent')::numeric,0),
    'tax_amount',coalesce((v_charges->>'tax_amount')::numeric,0),
    'final_amount',coalesce((v_charges->>'final_amount')::numeric,0),
    'commitment_days',p_commitment_days
  );
end;
$$;


ALTER FUNCTION "public"."calculate_recurring_occurrence_price"("p_service_variant_id" "uuid", "p_occurrence_hours" numeric, "p_commitment_days" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calculate_service_booking_price"("p_service_variant_id" "uuid", "p_total_working_hours" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := auth.uid();
  v_variant public.service_variants%rowtype;
  v_service_id uuid;
  v_price numeric;
  v_currency text := 'INR';
  v_gross numeric;
  v_discount_percent numeric := 0;
  v_discount_amount numeric := 0;
  v_subtotal numeric;
  v_charges jsonb;
  v_tier_id uuid;
  v_tier_name text;
  v_service_discount_percent numeric := 0;
  v_service_discount_amount numeric := 0;
  v_promotion jsonb := '{}'::jsonb;
  v_promotion_discount_amount numeric := 0;
  v_promotion_id uuid;
  v_promotion_title text;
  v_promotion_discount_type text;
  v_promotion_discount_value numeric := 0;
  v_promotion_stackable boolean := false;
  v_discount_source text := 'none';
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_service_variant_id is null then raise exception 'Service package is required'; end if;
  if p_total_working_hours is null or p_total_working_hours < 1 then raise exception 'Working hours must be at least 1 hour'; end if;

  select sv.* into v_variant
  from public.service_variants sv
  join public.services s on s.id = sv.service_id
  where sv.id = p_service_variant_id
    and sv.is_active = true
    and s.is_active = true;

  if not found then raise exception 'Service package is not available'; end if;
  if lower(v_variant.billing_type) <> 'hourly' then raise exception 'Only hourly service packages are supported by this pricing engine'; end if;

  v_service_id := v_variant.service_id;

  select svp.price, coalesce(svp.currency, 'INR')
  into v_price, v_currency
  from public.service_variant_prices svp
  where svp.service_variant_id = v_variant.id
    and svp.is_active = true
    and svp.effective_from <= now()
    and (svp.effective_to is null or svp.effective_to > now())
  order by svp.effective_from desc, svp.created_at desc
  limit 1;

  if v_price is null or v_price <= 0 then raise exception 'No valid active hourly price is configured for this service package'; end if;

  v_gross := round(p_total_working_hours * v_price, 2);

  select dt.id, dt.name, coalesce(dt.discount_percent, 0)
  into v_tier_id, v_tier_name, v_service_discount_percent
  from public.service_discount_tiers dt
  where dt.service_id = v_service_id
    and dt.is_active = true
    and dt.min_hours <= p_total_working_hours
    and (dt.max_hours is null or p_total_working_hours < dt.max_hours)
    and dt.effective_from <= now()
    and (dt.effective_to is null or dt.effective_to > now())
  order by dt.priority desc, dt.min_hours desc, dt.effective_from desc, dt.created_at desc
  limit 1;

  v_service_discount_amount := round(v_gross * coalesce(v_service_discount_percent, 0) / 100.0, 2);

  v_promotion := private.calculate_automatic_promotion_discount(
    v_service_id, p_total_working_hours, v_gross, v_currency, v_service_discount_amount
  );

  if coalesce((v_promotion->>'applied')::boolean, false) then
    v_promotion_id := (v_promotion->>'promotion_id')::uuid;
    v_promotion_title := v_promotion->>'promotion_title';
    v_promotion_discount_type := v_promotion->>'discount_type';
    v_promotion_discount_value := coalesce((v_promotion->>'discount_value')::numeric, 0);
    v_promotion_discount_amount := round(coalesce((v_promotion->>'discount_amount')::numeric, 0), 2);
    v_promotion_stackable := coalesce((v_promotion->>'stackable_with_duration_discount')::boolean, false);

    if v_promotion_stackable then
      v_discount_amount := round(v_service_discount_amount + v_promotion_discount_amount, 2);
      v_discount_source := 'promotion_plus_duration';
    else
      v_tier_id := null;
      v_tier_name := null;
      v_service_discount_percent := 0;
      v_service_discount_amount := 0;
      v_discount_amount := v_promotion_discount_amount;
      v_discount_source := 'promotion';
    end if;
  else
    v_discount_amount := v_service_discount_amount;
    if v_discount_amount > 0 then v_discount_source := 'duration_tier'; end if;
  end if;

  v_discount_percent := round(
    case when v_gross > 0 then v_discount_amount / v_gross * 100 else 0 end, 2
  );

  v_subtotal := round(greatest(v_gross - v_discount_amount, 0), 2);
  v_charges := public.calculate_platform_charges(v_subtotal);

  return jsonb_build_object(
    'success', true,
    'pricing_version', 7,
    'pricing_engine', 'service_hourly',
    'service_id', v_service_id,
    'service_variant_id', v_variant.id,
    'billing_type', 'hourly',
    'total_working_hours', p_total_working_hours,
    'hourly_price', round(v_price, 2),
    'currency', v_currency,
    'gross_amount', v_gross,
    'discount_source', v_discount_source,
    'discount_tier_id', v_tier_id,
    'discount_tier_name', v_tier_name,
    'discount_percent', v_discount_percent,
    'discount_amount', v_discount_amount,
    'service_discount_percent', coalesce(v_service_discount_percent, 0),
    'service_discount_amount', coalesce(v_service_discount_amount, 0),
    'promotion_id', v_promotion_id,
    'promotion_title', v_promotion_title,
    'promotion_discount_type', v_promotion_discount_type,
    'promotion_discount_value', v_promotion_discount_value,
    'promotion_discount_amount', v_promotion_discount_amount,
    'promotion_stackable_with_duration_discount', v_promotion_stackable,
    'subtotal_after_discount', v_subtotal,
    'platform_fee_percent', coalesce((v_charges->>'platform_fee_percent')::numeric, 0),
    'platform_fee_fixed', coalesce((v_charges->>'platform_fee_fixed')::numeric, 0),
    'platform_fee', coalesce((v_charges->>'platform_fee')::numeric, 0),
    'tax_percent', coalesce((v_charges->>'tax_percent')::numeric, 0),
    'tax_amount', coalesce((v_charges->>'tax_amount')::numeric, 0),
    'final_amount', coalesce((v_charges->>'final_amount')::numeric, 0)
  );
end;
$$;


ALTER FUNCTION "public"."calculate_service_booking_price"("p_service_variant_id" "uuid", "p_total_working_hours" numeric) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."calculate_service_booking_price"("p_service_variant_id" "uuid", "p_total_working_hours" numeric) IS 'Canonical hourly booking pricing engine. Uses service_variant_prices, duration discounts, promotions, platform charges, and tax.';



CREATE OR REPLACE FUNCTION "public"."can_access_booking_communication"("p_booking_id" "uuid", "p_occurrence_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.bookings b
    left join public.booking_schedule_occurrences o
      on o.id = p_occurrence_id
     and o.booking_id = b.id
    where b.id = p_booking_id
      and (
        (
          b.customer_id = auth.uid()
          and p_occurrence_id is null
          and b.worker_id is not null
          and b.status = 'on_the_way'
          and b.journey_started_at is not null
        )
        or
        (
          b.customer_id = auth.uid()
          and p_occurrence_id is not null
          and o.worker_id is not null
          and o.status = 'on_the_way'
          and o.journey_started_at is not null
        )
        or
        (
          p_occurrence_id is null
          and b.worker_id = auth.uid()
          and b.status = 'on_the_way'
          and b.journey_started_at is not null
        )
        or
        (
          p_occurrence_id is not null
          and o.worker_id = auth.uid()
          and o.status = 'on_the_way'
          and o.journey_started_at is not null
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_access_booking_communication"("p_booking_id" "uuid", "p_occurrence_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_customer_booking"("p_booking_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_quote jsonb;
  v_refund public.payment_refunds%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'customer'::public.user_role
      and is_active = true
  ) then
    raise exception 'Customer account is inactive';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.customer_id <> auth.uid() then
    raise exception 'Booking access denied';
  end if;

  if v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type then
    raise exception 'Recurring bookings require the series cancellation flow';
  end if;

  /*
   * Idempotent retry handling:
   * If the booking was already cancelled, return the existing
   * refund state instead of treating a client retry as a new
   * cancellation failure.
   */
  if v_booking.status = 'cancelled'::public.booking_status then
    select *
    into v_refund
    from public.payment_refunds
    where booking_id = v_booking.id
      and occurrence_id is null
    order by created_at desc
    limit 1;

    return jsonb_build_object(
      'success', true,
      'booking_id', v_booking.id,
      'status', 'cancelled',
      'refund_amount', coalesce(v_refund.amount, 0),
      'refund_id', v_refund.id,
      'already_cancelled', true
    );
  end if;

  if v_booking.status in ('completed','expired') then
    raise exception 'Booking cannot be cancelled in its current state';
  end if;

  if v_booking.worker_id is not null then
    raise exception 'Assigned booking requires support/admin cancellation flow';
  end if;

  select *
  into v_payment
  from public.payments
  where booking_id = p_booking_id
    and status in ('paid','partially_refunded')
  order by updated_at desc
  limit 1
  for update;

  v_quote := public.calculate_cancellation_refund(
    coalesce(v_booking.total_amount,0),
    v_booking.scheduled_start,
    now()
  );

  perform public.transition_booking_state(
    p_booking_id,
    'cancelled'::public.booking_status,
    null,
    false,
    true
  );

  if v_payment.id is not null
     and coalesce((v_quote->>'refund_amount')::numeric,0) > 0 then

    if coalesce((
      select sum(pr.amount)
      from public.payment_refunds pr
      where pr.payment_id = v_payment.id
        and pr.status in ('pending','processing','succeeded')
    ),0) + (v_quote->>'refund_amount')::numeric > v_payment.amount then
      raise exception 'Refund would exceed the remaining refundable amount';
    end if;

    insert into public.payment_refunds(
      payment_id,
      booking_id,
      amount,
      currency,
      reason,
      status,
      requested_by,
      requested_at
    )
    values(
      v_payment.id,
      v_booking.id,
      (v_quote->>'refund_amount')::numeric,
      v_payment.currency,
      coalesce(nullif(trim(p_reason),''),'Customer cancellation'),
      'pending',
      auth.uid(),
      now()
    )
    returning * into v_refund;
  end if;

  return jsonb_build_object(
    'success',true,
    'booking_id',p_booking_id,
    'status','cancelled',
    'refund',v_quote,
    'refund_amount',coalesce(v_refund.amount,0),
    'refund_id',v_refund.id
  );
end;
$$;


ALTER FUNCTION "public"."cancel_customer_booking"("p_booking_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_customer_booking_occurrence"("p_occurrence_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_occ public.booking_schedule_occurrences%rowtype;
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_quote jsonb;
  v_refund public.payment_refunds%rowtype;
  v_remaining integer := 0;
  v_completed integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'customer'::public.user_role
      and is_active = true
  ) then
    raise exception 'Customer account is inactive';
  end if;

  /*
   * Lock ordering is booking -> occurrence.
   * This matches the recurring series cancellation path.
   */
  select *
  into v_booking
  from public.bookings
  where id = (
    select booking_id
    from public.booking_schedule_occurrences
    where id = p_occurrence_id
  )
  for update;

  if not found then
    raise exception 'Occurrence not found';
  end if;

  if v_booking.customer_id <> auth.uid() then
    raise exception 'Booking access denied';
  end if;

  if v_booking.fulfillment_type <> 'recurring'::public.booking_fulfillment_type then
    raise exception 'Only recurring booking occurrences can be cancelled through the occurrence flow';
  end if;

  select *
  into v_occ
  from public.booking_schedule_occurrences
  where id = p_occurrence_id
    and booking_id = v_booking.id
  for update;

  if not found then
    raise exception 'Occurrence not found';
  end if;

  /*
   * Idempotent retry handling:
   * If the occurrence is already cancelled, return the existing
   * refund state rather than attempting a second cancellation.
   */
  if v_occ.status = 'cancelled' then
    select *
    into v_refund
    from public.payment_refunds
    where occurrence_id = v_occ.id
    order by created_at desc
    limit 1;

    return jsonb_build_object(
      'success', true,
      'occurrence_id', v_occ.id,
      'booking_id', v_booking.id,
      'status', 'cancelled',
      'refund_amount', coalesce(v_refund.amount, 0),
      'refund_id', v_refund.id,
      'already_cancelled', true
    );
  end if;

  if v_occ.status = 'completed' then
    raise exception 'Occurrence cannot be cancelled';
  end if;

  if v_booking.worker_id is not null then
    raise exception 'Customer cannot cancel a recurring occurrence after worker assignment';
  end if;

  if v_occ.worker_id is not null then
    raise exception 'Customer can cancel an occurrence only before worker assignment';
  end if;

  if v_occ.status in ('on_the_way','arrived','in_progress') then
    raise exception 'Customer cannot cancel an active occurrence';
  end if;

  v_quote := public.calculate_cancellation_refund(
    coalesce(v_occ.total_amount,0),
    v_occ.scheduled_start,
    now()
  );

  select *
  into v_payment
  from public.payments
  where booking_id = v_booking.id
    and status in ('paid','partially_refunded')
  order by updated_at desc
  limit 1
  for update;

  if v_payment.id is not null
     and coalesce((v_quote->>'refund_amount')::numeric,0) > 0
     and coalesce((
       select sum(pr.amount)
       from public.payment_refunds pr
       where pr.payment_id = v_payment.id
         and pr.status in ('pending','processing','succeeded')
     ),0) + (v_quote->>'refund_amount')::numeric > v_payment.amount then
    raise exception 'Refund would exceed remaining refundable amount';
  end if;

  update public.booking_schedule_occurrences
  set
    status = 'cancelled',
    worker_id = null,
    updated_at = now(),
    last_modified_at = now(),
    last_modified_by = auth.uid()
  where id = v_occ.id;

  if v_payment.id is not null
     and coalesce((v_quote->>'refund_amount')::numeric,0) > 0 then
    insert into public.payment_refunds(
      payment_id,
      booking_id,
      occurrence_id,
      amount,
      currency,
      reason,
      status,
      requested_by,
      requested_at
    )
    values(
      v_payment.id,
      v_booking.id,
      v_occ.id,
      (v_quote->>'refund_amount')::numeric,
      v_payment.currency,
      coalesce(nullif(trim(p_reason),''),'Occurrence cancellation'),
      'pending',
      auth.uid(),
      now()
    )
    returning * into v_refund;
  end if;

  select count(*)
  into v_remaining
  from public.booking_schedule_occurrences
  where booking_id = v_booking.id
    and status <> 'cancelled';

  if v_remaining > 0 then
    update public.bookings
    set
      scheduled_start = (
        select min(o.scheduled_start)
        from public.booking_schedule_occurrences o
        where o.booking_id = v_booking.id
          and o.status <> 'cancelled'
      ),
      scheduled_end = (
        select max(o.scheduled_end)
        from public.booking_schedule_occurrences o
        where o.booking_id = v_booking.id
          and o.status <> 'cancelled'
      ),
      updated_at = now()
    where id = v_booking.id;
  else
    select count(*)
    into v_completed
    from public.booking_schedule_occurrences
    where booking_id = v_booking.id
      and status = 'completed';

    if v_completed > 0 then
      update public.bookings
      set
        status = 'completed'::public.booking_status,
        completed_at = coalesce(completed_at, now()),
        end_otp_verified_at = coalesce(end_otp_verified_at, now()),
        updated_at = now()
      where id = v_booking.id
        and status not in (
          'completed'::public.booking_status,
          'cancelled'::public.booking_status
        );
    else
      perform public.transition_booking_state(
        v_booking.id,
        'cancelled'::public.booking_status,
        null,
        false,
        true
      );
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'occurrence_id', v_occ.id,
    'booking_id', v_booking.id,
    'status', 'cancelled',
    'refund', v_quote,
    'refund_amount', coalesce(v_refund.amount,0),
    'refund_id', v_refund.id,
    'remaining_occurrences', v_remaining
  );
end;
$$;


ALTER FUNCTION "public"."cancel_customer_booking_occurrence"("p_occurrence_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_customer_booking_series"("p_booking_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid:=auth.uid();
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_total_refund numeric:=0;
  v_occ record;
  v_refund public.payment_refunds%rowtype;
  v_cancellable_count integer:=0;
  v_assigned_count integer:=0;
  v_active_count integer:=0;
begin
  if v_customer_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id=v_customer_id
      and role='customer'::public.user_role
      and is_active=true
  ) then
    raise exception 'Customer account is inactive';
  end if;

  select * into v_booking
  from public.bookings
  where id=p_booking_id
    and customer_id=v_customer_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if not exists (
    select 1
    from public.booking_schedule_occurrences
    where booking_id=p_booking_id
  ) then
    raise exception 'Booking is not recurring';
  end if;

  if v_booking.status='cancelled'::public.booking_status then
    return jsonb_build_object(
      'success',true,
      'booking_id',p_booking_id,
      'status','cancelled',
      'refund_amount',0,
      'refund_id',null,
      'already_cancelled',true
    );
  end if;

  if v_booking.status in (
    'completed'::public.booking_status,
    'expired'::public.booking_status
  ) then
    raise exception 'Booking cannot be cancelled in its current state';
  end if;

  if v_booking.worker_id is not null then
    raise exception 'Customer can cancel the recurring series only before worker assignment';
  end if;

  select count(*) into v_assigned_count
  from public.booking_schedule_occurrences
  where booking_id=p_booking_id
    and worker_id is not null;

  if v_assigned_count>0 then
    raise exception 'Customer can cancel the recurring series only before worker assignment';
  end if;

  select count(*) into v_active_count
  from public.booking_schedule_occurrences
  where booking_id=p_booking_id
    and status in ('on_the_way','arrived','in_progress');

  if v_active_count>0 then
    raise exception 'Recurring booking cannot be cancelled while an occurrence is active';
  end if;

  for v_occ in
    select *
    from public.booking_schedule_occurrences
    where booking_id=p_booking_id
      and status not in ('completed','cancelled')
    order by occurrence_index
    for update
  loop
    v_cancellable_count:=v_cancellable_count+1;
    v_total_refund:=v_total_refund+
      coalesce((
        public.calculate_cancellation_refund(
          coalesce(v_occ.total_amount,0),
          v_occ.scheduled_start,
          now()
        )->>'refund_amount'
      )::numeric,0);
  end loop;

  if v_cancellable_count=0 then
    raise exception 'No cancellable occurrences remain';
  end if;

  select * into v_payment
  from public.payments
  where booking_id=p_booking_id
    and status in ('paid','partially_refunded')
  order by updated_at desc
  limit 1
  for update;

  if v_payment.id is not null and v_total_refund>0 then
    if coalesce((
      select sum(pr.amount)
      from public.payment_refunds pr
      where pr.payment_id=v_payment.id
        and pr.status in ('pending','processing','succeeded')
    ),0)+v_total_refund>v_payment.amount then
      raise exception 'Refund would exceed remaining refundable amount';
    end if;
  end if;

  perform public.transition_booking_state(
    p_booking_id,
    'cancelled'::public.booking_status,
    null,
    false,
    true
  );

  if v_payment.id is not null and v_total_refund>0 then
    insert into public.payment_refunds(
      payment_id,booking_id,amount,currency,reason,
      status,requested_by,requested_at
    )
    values(
      v_payment.id,
      p_booking_id,
      round(v_total_refund,2),
      v_payment.currency,
      coalesce(nullif(trim(p_reason),''),'Recurring series cancellation'),
      'pending',
      v_customer_id,
      now()
    )
    returning * into v_refund;
  end if;

  return jsonb_build_object(
    'success',true,
    'booking_id',p_booking_id,
    'status','cancelled',
    'refund_amount',round(v_total_refund,2),
    'refund_id',v_refund.id,
    'cancelled_occurrences',v_cancellable_count
  );
end;
$$;


ALTER FUNCTION "public"."cancel_customer_booking_series"("p_booking_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_service_availability_request"("p_request_id" "uuid") RETURNS "public"."service_availability_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_result public.service_availability_requests;
begin
  if (SELECT auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  update public.service_availability_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id
    and customer_id = (SELECT auth.uid())
    and status = 'pending'
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Pending availability request not found';
  end if;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."cancel_service_availability_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."capture_booking_schedule_occurrence_cancelled_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'cancelled' THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    ELSE
      NEW.cancelled_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    ELSE
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, OLD.cancelled_at, now());
    END IF;
  ELSE
    NEW.cancelled_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."capture_booking_schedule_occurrence_cancelled_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_account_phone"("p_phone" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_phone text := public.normalize_account_phone(p_phone);
  v_role text;
begin
  if v_phone is null or length(v_phone) < 8 then
    return jsonb_build_object(
      'exists', false,
      'account_type', null,
      'message', null
    );
  end if;

  select p.role::text
    into v_role
  from public.profiles p
  where public.normalize_account_phone(p.phone) = v_phone
  order by p.created_at asc
  limit 1;

  if v_role is null then
    return jsonb_build_object(
      'exists', false,
      'account_type', null,
      'message', null
    );
  end if;

  if v_role = 'worker' then
    return jsonb_build_object(
      'exists', true,
      'account_type', 'worker',
      'message', 'This phone number is already registered as a worker account. Close your worker account or use a different number.'
    );
  end if;

  if v_role = 'customer' then
    return jsonb_build_object(
      'exists', true,
      'account_type', 'customer',
      'message', 'This phone number is already registered as a customer account. Delete your customer account or use a different number.'
    );
  end if;

  return jsonb_build_object(
    'exists', true,
    'account_type', v_role,
    'message', 'This phone number is already registered to another account type. Use a different number.'
  );
end;
$$;


ALTER FUNCTION "public"."check_account_phone"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_customer_instant_worker_availability"("p_service_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := auth.uid();
  v_customer_location geography;
  v_area_available boolean := false;
  v_worker_count integer := 0;
  v_nearest_worker_id uuid := null;
  v_nearest_distance_km numeric(12,3) := null;
begin
  if v_customer_id is null then
    raise exception 'Authentication required';
  end if;

  if p_service_id is null
     or p_latitude is null
     or p_longitude is null
     or p_latitude < -90
     or p_latitude > 90
     or p_longitude < -180
     or p_longitude > 180 then
    raise exception 'Valid service and location are required';
  end if;

  v_customer_location := st_setsrid(
    st_makepoint(p_longitude, p_latitude),
    4326
  )::geography;

  select exists (
    select 1
    from public.service_areas sa
    where sa.is_active = true
      and (sa.service_id = p_service_id or sa.service_id is null)
      and st_dwithin(
        st_setsrid(
          st_makepoint(sa.center_longitude, sa.center_latitude),
          4326
        )::geography,
        v_customer_location,
        sa.radius_km * 1000
      )
  )
  into v_area_available;

  if not v_area_available then
    return jsonb_build_object(
      'service_area_available', false,
      'nearby_worker_available', false,
      'instant_available', false,
      'recommended_booking_type', 'scheduled',
      'nearby_worker_count', 0,
      'nearest_worker_id', null,
      'nearest_worker_distance_km', null
    );
  end if;

  with candidates as (
    select
      wp.id as worker_id,
      st_distance(wl.location, v_customer_location) / 1000.0 as distance_km
    from public.worker_profiles wp
    join public.worker_services ws
      on ws.worker_id = wp.id
     and ws.service_id = p_service_id
    join public.worker_presence pr
      on pr.worker_id = wp.id
     and pr.is_available = true
     and pr.expires_at > now()
    join lateral (
      select wl.location
      from public.worker_locations wl
      where wl.worker_id = wp.id
        and wl.location is not null
        and wl.recorded_at >= now() - interval '10 minutes'
      order by wl.recorded_at desc
      limit 1
    ) wl on true
    where wp.is_verified = true
      and wp.worker_status = 'available'::public.worker_status
      and wp.service_radius_km > 0
      and st_dwithin(
        wl.location,
        v_customer_location,
        least(wp.service_radius_km, 10) * 1000
      )
      and st_dwithin(
        wl.location,
        v_customer_location,
        10000
      )
  )
  select
    count(*)::integer,
    (array_agg(worker_id order by distance_km asc, worker_id asc))[1],
    round(min(distance_km)::numeric, 3)
  into
    v_worker_count,
    v_nearest_worker_id,
    v_nearest_distance_km
  from candidates;

  return jsonb_build_object(
    'service_area_available', true,
    'nearby_worker_available', v_worker_count > 0,
    'instant_available', v_worker_count > 0,
    'recommended_booking_type',
      case when v_worker_count > 0 then 'instant' else 'scheduled' end,
    'nearby_worker_count', v_worker_count,
    'nearest_worker_id', v_nearest_worker_id,
    'nearest_worker_distance_km', v_nearest_distance_km
  );
end;
$$;


ALTER FUNCTION "public"."check_customer_instant_worker_availability"("p_service_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_service_availability"("p_customer_latitude" double precision, "p_customer_longitude" double precision, "p_service_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_point public.geography(point,4326);
  v_area boolean:=false;
  v_workers integer:=0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_service_id is null then raise exception 'Service is required'; end if;
  if p_customer_latitude is null or p_customer_longitude is null
     or p_customer_latitude < -90 or p_customer_latitude > 90
     or p_customer_longitude < -180 or p_customer_longitude > 180 then
    raise exception 'Invalid coordinates';
  end if;

  if not exists (
    select 1 from public.services s
    where s.id=p_service_id and s.is_active=true
  ) then
    raise exception 'Service is not available';
  end if;

  v_point:=st_setsrid(st_makepoint(p_customer_longitude,p_customer_latitude),4326)::public.geography;

  select exists(
    select 1
    from public.service_areas sa
    where sa.is_active=true
      and (sa.service_id=p_service_id or sa.service_id is null)
      and st_dwithin(
        st_setsrid(st_makepoint(sa.center_longitude,sa.center_latitude),4326)::public.geography,
        v_point,
        sa.radius_km*1000
      )
  ) into v_area;

  if v_area then
    select count(distinct wp.id)::integer into v_workers
    from public.worker_profiles wp
    join public.worker_services ws on ws.worker_id=wp.id and ws.service_id=p_service_id
    join public.worker_presence pr on pr.worker_id=wp.id and pr.is_available=true and pr.expires_at>now()
    join lateral (
      select wl.location
      from public.worker_locations wl
      where wl.worker_id=wp.id
        and wl.location is not null
        and wl.recorded_at>=now()-interval '10 minutes'
      order by wl.recorded_at desc
      limit 1
    ) wl on true
    where wp.worker_status='available'::public.worker_status
      and wp.is_verified=true
      and wp.service_radius_km>0
      and st_dwithin(wl.location,v_point,wp.service_radius_km*1000);
  end if;

  return jsonb_build_object(
    'available',v_area and v_workers>0,
    'service_area_covered',v_area,
    'available_workers',v_workers
  );
end;
$$;


ALTER FUNCTION "public"."check_service_availability"("p_customer_latitude" double precision, "p_customer_longitude" double precision, "p_service_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_payment_refund"("p_refund_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_refund public.payment_refunds%rowtype;
  v_payment public.payments%rowtype;
  v_reserved numeric := 0;
  v_remaining numeric := 0;
begin
  if p_refund_id is null then
    raise exception 'Refund ID is required';
  end if;

  /*
   * Lock the refund first, then its payment.
   * This is the same lock order used by the refund
   * finalization path and prevents concurrent claims
   * from oversubscribing one payment.
   */
  select *
  into v_refund
  from public.payment_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund not found';
  end if;

  /*
   * Idempotent behavior:
   * an already-processing or already-succeeded refund
   * must never be claimed a second time.
   */
  if v_refund.status = 'succeeded' then
    return jsonb_build_object(
      'success', true,
      'status', 'succeeded',
      'refund_id', v_refund.id,
      'idempotent', true
    );
  end if;

  if v_refund.status = 'processing' then
    return jsonb_build_object(
      'success', true,
      'status', 'processing',
      'refund_id', v_refund.id,
      'idempotent', true
    );
  end if;

  if v_refund.status in (
    'failed',
    'cancelled'
  ) then
    raise exception
      'Refund cannot be claimed from terminal status %',
      v_refund.status;
  end if;

  if v_refund.status <> 'pending' then
    raise exception
      'Refund has unsupported current status %',
      v_refund.status;
  end if;

  if v_refund.amount is null
     or v_refund.amount <= 0 then
    raise exception
      'Refund amount must be greater than zero';
  end if;

  /*
   * Lock the payment before calculating the remaining
   * refundable balance. Every refund for the same payment
   * therefore serializes through this row lock.
   */
  select *
  into v_payment
  from public.payments
  where id = v_refund.payment_id
  for update;

  if not found then
    raise exception 'Payment not found for refund';
  end if;

  if v_payment.provider <> 'razorpay' then
    raise exception
      'Unsupported payment provider %',
      v_payment.provider;
  end if;

  if v_payment.provider_payment_id is null
     or btrim(v_payment.provider_payment_id) = '' then
    raise exception
      'Provider payment ID is missing';
  end if;

  if v_payment.amount is null
     or v_payment.amount <= 0 then
    raise exception
      'Payment amount is invalid';
  end if;

  if v_refund.currency <> v_payment.currency then
    raise exception
      'Refund currency does not match payment currency';
  end if;

  if v_payment.status not in (
    'paid'::public.payment_status,
    'partially_refunded'::public.payment_status
  ) then
    raise exception
      'Payment is not refundable in status %',
      v_payment.status;
  end if;

  /*
   * Pending + processing + succeeded refunds are treated
   * as reserved amounts.
   *
   * This is important because a processing Razorpay request
   * may already have succeeded at the provider even when
   * the local database has not received confirmation yet.
   */
  select coalesce(sum(pr.amount), 0)
  into v_reserved
  from public.payment_refunds pr
  where pr.payment_id = v_payment.id
    and pr.id <> v_refund.id
    and pr.status in (
      'pending',
      'processing',
      'succeeded'
    );

  if v_reserved + v_refund.amount > v_payment.amount then
    raise exception
      'Refund would exceed the remaining refundable amount';
  end if;

  update public.payment_refunds
  set
    status = 'processing',
    failure_reason = null,
    processed_at = null,
    updated_at = now()
  where id = v_refund.id
    and status = 'pending';

  if not found then
    /*
     * The row is locked, so this is an unexpected state
     * transition. Re-read the authoritative state.
     */
    select status
    into v_refund.status
    from public.payment_refunds
    where id = v_refund.id;

    if v_refund.status in (
      'processing',
      'succeeded'
    ) then
      return jsonb_build_object(
        'success', true,
        'status', v_refund.status,
        'refund_id', v_refund.id,
        'idempotent', true
      );
    end if;

    raise exception
      'Refund could not be claimed for processing';
  end if;

  v_remaining :=
    greatest(
      v_payment.amount
        - v_reserved
        - v_refund.amount,
      0
    );

  return jsonb_build_object(
    'success', true,
    'status', 'processing',
    'refund_id', v_refund.id,
    'payment_id', v_payment.id,
    'payment_amount',
      round(v_payment.amount, 2),
    'claimed_amount',
      round(v_refund.amount, 2),
    'reserved_before_claim',
      round(v_reserved, 2),
    'remaining_refundable_amount',
      round(v_remaining, 2),
    'idempotent', false
  );
end;
$$;


ALTER FUNCTION "public"."claim_payment_refund"("p_refund_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_customer_account_deletion"("p_request_id" "uuid", "p_auth_user_id" "uuid", "p_profile_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
  INTO v_request
  FROM public.account_deletion_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found';
  END IF;

  IF v_request.user_id <> p_profile_id THEN
    RAISE EXCEPTION 'Deletion request does not match the retained profile';
  END IF;

  IF v_request.status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', true,
      'request_id', p_request_id,
      'status', 'approved'
    );
  END IF;

  IF v_request.status <> 'processing' THEN
    RAISE EXCEPTION 'Deletion request is not being processed';
  END IF;

  IF v_request.auth_user_id IS DISTINCT FROM p_auth_user_id THEN
    RAISE EXCEPTION 'Deletion request does not match the Auth identity being removed';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_auth_user_id) THEN
    RAISE EXCEPTION 'Supabase Auth identity still exists; deletion is not complete';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_profile_id) THEN
    RAISE EXCEPTION 'Retained pseudonymous profile ID unexpectedly has an Auth identity';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.role = 'customer'::public.user_role
      AND p.is_active = false
      AND p.full_name = 'Deleted customer'
      AND p.company_name = 'Deleted customer'
      AND p.email IS NULL
      AND p.phone IS NULL
      AND p.avatar_url IS NULL
  ) THEN
    RAISE EXCEPTION 'Pseudonymous customer profile is missing or not fully scrubbed';
  END IF;

  UPDATE public.account_deletion_requests
  SET status = 'approved',
      auth_user_id = NULL,
      reason = NULL,
      reviewed_at = COALESCE(reviewed_at, now()),
      reviewed_by = COALESCE(reviewed_by, auth.uid())
  WHERE id = p_request_id;

  PERFORM public.write_admin_audit(
    'complete_account_deletion',
    'account_deletion_request',
    p_request_id,
    jsonb_build_object('status', 'processing'),
    jsonb_build_object('status', 'approved', 'auth_identity_deleted', true)
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'approved'
  );
END;
$$;


ALTER FUNCTION "public"."complete_customer_account_deletion"("p_request_id" "uuid", "p_auth_user_id" "uuid", "p_profile_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_test_payment"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$

declare
  v_booking public.bookings%rowtype;
  v_result jsonb;

begin

  if auth.uid() is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  end if;


  -- ----------------------------------------------------------
  -- Customer authorization and payment-state validation
  -- ----------------------------------------------------------

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
    and customer_id = auth.uid()
  for update;


  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Booking not found or does not belong to this customer'
    );
  end if;


  if v_booking.status not in (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'Booking is not awaiting payment confirmation'
    );
  end if;


  -- ----------------------------------------------------------
  -- Central authoritative transition
  -- ----------------------------------------------------------

  v_result := public.transition_booking_state(
    p_booking_id,
    'paid'::public.booking_status
  );


  return jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'action', 'payment_complete',
    'old_status', v_result->>'old_status',
    'status', v_result->>'status'
  );

end;

$$;


ALTER FUNCTION "public"."complete_test_payment"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_booking_status_notifications"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_service_name text;
  v_customer_title text;
  v_customer_message text;
  v_worker_title text;
  v_worker_message text;
  v_type text;
begin
  if new.new_status in (
    'pending_payment'::public.booking_status
  ) then
    return new;
  end if;

  select b.*
  into v_booking
  from public.bookings b
  where b.id=new.booking_id;

  if not found then
    return new;
  end if;

  select s.name
  into v_service_name
  from public.service_variants sv
  join public.services s on s.id=sv.service_id
  where sv.id=v_booking.service_variant_id;

  v_service_name:=coalesce(v_service_name,'Your service');

  case new.new_status
    when 'paid'::public.booking_status then
      v_type:='booking_payment';
      v_customer_title:='Payment confirmed';
      v_customer_message:=v_service_name||' payment was received. We are finding your worker.';
    when 'searching_worker'::public.booking_status then
      v_type:='worker_search';
      v_customer_title:='Finding your worker';
      v_customer_message:='Your booking is paid. We are finding an eligible worker.';
    when 'assigned'::public.booking_status then
      v_type:='worker_assigned';
      v_customer_title:='Worker assigned';
      v_customer_message:='A worker has been assigned to your '||lower(v_service_name)||' booking.';
      v_worker_title:='New booking assigned';
      v_worker_message:='You have been assigned a new '||lower(v_service_name)||' booking.';
    when 'on_the_way'::public.booking_status then
      v_type:='worker_on_the_way';
      v_customer_title:='Worker is on the way';
      v_customer_message:='Your assigned worker is on the way.';
    when 'arrived'::public.booking_status then
      v_type:='worker_arrived';
      v_customer_title:='Worker has arrived';
      v_customer_message:='Your worker has arrived at the service location.';
    when 'in_progress'::public.booking_status then
      v_type:='service_started';
      v_customer_title:='Service started';
      v_customer_message:='Your service has started.';
    when 'completed'::public.booking_status then
      v_type:='service_completed';
      v_customer_title:='Service completed';
      v_customer_message:='Your service has been completed.';
    when 'cancelled'::public.booking_status then
      v_type:='booking_cancelled';
      v_customer_title:='Booking cancelled';
      v_customer_message:='Your booking has been cancelled.';
    when 'payment_failed'::public.booking_status then
      v_type:='payment_failed';
      v_customer_title:='Payment failed';
      v_customer_message:='Your booking payment could not be completed.';
    else
      return new;
  end case;

  if v_booking.customer_id is not null then
    insert into public.notifications(
      user_id,
      booking_id,
      title,
      message,
      notification_type
    )
    values(
      v_booking.customer_id,
      v_booking.id,
      v_customer_title,
      v_customer_message,
      v_type
    );
  end if;

  if new.new_status='assigned'::public.booking_status
     and v_booking.worker_id is not null
     and v_worker_title is not null then
    insert into public.notifications(
      user_id,
      booking_id,
      title,
      message,
      notification_type
    )
    values(
      v_booking.worker_id,
      v_booking.id,
      v_worker_title,
      v_worker_message,
      'worker_booking_assigned'
    );
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."create_booking_status_notifications"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_fulfillment_type" "public"."booking_fulfillment_type", "p_scheduled_start" timestamp with time zone, "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := auth.uid();
  v_variant public.service_variants%rowtype;
  v_price numeric;
  v_currency text;
  v_duration_value integer;
  v_duration_unit public.booking_duration_unit;
  v_start timestamptz;
  v_end timestamptz;
  v_booking public.bookings%rowtype;
  v_address_exists boolean;
  v_pricing_snapshot jsonb;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_customer_id and p.role = 'customer' and p.is_active = true
  ) then raise exception 'Active customer account required'; end if;

  select * into v_variant
  from public.service_variants sv
  where sv.id = p_service_variant_id and sv.is_active = true;

  if not found then raise exception 'Service package is not available'; end if;

  if not exists (
    select 1 from public.services s
    where s.id = v_variant.service_id and s.is_active = true
  ) then raise exception 'Service is not available'; end if;

  select exists (
    select 1 from public.addresses a
    where a.id = p_address_id and a.user_id = v_customer_id
      and a.latitude is not null and a.longitude is not null
  ) into v_address_exists;
  if not v_address_exists then raise exception 'Valid customer address is required'; end if;

  if not exists (
    select 1
    from public.service_areas sa
    join public.addresses a on a.id = p_address_id
    where sa.is_active = true
      and (sa.service_id = v_variant.service_id or sa.service_id is null)
      and st_dwithin(
        st_setsrid(st_makepoint(sa.center_longitude, sa.center_latitude),4326)::geography,
        coalesce(a.location, st_setsrid(st_makepoint(a.longitude,a.latitude),4326)::geography),
        sa.radius_km * 1000
      )
  ) then raise exception 'This service is not currently available at the selected booking location'; end if;

  select svp.price, svp.currency
  into v_price, v_currency
  from public.service_variant_prices svp
  where svp.service_variant_id = v_variant.id
    and svp.is_active = true
    and svp.effective_from <= now()
    and (svp.effective_to is null or svp.effective_to > now())
  order by svp.effective_from desc, svp.created_at desc
  limit 1;

  if v_price is null then raise exception 'No active price is configured for this service package'; end if;
  if v_price <= 0 then raise exception 'Service package has an invalid price'; end if;

  v_currency := coalesce(v_currency, 'INR');
  v_duration_value := coalesce(v_variant.duration_value, 1);
  v_duration_unit := coalesce(v_variant.duration_unit, 'hour')::public.booking_duration_unit;
  if v_duration_value <= 0 then raise exception 'Service package has an invalid duration'; end if;

  if p_fulfillment_type = 'instant'::public.booking_fulfillment_type then
    v_start := now();
  elsif p_fulfillment_type = 'scheduled'::public.booking_fulfillment_type then
    if p_scheduled_start is null then raise exception 'Scheduled start time is required'; end if;
    v_start := p_scheduled_start;
    if v_start <= now() then raise exception 'Scheduled booking time must be in the future'; end if;
  else raise exception 'Invalid booking fulfillment type'; end if;

  v_end := case v_duration_unit
    when 'hour' then v_start + make_interval(hours => v_duration_value)
    when 'day' then v_start + make_interval(days => v_duration_value)
    when 'week' then v_start + make_interval(days => v_duration_value * 7)
    when 'month' then v_start + make_interval(months => v_duration_value)
  end;

  v_pricing_snapshot := jsonb_build_object(
    'pricing_version', 1,
    'source', 'service_variant_prices',
    'service_id', v_variant.service_id,
    'service_variant_id', v_variant.id,
    'service_variant_name', v_variant.name,
    'price', round(v_price, 2),
    'currency', v_currency,
    'discount_percent', 0,
    'discount_amount', 0,
    'base_amount', round(v_price, 2),
    'platform_fee', 0,
    'tax_amount', 0,
    'total_amount', round(v_price, 2),
    'calculated_at', now()
  );

  insert into public.bookings (
    customer_id, worker_id, service_id, service_variant_id, address_id,
    status, duration_value, duration_unit, scheduled_start, scheduled_end,
    base_amount, platform_fee, tax_amount, total_amount, notes,
    fulfillment_type, pricing_snapshot
  ) values (
    v_customer_id, null, v_variant.service_id, v_variant.id, p_address_id,
    'pending_payment'::public.booking_status, v_duration_value, v_duration_unit,
    v_start, v_end, round(v_price,2), 0, 0, round(v_price,2),
    nullif(trim(p_notes),''), p_fulfillment_type, v_pricing_snapshot
  ) returning * into v_booking;

  insert into public.booking_status_history (
    booking_id, old_status, new_status, changed_by, created_at
  ) values (
    v_booking.id, null, 'pending_payment'::public.booking_status, v_customer_id, now()
  );

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'service_id', v_booking.service_id,
    'service_variant_id', v_booking.service_variant_id,
    'fulfillment_type', v_booking.fulfillment_type,
    'status', v_booking.status,
    'scheduled_start', v_booking.scheduled_start,
    'scheduled_end', v_booking.scheduled_end,
    'base_amount', v_booking.base_amount,
    'platform_fee', v_booking.platform_fee,
    'tax_amount', v_booking.tax_amount,
    'total_amount', v_booking.total_amount,
    'pricing_snapshot', v_booking.pricing_snapshot
  );
end;
$$;


ALTER FUNCTION "public"."create_customer_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_fulfillment_type" "public"."booking_fulfillment_type", "p_scheduled_start" timestamp with time zone, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_hourly_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_booking_type" "public"."booking_fulfillment_type", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_notes" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := auth.uid();
  v_variant public.service_variants%rowtype;
  v_address public.addresses%rowtype;
  v_start timestamptz := p_scheduled_start;
  v_end timestamptz := p_scheduled_end;
  v_hours numeric(12,2);
  v_price jsonb;
  v_booking public.bookings%rowtype;
  v_timezone text;
  v_today date;
  v_tomorrow date;
  v_local_start timestamp;
  v_local_end timestamp;
  v_instant_workers integer := 0;
  v_schedule_workers integer := 0;
  v_nearby_worker_count integer := 0;
  v_requested_worker_count integer := 0;
begin
  if v_customer_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id=v_customer_id and p.role='customer' and p.is_active=true
  ) then
    raise exception 'Active customer account required';
  end if;

  if p_booking_type not in (
    'instant'::public.booking_fulfillment_type,
    'scheduled'::public.booking_fulfillment_type
  ) then
    raise exception 'Only instant or scheduled booking is supported';
  end if;

  select * into v_variant
  from public.service_variants sv
  where sv.id=p_service_variant_id
    and sv.is_active=true
    and lower(sv.billing_type)='hourly';

  if not found then
    raise exception 'An active hourly service variant is required';
  end if;

  select * into v_address
  from public.addresses a
  where a.id=p_address_id
    and a.user_id=v_customer_id
    and a.latitude is not null
    and a.longitude is not null;

  if not found then
    raise exception 'Valid customer address is required';
  end if;

  if not exists (
    select 1
    from public.service_areas sa
    where sa.is_active=true
      and (sa.service_id=v_variant.service_id or sa.service_id is null)
      and st_dwithin(
        st_setsrid(st_makepoint(sa.center_longitude,sa.center_latitude),4326)::geography,
        coalesce(
          v_address.location,
          st_setsrid(st_makepoint(v_address.longitude,v_address.latitude),4326)::geography
        ),
        sa.radius_km*1000
      )
  ) then
    raise exception 'This service is not available at the selected booking location';
  end if;

  select coalesce(
    nullif(trim(value->>'value'),''),
    'Asia/Kolkata'
  )
  into v_timezone
  from public.platform_settings
  where key='operations.timezone'
    and is_active=true
  order by updated_at desc
  limit 1;

  v_timezone:=coalesce(v_timezone,'Asia/Kolkata');

  select
    (now() at time zone v_timezone)::date,
    (now() at time zone v_timezone)::date+1
  into v_today,v_tomorrow;

  if v_start is null or v_end is null or v_end<=v_start then
    raise exception 'A valid start and end time are required';
  end if;

  v_hours:=round(
    extract(epoch from(v_end-v_start))/3600.0,
    2
  );

  if v_hours<1 then
    raise exception 'Booking duration must be at least 1 hour';
  end if;

  v_local_start:=v_start at time zone v_timezone;
  v_local_end:=v_end at time zone v_timezone;

  if not public.is_booking_within_operating_hours(v_start,v_end) then
    raise exception 'Booking time is outside configured operating hours';
  end if;

  if p_booking_type='instant'::public.booking_fulfillment_type then
    if v_local_start::date is distinct from v_today
       or v_start < now() + interval '15 minutes' then
      raise exception 'Instant booking must start at least 15 minutes from now and be for today';
    end if;

    select count(*)
    into v_nearby_worker_count
    from public.worker_profiles wp
    join public.worker_services ws
      on ws.worker_id=wp.id
     and ws.service_id=v_variant.service_id
    join public.worker_presence pr
      on pr.worker_id=wp.id
     and pr.is_available=true
     and pr.expires_at>now()
    join lateral (
      select wl.location
      from public.worker_locations wl
      where wl.worker_id=wp.id
        and wl.location is not null
        and wl.recorded_at>=now()-interval '10 minutes'
      order by wl.recorded_at desc
      limit 1
    ) wl on true
    where wp.is_verified=true
      and wp.worker_status='available'::public.worker_status
      and wp.service_radius_km>0
      and st_dwithin(
        wl.location,
        coalesce(
          v_address.location,
          st_setsrid(st_makepoint(v_address.longitude,v_address.latitude),4326)::geography
        ),
        least(wp.service_radius_km,10)*1000
      )
      and st_dwithin(
        wl.location,
        coalesce(
          v_address.location,
          st_setsrid(st_makepoint(v_address.longitude,v_address.latitude),4326)::geography
        ),
        10000
      );

    v_instant_workers:=v_nearby_worker_count;

    select count(*)
    into v_requested_worker_count
    from public.worker_profiles wp
    join public.worker_services ws
      on ws.worker_id=wp.id
     and ws.service_id=v_variant.service_id
    join public.worker_presence pr
      on pr.worker_id=wp.id
     and pr.is_available=true
     and pr.expires_at>now()
    join lateral (
      select wl.location
      from public.worker_locations wl
      where wl.worker_id=wp.id
        and wl.location is not null
        and wl.recorded_at>=now()-interval '10 minutes'
      order by wl.recorded_at desc
      limit 1
    ) wl on true
    where wp.is_verified=true
      and wp.worker_status='available'::public.worker_status
      and wp.service_radius_km>0
      and st_dwithin(
        wl.location,
        coalesce(
          v_address.location,
          st_setsrid(
            st_makepoint(
              v_address.longitude,
              v_address.latitude
            ),
            4326
          )::geography
        ),
        least(wp.service_radius_km,10)*1000
      )
      and st_dwithin(
        wl.location,
        coalesce(
          v_address.location,
          st_setsrid(
            st_makepoint(
              v_address.longitude,
              v_address.latitude
            ),
            4326
          )::geography
        ),
        10000
      )
      and not exists (
        select 1
        from public.bookings b
        where b.worker_id=wp.id
          and b.status in (
            'assigned'::public.booking_status,
            'on_the_way'::public.booking_status,
            'arrived'::public.booking_status,
            'in_progress'::public.booking_status
          )
          and b.scheduled_start < v_end
          and b.scheduled_end > v_start
      );

    if v_requested_worker_count=0 then
      raise exception 'No live worker is available for the selected instant slot';
    end if;

    if v_nearby_worker_count=0 then
      return jsonb_build_object(
        'success',false,
        'instant_available',false,
        'fallback_to_scheduled',true,
        'reason','No nearby worker is currently available',
        'area_available',true,
        'nearby_worker_count',0
      );
    end if;
  else
    if v_start<=now() then
      raise exception 'Scheduled booking must be in the future';
    end if;

    if v_local_start::date < v_tomorrow then
      raise exception 'Scheduled booking must start tomorrow or later';
    end if;
  end if;


  select count(*)
  into v_schedule_workers
  from public.worker_profiles wp
  join public.worker_services ws
    on ws.worker_id=wp.id
   and ws.service_id=v_variant.service_id
  join public.worker_presence pr
    on pr.worker_id=wp.id
   and pr.is_available=true
   and pr.expires_at>now()
  join lateral (
    select wl.location
    from public.worker_locations wl
    where wl.worker_id=wp.id
      and wl.location is not null
      and wl.recorded_at>=now()-interval '10 minutes'
    order by wl.recorded_at desc
    limit 1
  ) wl on true
  where p_booking_type='instant'::public.booking_fulfillment_type
    and wp.is_verified=true
    and wp.worker_status='available'::public.worker_status
    and wp.service_radius_km>0
    and public.st_dwithin(
      wl.location,
      coalesce(
        v_address.location,
        public.st_setsrid(
          public.st_makepoint(
            v_address.longitude,
            v_address.latitude
          ),
          4326
        )::public.geography
      ),
      least(wp.service_radius_km,10)*1000
    )
    and public.st_dwithin(
      wl.location,
      coalesce(
        v_address.location,
        public.st_setsrid(
          public.st_makepoint(
            v_address.longitude,
            v_address.latitude
          ),
          4326
        )::public.geography
      ),
      10000
    )
    and public.worker_covers_booking_interval(
      v_variant.service_id,
      wp.id,
      v_start,
      v_end
    );

  if p_booking_type='instant'
     and v_schedule_workers=0 then
    raise exception 'No eligible worker schedule is available for the selected instant slot';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'customer-booking:' || v_customer_id::text,
      0
    )
  );

  if public.customer_has_active_booking_overlap(

    v_customer_id,
    v_start,
    v_end,
    null
  ) then
    raise exception 'This time overlaps another active customer booking';
  end if;

  v_price:=public.calculate_service_booking_price(
    v_variant.id,
    v_hours
  );

  insert into public.bookings(
    customer_id,worker_id,service_id,service_variant_id,address_id,status,
    duration_value,duration_unit,scheduled_start,scheduled_end,
    base_amount,platform_fee,tax_amount,total_amount,notes,fulfillment_type,
    pricing_snapshot,total_working_hours
  )
  values(
    v_customer_id,null,v_variant.service_id,v_variant.id,p_address_id,
    'pending_payment',ceil(v_hours)::integer,'hour',v_start,v_end,
    round(greatest(
      (v_price->>'final_amount')::numeric
      -coalesce((v_price->>'platform_fee')::numeric,0)
      -coalesce((v_price->>'tax_amount')::numeric,0),
      0
    ),2),
    round(coalesce((v_price->>'platform_fee')::numeric,0),2),
    round(coalesce((v_price->>'tax_amount')::numeric,0),2),
    round((v_price->>'final_amount')::numeric,2),
    nullif(trim(p_notes),''),
    p_booking_type,v_price,v_hours
  )
  returning * into v_booking;

  insert into public.booking_status_history(
    booking_id,old_status,new_status,changed_by,created_at
  )
  values(
    v_booking.id,null,'pending_payment'::public.booking_status,
    v_customer_id,now()
  );

  return jsonb_build_object(
    'success',true,
    'booking_id',v_booking.id,
    'booking_type',p_booking_type,
    'scheduled_start',v_start,
    'scheduled_end',v_end,
    'duration_hours',v_hours,
    'occurrence_count',1,
    'total_working_hours',v_hours,
    'gross_amount',coalesce((v_price->>'gross_amount')::numeric,0),
    'discount_amount',coalesce((v_price->>'discount_amount')::numeric,0),
    'platform_fee',coalesce((v_price->>'platform_fee')::numeric,0),
    'tax_amount',coalesce((v_price->>'tax_amount')::numeric,0),
    'final_amount',coalesce((v_price->>'final_amount')::numeric,0),
    'currency',coalesce(v_price->>'currency','INR'),
    'area_available',true,
    'instant_available',v_instant_workers>0,
    'instant_workers',v_instant_workers,
    'assigned_worker_id',null,
    'assigned_worker_distance_km',null,
    'scheduled_workers',v_schedule_workers,
    'pricing',v_price
  );
end;
$$;


ALTER FUNCTION "public"."create_customer_hourly_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_booking_type" "public"."booking_fulfillment_type", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_multi_occurrence_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[] DEFAULT '{}'::"date"[], "p_notes" "text" DEFAULT NULL::"text", "p_booking_type" "public"."booking_fulfillment_type" DEFAULT 'scheduled'::"public"."booking_fulfillment_type") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := auth.uid();
  v_service_id uuid;
  v_booking_id uuid;
  v_timezone text;
  v_tomorrow date;
  v_current_date date;
  v_occurrence_index integer := 0;
  v_daily_hours numeric(12,2);
  v_total_hours numeric(12,2) := 0;
  v_start timestamptz;
  v_end timestamptz;
  v_occurrence_price jsonb;
  v_gross numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_service_discount numeric(12,2) := 0;
  v_promotion_discount numeric(12,2) := 0;
  v_recurring_commitment_discount numeric(12,2) := 0;
  v_promotion_id uuid;
  v_promotion_title text;
  v_promotion_discount_type text;
  v_promotion_discount_value numeric(12,2) := 0;
  v_promotion_stackable boolean := false;
  v_platform_fee numeric(12,2) := 0;
  v_tax numeric(12,2) := 0;
  v_final numeric(12,2) := 0;
  v_currency text := 'INR';
  v_prices jsonb := '[]'::jsonb;
  v_lat double precision;
  v_lon double precision;
  v_weekday smallint;
  v_off boolean;
  v_base numeric(12,2);
  v_commit_days numeric(12,2);
begin
  if v_customer_id is null then
    raise exception 'Authentication required';
  end if;

  if p_booking_type not in (
    'scheduled'::public.booking_fulfillment_type,
    'recurring'::public.booking_fulfillment_type
  ) then
    raise exception 'Only scheduled or recurring bookings are supported';
  end if;

  if p_service_variant_id is null or p_address_id is null then
    raise exception 'Service and booking address are required';
  end if;

  if p_schedule_start_date is null
     or p_schedule_end_date is null
     or p_schedule_end_date < p_schedule_start_date then
    raise exception 'Invalid booking date range';
  end if;

  if p_daily_start_time is null
     or p_daily_end_time is null
     or p_daily_end_time <= p_daily_start_time then
    raise exception 'Invalid daily working hours';
  end if;

  if p_selected_weekdays is null
     or cardinality(p_selected_weekdays) = 0
     or cardinality(p_selected_weekdays) > 7 then
    raise exception 'At least one weekday is required';
  end if;

  if exists (
    select 1 from unnest(p_selected_weekdays) d
    where d < 0 or d > 6
  ) then
    raise exception 'Invalid weekday selection';
  end if;

  p_off_dates := coalesce(p_off_dates, '{}'::date[]);

  if exists (
    select 1 from unnest(p_off_dates) d
    where d < p_schedule_start_date
       or d > p_schedule_end_date
  ) then
    raise exception 'Off dates must be inside the selected date range';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_customer_id
      and p.role = 'customer'
      and p.is_active = true
  ) then
    raise exception 'Active customer account required';
  end if;

  select coalesce(nullif(trim(value->>'value'), ''), 'Asia/Kolkata')
  into v_timezone
  from public.platform_settings
  where key = 'operations.timezone'
    and is_active = true
  order by updated_at desc
  limit 1;

  v_timezone := coalesce(v_timezone, 'Asia/Kolkata');

  v_tomorrow := (now() at time zone v_timezone)::date + 1;

  if p_schedule_start_date < v_tomorrow then
    raise exception 'Scheduled and recurring bookings must start tomorrow or later';
  end if;

  select sv.service_id
  into v_service_id
  from public.service_variants sv
  join public.services s on s.id = sv.service_id
  where sv.id = p_service_variant_id
    and sv.is_active = true
    and lower(sv.billing_type) = 'hourly'
    and s.is_active = true;

  if v_service_id is null then
    raise exception 'An active hourly service variant is required';
  end if;

  select a.latitude, a.longitude
  into v_lat, v_lon
  from public.addresses a
  where a.id = p_address_id
    and a.user_id = v_customer_id
    and a.latitude is not null
    and a.longitude is not null;

  if v_lat is null or v_lon is null then
    raise exception 'Booking address coordinates are required';
  end if;

  if not exists (
    select 1
    from public.service_areas sa
    where sa.is_active = true
      and (sa.service_id = v_service_id or sa.service_id is null)
      and st_dwithin(
        st_setsrid(st_makepoint(sa.center_longitude, sa.center_latitude),4326)::geography,
        st_setsrid(st_makepoint(v_lon,v_lat),4326)::geography,
        sa.radius_km * 1000
      )
  ) then
    raise exception 'This service is not available at the selected location';
  end if;

  v_daily_hours := round(
    extract(epoch from (p_daily_end_time-p_daily_start_time))/3600.0,
    2
  );

  if v_daily_hours < 1 then
    raise exception 'Each booking occurrence must be at least 1 hour';
  end if;

  if p_daily_start_time <
     coalesce((
       select (value->>'value')::time
       from public.platform_settings
       where key='operations.default_start_time'
         and is_active=true
       order by updated_at desc
       limit 1
     ), '08:00:00'::time)
     or p_daily_end_time >
     coalesce((
       select (value->>'value')::time
       from public.platform_settings
       where key='operations.default_end_time'
         and is_active=true
       order by updated_at desc
       limit 1
     ), '22:00:00'::time) then
    raise exception 'Requested working hours are outside configured operating hours';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'customer-booking:' || v_customer_id::text,
      0
    )
  );

  v_commit_days := (p_schedule_end_date-p_schedule_start_date)+1;
  v_current_date := p_schedule_start_date;

  while v_current_date <= p_schedule_end_date loop
    v_weekday := extract(dow from v_current_date)::smallint;
    v_off := v_current_date = any(p_off_dates);

    if v_weekday = any(p_selected_weekdays) and not v_off then
      v_start := (
        v_current_date::text || ' ' ||
        p_daily_start_time::text || ' ' ||
        v_timezone
      )::timestamptz;

      v_end := (
        v_current_date::text || ' ' ||
        p_daily_end_time::text || ' ' ||
        v_timezone
      )::timestamptz;

      /*
       * Scheduled bookings retain the strict existing rule:
       * a selected occurrence must be in the future.
       *
       * Recurring bookings may start today. If today's selected
       * occurrence has already started, skip only that occurrence
       * and continue with the remaining future occurrences.
       */
      if v_start <= now() and p_booking_type = 'scheduled'::public.booking_fulfillment_type then
        raise exception 'All selected booking occurrences must be in the future';
      end if;

      if v_start > now() then
        if public.customer_has_active_booking_overlap(
          v_customer_id,
          v_start,
          v_end,
          null
        ) then
          raise exception 'One or more selected times overlap an existing active booking';
        end if;

        if p_booking_type = 'recurring'::public.booking_fulfillment_type then
          v_occurrence_price := public.calculate_recurring_occurrence_price(
            p_service_variant_id,
            v_daily_hours,
            v_commit_days
          );
        else
          v_occurrence_price := public.calculate_service_booking_price(
            p_service_variant_id,
            v_daily_hours
          );
        end if;

        v_occurrence_index := v_occurrence_index + 1;
        v_gross := v_gross + coalesce((v_occurrence_price->>'gross_amount')::numeric,0);
        v_discount := v_discount + coalesce((v_occurrence_price->>'discount_amount')::numeric,0);
        v_service_discount := v_service_discount + coalesce((v_occurrence_price->>'service_discount_amount')::numeric,0);
        v_promotion_discount := v_promotion_discount + coalesce((v_occurrence_price->>'promotion_discount_amount')::numeric,0);
        v_recurring_commitment_discount := v_recurring_commitment_discount + coalesce((v_occurrence_price->>'recurring_discount_amount')::numeric,0);

        if v_promotion_id is null
           and nullif(v_occurrence_price->>'promotion_id','') is not null then
          v_promotion_id := (v_occurrence_price->>'promotion_id')::uuid;
          v_promotion_title := v_occurrence_price->>'promotion_title';
          v_promotion_discount_type := v_occurrence_price->>'promotion_discount_type';
          v_promotion_discount_value := coalesce((v_occurrence_price->>'promotion_discount_value')::numeric,0);
          v_promotion_stackable := coalesce((v_occurrence_price->>'promotion_stackable_with_duration_discount')::boolean,false);
        end if;

        v_platform_fee := v_platform_fee + coalesce((v_occurrence_price->>'platform_fee')::numeric,0);
        v_tax := v_tax + coalesce((v_occurrence_price->>'tax_amount')::numeric,0);
        v_final := v_final + coalesce((v_occurrence_price->>'final_amount')::numeric,0);
        v_currency := coalesce(v_occurrence_price->>'currency',v_currency);
        v_total_hours := v_total_hours + v_daily_hours;

        v_base := round(
          coalesce((v_occurrence_price->>'subtotal_after_discount')::numeric,0),
          2
        );

        v_prices := v_prices || jsonb_build_array(
          jsonb_build_object(
            'occurrence_index',v_occurrence_index,
            'occurrence_date',v_current_date,
            'hours',v_daily_hours,
            'gross_amount',round(coalesce((v_occurrence_price->>'gross_amount')::numeric,0),2),
            'discount_tier_id',v_occurrence_price->'discount_tier_id',
            'discount_tier_name',v_occurrence_price->>'discount_tier_name',
            'discount_percent',coalesce((v_occurrence_price->>'discount_percent')::numeric,0),
            'discount_amount',round(coalesce((v_occurrence_price->>'discount_amount')::numeric,0),2),
            'service_discount_percent',coalesce((v_occurrence_price->>'service_discount_percent')::numeric,0),
            'service_discount_amount',round(coalesce((v_occurrence_price->>'service_discount_amount')::numeric,0),2),
            'promotion_id',v_occurrence_price->'promotion_id',
            'promotion_title',v_occurrence_price->>'promotion_title',
            'promotion_discount_type',v_occurrence_price->>'promotion_discount_type',
            'promotion_discount_value',coalesce((v_occurrence_price->>'promotion_discount_value')::numeric,0),
            'promotion_discount_amount',round(coalesce((v_occurrence_price->>'promotion_discount_amount')::numeric,0),2),
            'promotion_stackable_with_duration_discount',
              coalesce((v_occurrence_price->>'promotion_stackable_with_duration_discount')::boolean,false),
            'recurring_discount_tier_id',v_occurrence_price->'recurring_discount_tier_id',
            'recurring_discount_tier_name',v_occurrence_price->>'recurring_discount_tier_name',
            'recurring_discount_percent',coalesce((v_occurrence_price->>'recurring_discount_percent')::numeric,0),
            'recurring_discount_amount',round(coalesce((v_occurrence_price->>'recurring_discount_amount')::numeric,0),2),
            'base_amount',v_base,
            'subtotal_after_discount',v_base,
            'platform_fee',round(coalesce((v_occurrence_price->>'platform_fee')::numeric,0),2),
            'tax_amount',round(coalesce((v_occurrence_price->>'tax_amount')::numeric,0),2),
            'total_amount',round(coalesce((v_occurrence_price->>'final_amount')::numeric,0),2),
            'currency',v_occurrence_price->>'currency'
          )
        );
      end if;
    end if;

    v_current_date := v_current_date + 1;
  end loop;

  if v_occurrence_index = 0 then
    raise exception 'No future booking occurrences remain after weekday and off-date selection';
  end if;

  if v_final <= 0 then
    raise exception 'Calculated booking amount is invalid';
  end if;

  insert into public.bookings(
    customer_id, worker_id, service_id, service_variant_id, address_id,
    status, duration_value, duration_unit, scheduled_start, scheduled_end,
    base_amount, platform_fee, tax_amount, total_amount, notes,
    fulfillment_type, schedule_start_date, schedule_end_date,
    daily_start_time, daily_end_time, selected_weekdays, off_dates,
    total_working_hours, pricing_snapshot
  )
  values(
    v_customer_id, null, v_service_id, p_service_variant_id, p_address_id,
    'pending_payment', ceil(v_total_hours)::integer, 'hour',
    (
      select min(
        (d::date::text || ' ' || p_daily_start_time::text || ' ' || v_timezone)::timestamptz
      )
      from generate_series(p_schedule_start_date,p_schedule_end_date,interval '1 day') gs(d)
      where extract(dow from d)::smallint=any(p_selected_weekdays)
        and not(d::date=any(p_off_dates))
        and (
          (d::date::text || ' ' || p_daily_start_time::text || ' ' || v_timezone)::timestamptz > now()
          or p_booking_type = 'scheduled'::public.booking_fulfillment_type
        )
    ),
    (
      select max(
        (d::date::text || ' ' || p_daily_end_time::text || ' ' || v_timezone)::timestamptz
      )
      from generate_series(p_schedule_start_date,p_schedule_end_date,interval '1 day') gs(d)
      where extract(dow from d)::smallint=any(p_selected_weekdays)
        and not(d::date=any(p_off_dates))
        and (
          (d::date::text || ' ' || p_daily_start_time::text || ' ' || v_timezone)::timestamptz > now()
          or p_booking_type = 'scheduled'::public.booking_fulfillment_type
        )
    ),
    round(greatest(v_final-v_platform_fee-v_tax,0),2),
    round(v_platform_fee,2),
    round(v_tax,2),
    round(v_final,2),
    nullif(trim(p_notes),''),
    p_booking_type,
    p_schedule_start_date,
    p_schedule_end_date,
    p_daily_start_time,
    p_daily_end_time,
    p_selected_weekdays,
    p_off_dates,
    v_total_hours,
    jsonb_build_object(
      'pricing_engine',
        case when p_booking_type='recurring'
          then 'service_hourly_recurring'
          else 'service_hourly_scheduled'
        end,
      'pricing_version',8,
      'service_id',v_service_id,
      'service_variant_id',p_service_variant_id,
      'currency',v_currency,
      'occurrence_count',v_occurrence_index,
      'hours_per_occurrence',v_daily_hours,
      'total_working_hours',v_total_hours,
      'gross_amount',v_gross,
      'discount_amount',v_discount,
      'service_discount_amount',v_service_discount,
      'service_discount_percent',
        case
          when v_gross > 0
            then round(v_service_discount / v_gross * 100, 2)
          else 0
        end,
      'promotion_id',v_promotion_id,
      'promotion_title',v_promotion_title,
      'promotion_discount_type',v_promotion_discount_type,
      'promotion_discount_value',v_promotion_discount_value,
      'promotion_discount_amount',v_promotion_discount,
      'promotion_stackable_with_duration_discount',v_promotion_stackable,
      'recurring_commitment_discount_amount',v_recurring_commitment_discount,
      'recurring_discount_percent',
        case
          when (v_gross - v_service_discount - v_promotion_discount) > 0
            then round(
              v_recurring_commitment_discount /
              (v_gross - v_service_discount - v_promotion_discount) * 100,
              2
            )
          else 0
        end,
      'platform_fee',v_platform_fee,
      'tax_amount',v_tax,
      'final_amount',v_final,
      'commitment_days',
        case when p_booking_type='recurring' then v_commit_days else null end,
      'timezone',v_timezone,
      'occurrences',v_prices
    )
  )
  returning id into v_booking_id;

  v_current_date := p_schedule_start_date;
  v_occurrence_index := 0;

  while v_current_date <= p_schedule_end_date loop
    v_weekday := extract(dow from v_current_date)::smallint;
    v_off := v_current_date = any(p_off_dates);

    if v_weekday = any(p_selected_weekdays) and not v_off then
      v_start := (
        v_current_date::text || ' ' ||
        p_daily_start_time::text || ' ' ||
        v_timezone
      )::timestamptz;

      v_end := (
        v_current_date::text || ' ' ||
        p_daily_end_time::text || ' ' ||
        v_timezone
      )::timestamptz;

      if v_start > now() then
        v_occurrence_index := v_occurrence_index + 1;
        v_occurrence_price := v_prices->(v_occurrence_index-1);

        insert into public.booking_schedule_occurrences(
          booking_id, worker_id, occurrence_index, occurrence_date,
          scheduled_start, scheduled_end, status,
          base_amount, discount_amount, platform_fee, tax_amount,
          total_amount, pricing_snapshot
        )
        values(
          v_booking_id, null, v_occurrence_index, v_current_date,
          v_start, v_end, 'scheduled',
          round(coalesce((v_occurrence_price->>'base_amount')::numeric,0),2),
          round(coalesce((v_occurrence_price->>'discount_amount')::numeric,0),2),
          round(coalesce((v_occurrence_price->>'platform_fee')::numeric,0),2),
          round(coalesce((v_occurrence_price->>'tax_amount')::numeric,0),2),
          round(coalesce((v_occurrence_price->>'total_amount')::numeric,0),2),
          v_occurrence_price
        );
      end if;
    end if;

    v_current_date := v_current_date + 1;
  end loop;

  insert into public.booking_status_history(
    booking_id, old_status, new_status, changed_by, created_at
  )
  values(v_booking_id, null, 'pending_payment', v_customer_id, now());

  return jsonb_build_object(
    'success',true,
    'booking_id',v_booking_id,
    'booking_type',p_booking_type,
    'schedule_start_date',p_schedule_start_date,
    'schedule_end_date',p_schedule_end_date,
    'daily_start_time',p_daily_start_time,
    'daily_end_time',p_daily_end_time,
    'selected_weekdays',p_selected_weekdays,
    'off_dates',p_off_dates,
    'occurrence_count',v_occurrence_index,
    'total_working_hours',v_total_hours,
    'gross_amount',v_gross,
    'discount_amount',v_discount,
    'platform_fee',v_platform_fee,
    'tax_amount',v_tax,
    'final_amount',v_final,
    'currency',v_currency,
    'timezone',v_timezone
  );
end;
$$;


ALTER FUNCTION "public"."create_customer_multi_occurrence_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text", "p_booking_type" "public"."booking_fulfillment_type") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_recurring_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[] DEFAULT '{}'::"date"[], "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'customer'::public.user_role
      and is_active = true
  ) then
    raise exception 'Customer account is inactive';
  end if;

  return public.create_customer_multi_occurrence_booking(
    p_service_variant_id,
    p_address_id,
    p_schedule_start_date,
    p_schedule_end_date,
    p_daily_start_time,
    p_daily_end_time,
    p_selected_weekdays,
    p_off_dates,
    p_notes,
    'recurring'::public.booking_fulfillment_type
  );
end;
$$;


ALTER FUNCTION "public"."create_customer_recurring_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_review"("p_booking_id" "uuid", "p_worker_id" "uuid", "p_rating" integer, "p_comment" "text" DEFAULT NULL::"text", "p_occurrence_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_occurrence public.booking_schedule_occurrences%rowtype;
  v_comment text := nullif(trim(coalesce(p_comment, '')), '');
  v_review_id uuid;
begin
  if v_customer_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_customer_id
      and p.role = 'customer'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Customer account is inactive';
  end if;

  if p_booking_id is null or p_worker_id is null then
    raise exception 'Booking and worker are required';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  if v_comment is not null and char_length(v_comment) > 1000 then
    raise exception 'Review comment must be 1000 characters or fewer';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
    and customer_id = v_customer_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.fulfillment_type =
     'recurring'::public.booking_fulfillment_type then

    if p_occurrence_id is null then
      raise exception 'A completed occurrence is required for a recurring review';
    end if;

    select *
    into v_occurrence
    from public.booking_schedule_occurrences
    where id = p_occurrence_id
      and booking_id = v_booking.id
    for update;

    if not found then
      raise exception 'Booking occurrence not found';
    end if;

    if v_occurrence.status <> 'completed' then
      raise exception 'Only completed occurrences can be reviewed';
    end if;

    if v_occurrence.worker_id is null then
      raise exception 'A completed worker occurrence is required';
    end if;

    if v_occurrence.worker_id <> p_worker_id then
      raise exception 'Worker does not match the completed occurrence';
    end if;

    if exists (
      select 1
      from public.reviews r
      where r.occurrence_id = p_occurrence_id
    ) then
      raise exception 'This occurrence has already been reviewed';
    end if;

  else

    if p_occurrence_id is not null then
      raise exception 'Occurrence is not valid for this booking';
    end if;

    if v_booking.status <> 'completed'::public.booking_status then
      raise exception 'Only completed bookings can be reviewed';
    end if;

    if v_booking.worker_id is null then
      raise exception 'A completed worker assignment is required';
    end if;

    if v_booking.worker_id <> p_worker_id then
      raise exception 'Worker does not match the completed booking';
    end if;

    if exists (
      select 1
      from public.reviews r
      where r.booking_id = v_booking.id
    ) then
      raise exception 'This booking has already been reviewed';
    end if;
  end if;

  insert into public.reviews (
    booking_id,
    customer_id,
    worker_id,
    occurrence_id,
    rating,
    comment,
    moderation_status
  )
  values (
    v_booking.id,
    v_customer_id,
    p_worker_id,
    p_occurrence_id,
    p_rating,
    v_comment,
    'published'
  )
  returning id into v_review_id;

  return jsonb_build_object(
    'success', true,
    'review_id', v_review_id,
    'booking_id', v_booking.id,
    'worker_id', p_worker_id,
    'occurrence_id', p_occurrence_id,
    'rating', p_rating,
    'comment', v_comment
  );
end;
$$;


ALTER FUNCTION "public"."create_customer_review"("p_booking_id" "uuid", "p_worker_id" "uuid", "p_rating" integer, "p_comment" "text", "p_occurrence_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_scheduled_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[] DEFAULT '{}'::"date"[], "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_timezone text;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'customer'::public.user_role
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Customer account is inactive';
  END IF;

  IF p_schedule_start_date IS NULL
     OR p_schedule_end_date IS NULL THEN
    RAISE EXCEPTION 'Scheduled booking date is required';
  END IF;

  IF p_schedule_start_date <> p_schedule_end_date THEN
    RAISE EXCEPTION 'Scheduled booking must use a single date';
  END IF;

  IF p_daily_start_time IS NULL
     OR p_daily_end_time IS NULL
     OR p_daily_end_time <= p_daily_start_time THEN
    RAISE EXCEPTION 'Valid scheduled booking hours are required';
  END IF;

  IF p_off_dates IS NOT NULL
     AND p_schedule_start_date = ANY(p_off_dates) THEN
    RAISE EXCEPTION 'The selected scheduled date is excluded';
  END IF;

  SELECT coalesce(
    nullif(trim(value->>'value'), ''),
    'Asia/Kolkata'
  )
  INTO v_timezone
  FROM public.platform_settings
  WHERE key = 'operations.timezone'
    AND is_active = true
  ORDER BY updated_at DESC
  LIMIT 1;

  v_timezone := coalesce(v_timezone, 'Asia/Kolkata');

  v_start := (
    p_schedule_start_date::text
    || ' '
    || p_daily_start_time::text
    || ' '
    || v_timezone
  )::timestamptz;

  v_end := (
    p_schedule_end_date::text
    || ' '
    || p_daily_end_time::text
    || ' '
    || v_timezone
  )::timestamptz;

  RETURN public.create_customer_hourly_booking(
    p_service_variant_id,
    p_address_id,
    'scheduled'::public.booking_fulfillment_type,
    v_start,
    v_end,
    p_notes
  );
END;
$$;


ALTER FUNCTION "public"."create_customer_scheduled_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_scheduled_range_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_off_dates" "date"[] DEFAULT '{}'::"date"[], "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'customer'::public.user_role
      and is_active = true
  ) then
    raise exception 'Customer account is inactive';
  end if;

  return public.create_customer_multi_occurrence_booking(
    p_service_variant_id,
    p_address_id,
    p_start_date,
    p_end_date,
    p_daily_start_time,
    p_daily_end_time,
    array[0,1,2,3,4,5,6]::smallint[],
    coalesce(p_off_dates, '{}'::date[]),
    p_notes,
    'scheduled'::public.booking_fulfillment_type
  );
end;
$$;


ALTER FUNCTION "public"."create_customer_scheduled_range_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_off_dates" "date"[], "p_notes" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_customer_scheduled_range_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_off_dates" "date"[], "p_notes" "text") IS 'Legacy compatibility wrapper. Delegates scheduled-range creation to create_customer_multi_occurrence_booking.';



CREATE OR REPLACE FUNCTION "public"."create_support_ticket"("p_category" "text", "p_subject" "text", "p_description" "text", "p_booking_id" "uuid" DEFAULT NULL::"uuid", "p_payment_id" "uuid" DEFAULT NULL::"uuid", "p_worker_id" "uuid" DEFAULT NULL::"uuid", "p_refund_request_id" "uuid" DEFAULT NULL::"uuid", "p_payment_refund_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."support_tickets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_result public.support_tickets;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id=v_user_id and p.is_active=true) then
    raise exception 'Active account required';
  end if;
  if p_category not in ('booking','payment','worker','refund','technical') then raise exception 'Invalid ticket category'; end if;
  if btrim(coalesce(p_subject,'')) = '' or btrim(coalesce(p_description,'')) = '' then
    raise exception 'Ticket subject and description are required';
  end if;

  if p_booking_id is not null and not exists (
    select 1 from public.bookings b where b.id=p_booking_id and b.customer_id=v_user_id
  ) then raise exception 'Booking reference is not accessible'; end if;

  if p_payment_id is not null and not exists (
    select 1 from public.payments py join public.bookings b on b.id=py.booking_id
    where py.id=p_payment_id and b.customer_id=v_user_id
  ) then raise exception 'Payment reference is not accessible'; end if;

  if p_worker_id is not null and not exists (
    select 1 from public.bookings b
    where b.customer_id=v_user_id and b.worker_id=p_worker_id
  ) then raise exception 'Worker reference is not associated with your bookings'; end if;

  if p_refund_request_id is not null and not exists (
    select 1 from public.refund_requests rr
    join public.bookings b on b.id=rr.booking_id
    where rr.id=p_refund_request_id and b.customer_id=v_user_id
  ) then raise exception 'Refund reference is not accessible'; end if;

  if p_payment_refund_id is not null and not exists (
    select 1 from public.payment_refunds pr
    join public.bookings b on b.id=pr.booking_id
    where pr.id=p_payment_refund_id and b.customer_id=v_user_id
  ) then raise exception 'Refund reference is not accessible'; end if;

  if p_category='booking' and p_booking_id is null then raise exception 'Booking reference is required for a booking ticket'; end if;
  if p_category='payment' and p_payment_id is null then raise exception 'Payment reference is required for a payment ticket'; end if;
  if p_category='worker' and p_worker_id is null then raise exception 'Worker reference is required for a worker ticket'; end if;
  if p_category='refund' and p_refund_request_id is null and p_payment_refund_id is null then
    raise exception 'Refund reference is required for a refund ticket';
  end if;

  insert into public.support_tickets (
    user_id, category, subject, description,
    booking_id, payment_id, worker_id, refund_request_id, payment_refund_id
  ) values (
    v_user_id, p_category, btrim(p_subject), btrim(p_description),
    p_booking_id, p_payment_id, p_worker_id, p_refund_request_id, p_payment_refund_id
  ) returning * into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."create_support_ticket"("p_category" "text", "p_subject" "text", "p_description" "text", "p_booking_id" "uuid", "p_payment_id" "uuid", "p_worker_id" "uuid", "p_refund_request_id" "uuid", "p_payment_refund_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_worker_payout_internal"("p_worker_id" "uuid", "p_payout_account_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_mode" "text" DEFAULT NULL::"text") RETURNS "public"."worker_payouts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_payout public.worker_payouts%rowtype;
  v_profile public.worker_profiles%rowtype;
  v_account public.worker_payout_accounts%rowtype;
  v_remaining numeric := round(coalesce(p_amount, 0), 2);
  v_requested numeric := round(coalesce(p_amount, 0), 2);
  v_allocated numeric;
  v_available numeric;
  v_take numeric;
  v_earning record;
begin
  if p_worker_id is null then
    raise exception 'Worker ID is required';
  end if;

  if v_requested <= 0 then
    raise exception 'Payout amount must be greater than zero';
  end if;

  if btrim(coalesce(p_idempotency_key, '')) = '' then
    raise exception 'Payout idempotency key is required';
  end if;

  select *
  into v_profile
  from public.worker_profiles
  where id = p_worker_id
  for update;

  if not found then
    raise exception 'Worker profile not found';
  end if;

  if not coalesce(v_profile.is_verified, false) then
    raise exception 'Worker account must be verified before payouts can be requested';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id
    and worker_id = p_worker_id
    and status = 'verified'
  for update;

  if not found then
    raise exception 'Verified worker payout account not found';
  end if;

  if exists (
    select 1
    from public.worker_payouts
    where idempotency_key = btrim(p_idempotency_key)
  ) then
    select *
    into v_payout
    from public.worker_payouts
    where idempotency_key = btrim(p_idempotency_key)
    limit 1;

    if v_payout.worker_id <> p_worker_id then
      raise exception 'Payout idempotency key belongs to a different worker';
    end if;

    return v_payout;
  end if;

  insert into public.worker_payouts(
    worker_id,
    payout_account_id,
    provider,
    idempotency_key,
    amount,
    currency,
    status,
    mode,
    purpose
  )
  values(
    p_worker_id,
    v_account.id,
    'razorpayx',
    btrim(p_idempotency_key),
    v_requested,
    'INR',
    'queued',
    nullif(upper(btrim(coalesce(p_mode, ''))), ''),
    'payout'
  )
  returning * into v_payout;

  for v_earning in
    select e.id, e.net_amount
    from public.worker_earnings e
    where e.worker_id = p_worker_id
      and e.net_amount > 0
    order by e.created_at, e.id
    for update
  loop
    exit when v_remaining <= 0;

    select coalesce(sum(i.amount), 0)
    into v_allocated
    from public.worker_payout_items i
    join public.worker_payouts p
      on p.id = i.payout_id
    where i.earning_id = v_earning.id
      and p.worker_id = p_worker_id
      and p.status in (
        'queued',
        'pending',
        'processing',
        'processed'
      );

    v_available :=
      greatest(
        0,
        round(
          v_earning.net_amount - v_allocated,
          2
        )
      );

    v_take :=
      least(
        v_remaining,
        v_available
      );

    if v_take > 0 then
      insert into public.worker_payout_items(
        payout_id,
        earning_id,
        amount
      )
      values(
        v_payout.id,
        v_earning.id,
        v_take
      );

      v_remaining :=
        round(
          v_remaining - v_take,
          2
        );
    end if;
  end loop;

  if v_remaining > 0 then
    raise exception 'Requested payout exceeds the worker available balance';
  end if;

  return v_payout;
end;
$$;


ALTER FUNCTION "public"."create_worker_payout_internal"("p_worker_id" "uuid", "p_payout_account_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_worker_support_ticket"("p_category" "text", "p_subject" "text", "p_description" "text", "p_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."support_tickets"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_result public.support_tickets;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_user_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Active worker account required';
  end if;

  if p_category not in ('booking','payment','worker','refund','technical') then
    raise exception 'Invalid ticket category';
  end if;

  if btrim(coalesce(p_subject,'')) = '' or btrim(coalesce(p_description,'')) = '' then
    raise exception 'Ticket subject and description are required';
  end if;

  if p_booking_id is not null and not exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and b.worker_id = v_user_id
  ) then
    raise exception 'Booking reference is not associated with this worker';
  end if;

  if p_category = 'booking' and p_booking_id is null then
    raise exception 'Booking reference is required for a booking ticket';
  end if;

  insert into public.support_tickets (
    user_id,
    category,
    subject,
    description,
    booking_id,
    worker_id
  )
  values (
    v_user_id,
    btrim(p_category),
    btrim(p_subject),
    btrim(p_description),
    p_booking_id,
    v_user_id
  )
  returning * into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."create_worker_support_ticket"("p_category" "text", "p_subject" "text", "p_description" "text", "p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_booking_action"("p_booking_id" "uuid", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_old_status public.booking_status;
  v_result jsonb;
  v_action text := lower(trim(p_action));
  v_is_admin boolean := public.is_admin();
begin
  if auth.uid() is null then
    return jsonb_build_object('success',false,'error','Authentication required');
  end if;

  select *
  into v_booking
  from public.bookings
  where id=p_booking_id
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','Booking not found');
  end if;

  if v_booking.customer_id=auth.uid() then
    if not exists (
      select 1
      from public.profiles
      where id=auth.uid()
        and role='customer'::public.user_role
        and is_active=true
    ) then
      return jsonb_build_object('success',false,'error','Customer account is inactive');
    end if;
  elsif not v_is_admin then
    return jsonb_build_object('success',false,'error','You are not allowed to manage this booking');
  end if;

  if v_action<>'cancel' then
    return jsonb_build_object('success',false,'error','Invalid booking action');
  end if;

  if not v_is_admin then
    if v_booking.fulfillment_type='recurring'::public.booking_fulfillment_type then
      return jsonb_build_object(
        'success',false,
        'error','Recurring bookings require the series cancellation flow'
      );
    end if;

    if v_booking.worker_id is not null then
      return jsonb_build_object(
        'success',false,
        'error','Customer can cancel only before worker assignment'
      );
    end if;
  end if;

  if v_booking.status not in (
    'pending_payment'::public.booking_status,
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  ) and not v_is_admin then
    return jsonb_build_object(
      'success',false,
      'error','This booking cannot be cancelled from its current state'
    );
  end if;

  v_old_status:=v_booking.status;

  v_result:=public.transition_booking_state(
    v_booking.id,
    'cancelled'::public.booking_status,
    null,
    false,
    true
  );

  return jsonb_build_object(
    'success',true,
    'booking_id',p_booking_id,
    'action',v_action,
    'old_status',v_old_status::text,
    'status',v_result->>'status'
  );
end;
$$;


ALTER FUNCTION "public"."customer_booking_action"("p_booking_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."customer_has_active_booking_overlap"("p_customer_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_exclude_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if p_customer_id is null
     or p_start is null
     or p_end is null
     or p_end <= p_start then
    return false;
  end if;

  /*
   * Only genuinely active/paid booking states can block a new booking.
   * Unpaid, failed, cancelled, and expired bookings are intentionally
   * non-blocking. Using an allowlist also prevents future non-active
   * statuses from accidentally becoming blocking states.
   */
  return exists (
    select 1
    from public.bookings b
    where b.customer_id = p_customer_id
      and (p_exclude_booking_id is null or b.id <> p_exclude_booking_id)
      and b.status in (
        'paid'::public.booking_status,
        'searching_worker'::public.booking_status,
        'assigned'::public.booking_status,
        'on_the_way'::public.booking_status,
        'arrived'::public.booking_status,
        'in_progress'::public.booking_status
      )
      and (
        (
          b.fulfillment_type = 'recurring'::public.booking_fulfillment_type
          and exists (
            select 1
            from public.booking_schedule_occurrences o
            where o.booking_id = b.id
              and o.scheduled_start < p_end
              and o.scheduled_end > p_start
              and coalesce(o.status, 'scheduled') not in (
                'cancelled',
                'completed',
                'expired'
              )
          )
        )
        or (
          b.fulfillment_type <> 'recurring'::public.booking_fulfillment_type
          and b.scheduled_start < p_end
          and b.scheduled_end > p_start
        )
      )
  );
end;
$$;


ALTER FUNCTION "public"."customer_has_active_booking_overlap"("p_customer_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_exclude_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_booking_worker_offers"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin() then
    raise exception 'Admin or service-role access required';
  end if;

  return public.dispatch_booking_worker_offers_internal(
    p_booking_id
  );
end;
$$;


ALTER FUNCTION "public"."dispatch_booking_worker_offers"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_booking_worker_offers_internal"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_address public.geography;
  v_worker record;
  v_created_count integer := 0;
  v_existing_count integer := 0;
  v_worker_limit integer;
  v_offer_minutes integer;
  v_offer_expires_at timestamptz;
  v_result jsonb;
  v_has_closed_unassigned_occurrence boolean := false;
begin
  if p_booking_id is null then
    raise exception 'Booking ID is required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.status not in (
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  ) then
    return jsonb_build_object(
      'success', false,
      'booking_id', v_booking.id,
      'status', v_booking.status::text,
      'error', 'Booking is not awaiting worker assignment'
    );
  end if;

  if v_booking.worker_id is not null then
    return jsonb_build_object(
      'success', true,
      'booking_id', v_booking.id,
      'status', 'assigned',
      'assigned', true,
      'worker_id', v_booking.worker_id,
      'created_offers', 0,
      'pending_offers', 0
    );
  end if;

  if v_booking.fulfillment_type = 'scheduled'::public.booking_fulfillment_type THEN
    IF v_booking.status = 'paid'::public.booking_status THEN
      UPDATE public.bookings
      SET status = 'searching_worker'::public.booking_status, updated_at = now()
      WHERE id = v_booking.id;
      INSERT INTO public.booking_status_history (
        booking_id, old_status, new_status, changed_by, created_at
      ) VALUES (
        v_booking.id, 'paid'::public.booking_status,
        'searching_worker'::public.booking_status, NULL, now()
      );
      v_booking.status := 'searching_worker'::public.booking_status;
    END IF;

    v_result := public.dispatch_scheduled_booking_offer_batch(v_booking.id, NULL);
    RETURN v_result || jsonb_build_object(
      'status', 'searching_worker', 'assigned', false, 'worker_id', NULL,
      'admin_assignment_required',
        coalesce((v_result->>'pending_offers')::integer, 0) = 0
        AND v_result->>'window_state' = 'window_closed'
    );
  ELSIF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type THEN
    IF v_booking.status = 'paid'::public.booking_status THEN
      UPDATE public.bookings
      SET status = 'searching_worker'::public.booking_status, updated_at = now()
      WHERE id = v_booking.id;
      INSERT INTO public.booking_status_history (
        booking_id, old_status, new_status, changed_by, created_at
      ) VALUES (
        v_booking.id, 'paid'::public.booking_status,
        'searching_worker'::public.booking_status, NULL, now()
      );
      v_booking.status := 'searching_worker'::public.booking_status;
    END IF;

    v_created_count := 0;
    v_existing_count := 0;
    FOR v_worker IN
      SELECT o.id AS occurrence_id
      FROM public.booking_schedule_occurrences o
      WHERE o.booking_id = v_booking.id
        AND o.status = 'scheduled'
        AND o.worker_id IS NULL
        AND o.scheduled_start > now() + interval '30 minutes'
        AND o.scheduled_start <= now() + interval '40 minutes'
      ORDER BY o.scheduled_start, o.occurrence_index
    LOOP
      v_result := public.dispatch_scheduled_booking_offer_batch(
        v_booking.id, v_worker.occurrence_id
      );
      v_created_count := v_created_count + coalesce((v_result->>'created_offers')::integer, 0);
      v_existing_count := v_existing_count + coalesce((v_result->>'pending_offers')::integer, 0);
    END LOOP;

    SELECT EXISTS (
      SELECT 1
      FROM public.booking_schedule_occurrences o
      WHERE o.booking_id = v_booking.id
        AND o.status = 'scheduled'
        AND o.worker_id IS NULL
        AND o.scheduled_start > now()
        AND o.scheduled_start <= now() + interval '30 minutes'
        AND NOT EXISTS (
          SELECT 1
          FROM public.booking_worker_offers bwo
          WHERE bwo.booking_id = v_booking.id
            AND bwo.occurrence_id = o.id
            AND bwo.status = 'pending'
            AND bwo.expires_at > now()
        )
    ) INTO v_has_closed_unassigned_occurrence;

    RETURN jsonb_build_object(
      'success', true, 'booking_id', v_booking.id,
      'status', 'searching_worker', 'assigned', false, 'worker_id', NULL,
      'created_offers', v_created_count, 'pending_offers', v_existing_count,
      'admin_assignment_required', v_has_closed_unassigned_occurrence,
      'dispatch_window_minutes', 10
    );
  END IF;


  /*
   * Automatic offers are enabled only for Instant bookings.
   */
  select case
    when jsonb_typeof(ps.value -> 'value') = 'number'
    then (ps.value ->> 'value')::integer
    else null
  end
  into v_worker_limit
  from public.platform_settings ps
  where ps.key = 'dispatch.worker_offer_limit'
    and ps.is_active = true;

  select case
    when jsonb_typeof(ps.value -> 'value') = 'number'
    then (ps.value ->> 'value')::integer
    else null
  end
  into v_offer_minutes
  from public.platform_settings ps
  where ps.key = 'dispatch.worker_offer_duration_minutes'
    and ps.is_active = true;

  if v_worker_limit is null then
    raise exception 'Dispatch setting dispatch.worker_offer_limit is not configured';
  end if;

  if v_offer_minutes is null then
    raise exception 'Dispatch setting dispatch.worker_offer_duration_minutes is not configured';
  end if;

  if v_worker_limit < 1 then
    raise exception 'Dispatch worker offer limit must be at least 1';
  end if;

  if v_offer_minutes < 1 then
    raise exception 'Dispatch worker offer duration must be at least 1 minute';
  end if;

  select coalesce(
    a.location,
    public.st_setsrid(
      public.st_makepoint(a.longitude, a.latitude),
      4326
    )::public.geography
  )
  into v_address
  from public.addresses a
  where a.id = v_booking.address_id;

  if v_address is null then
    raise exception 'Booking location is missing';
  end if;

  v_offer_expires_at :=
    now() + make_interval(mins => v_offer_minutes);

  for v_worker in
    select
      wp.id as worker_id,
      wp.rating,
      wp.total_completed_jobs,
      wp.service_radius_km,
      public.st_distance(
        wl.location,
        v_address
      ) / 1000.0 as distance_km
    from public.worker_services ws
    join public.worker_profiles wp
      on wp.id = ws.worker_id
    join public.worker_presence pr
      on pr.worker_id = wp.id
     and pr.is_available = true
     and pr.expires_at > now()
    join lateral (
      select wl.location
      from public.worker_locations wl
      where wl.worker_id = wp.id
        and wl.location is not null
        and wl.recorded_at >= now() - interval '10 minutes'
      order by wl.recorded_at desc
      limit 1
    ) wl on true
    where ws.service_id = v_booking.service_id
      and wp.is_verified = true
      and wp.worker_status = 'available'::public.worker_status
      and NOT public.worker_has_active_assignment(wp.id)
      and wp.service_radius_km is not null
      and wp.service_radius_km > 0
      and public.st_dwithin(
        wl.location,
        v_address,
        least(wp.service_radius_km, 10) * 1000
      )
      and public.st_dwithin(
        wl.location,
        v_address,
        10000
      )
      and public.worker_covers_booking_interval(
        v_booking.service_id,
        wp.id,
        v_booking.scheduled_start,
        v_booking.scheduled_end
      )
      and not exists (
        select 1
        from public.booking_worker_offers bwo
        where bwo.booking_id = v_booking.id
          and bwo.worker_id = wp.id
          and bwo.status in ('pending', 'declined', 'expired')
      )
      and not exists (
        select 1
        from public.bookings b
        where b.worker_id = wp.id
          and b.id <> v_booking.id
          and b.status in (
            'assigned'::public.booking_status,
            'on_the_way'::public.booking_status,
            'arrived'::public.booking_status,
            'in_progress'::public.booking_status
          )
          and b.scheduled_start < v_booking.scheduled_end
          and b.scheduled_end > v_booking.scheduled_start
      )
    order by
      distance_km asc,
      wp.rating desc nulls last,
      wp.total_completed_jobs desc nulls last,
      wp.id
    limit v_worker_limit
  loop
    insert into public.booking_worker_offers (
      booking_id,
      worker_id,
      status,
      offered_at,
      expires_at,
      responded_at,
      created_at,
      updated_at
    )
    values (
      v_booking.id,
      v_worker.worker_id,
      'pending',
      now(),
      v_offer_expires_at,
      null,
      now(),
      now()
    )
    on conflict do nothing;

    if found then
      v_created_count := v_created_count + 1;
    end if;
  end loop;

  /*
   * Once payment is confirmed and dispatch has been attempted,
   * the booking enters the worker-searching state even when no
   * eligible offer exists yet. Future worker presence/location
   * events can then re-dispatch it.
   */
  if v_booking.status = 'paid'::public.booking_status then
    update public.bookings
    set
      status = 'searching_worker'::public.booking_status,
      updated_at = now()
    where id = v_booking.id;

    insert into public.booking_status_history (
      booking_id,
      old_status,
      new_status,
      changed_by,
      created_at
    )
    values (
      v_booking.id,
      'paid'::public.booking_status,
      'searching_worker'::public.booking_status,
      null,
      now()
    );
  end if;

  select count(*)
  into v_existing_count
  from public.booking_worker_offers
  where booking_id = v_booking.id
    and status = 'pending';

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'status',
      case
        when v_booking.status = 'paid'::public.booking_status
             and v_created_count > 0
        then 'searching_worker'
        else v_booking.status::text
      end,
    'assigned', false,
    'worker_id', null,
    'created_offers', v_created_count,
    'pending_offers', v_existing_count,
    'offer_expires_at', v_offer_expires_at
  );
end;
$$;


ALTER FUNCTION "public"."dispatch_booking_worker_offers_internal"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_due_scheduled_worker_offers"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_booking record;
  v_result jsonb;
  v_count integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator or service role required';
  END IF;

  FOR v_booking IN
    SELECT DISTINCT b.id
    FROM public.bookings b
    WHERE b.fulfillment_type IN (
        'scheduled'::public.booking_fulfillment_type,
        'recurring'::public.booking_fulfillment_type
      )
      AND b.status IN (
        'paid'::public.booking_status,
        'searching_worker'::public.booking_status
      )
      AND b.worker_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.payments p
        WHERE p.booking_id = b.id
          AND p.status = 'paid'::public.payment_status
      )
      AND (
        (b.fulfillment_type = 'scheduled'::public.booking_fulfillment_type
          AND b.scheduled_start > now() + interval '30 minutes'
          AND b.scheduled_start <= now() + interval '40 minutes')
        OR
        (b.fulfillment_type = 'recurring'::public.booking_fulfillment_type
          AND EXISTS (
            SELECT 1
            FROM public.booking_schedule_occurrences o
            WHERE o.booking_id = b.id
              AND o.status = 'scheduled'
              AND o.worker_id IS NULL
              AND o.scheduled_start > now() + interval '30 minutes'
              AND o.scheduled_start <= now() + interval '40 minutes'
          ))
      )
    ORDER BY b.id
  LOOP
    BEGIN
      v_result := public.dispatch_booking_worker_offers_internal(v_booking.id);
      v_count := v_count + coalesce((v_result->>'created_offers')::integer, 0);
    EXCEPTION WHEN OTHERS THEN
      -- Keep one bad booking from stopping all other bookings in this minute.
      RAISE WARNING 'Scheduled dispatch failed for booking %: %', v_booking.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."dispatch_due_scheduled_worker_offers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_refund_processing_jobs"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_secret text;
  v_refund_id uuid;
  v_dispatched integer := 0;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'tempstaff-refund-dispatch',
      0
    )
  ) then
    return 0;
  end if;

  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name = 'tempstaff_refund_processor_secret'
  limit 1;

  if v_secret is null
     or pg_catalog.btrim(v_secret) = '' then
    raise exception
      'Refund processor secret is not configured';
  end if;

  for v_refund_id in
    select pr.id
    from public.payment_refunds pr
    where
      (
        pr.status = 'pending'
        and pr.updated_at <= (
          pg_catalog.now()
          - pg_catalog.interval '1 minute'
        )
      )
      or
      (
        pr.status = 'processing'
        and pr.updated_at <= (
          pg_catalog.now()
          - pg_catalog.interval '10 minutes'
        )
      )
    order by
      pr.requested_at asc,
      pr.created_at asc,
      pr.id asc
    limit 10
  loop

    perform net.http_post(
      url :=
        'https://gfzlsxlevzezfjoaaghb.supabase.co/functions/v1/process-razorpay-refund',
      params :=
        pg_catalog.jsonb_build_object(
          'refundId',
          v_refund_id::text
        ),
      headers :=
        pg_catalog.jsonb_build_object(
          'Content-Type',
          'application/json',
          'x-tempstaff-refund-secret',
          v_secret
        ),
      body :=
        pg_catalog.jsonb_build_object(
          'refundId',
          v_refund_id::text
        ),
      timeout_milliseconds := 5000
    );

    v_dispatched :=
      v_dispatched + 1;
  end loop;

  return v_dispatched;
end;
$$;


ALTER FUNCTION "public"."dispatch_refund_processing_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dispatch_scheduled_booking_offer_batch"("p_booking_id" "uuid", "p_occurrence_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_booking public.bookings%rowtype;
  v_occ public.booking_schedule_occurrences%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_address public.geography;
  v_worker record;
  v_limit integer;
  v_offer_minutes integer;
  v_created integer := 0;
  v_pending integer := 0;
  v_expires timestamptz;
BEGIN

  IF NOT EXISTS (
    SELECT 1
    FROM public.platform_settings ps
    WHERE ps.key = 'dispatch.scheduled_auto_offers_enabled'
      AND ps.is_active = true
      AND coalesce(ps.value ->> 'value', 'false') = 'true'
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'occurrence_id', p_occurrence_id,
      'created_offers', 0,
      'pending_offers', 0,
      'window_state', 'feature_disabled'
    );
  END IF;
  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'Booking ID is required';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status NOT IN (
      'paid'::public.booking_status,
      'searching_worker'::public.booking_status
    )
    OR v_booking.worker_id IS NOT NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.booking_id = v_booking.id
        AND p.status = 'paid'::public.payment_status
    ) THEN
    RETURN jsonb_build_object(
      'success', true, 'booking_id', v_booking.id,
      'occurrence_id', p_occurrence_id,
      'created_offers', 0, 'pending_offers', 0,
      'window_state', 'booking_not_eligible'
    );
  END IF;

  IF p_occurrence_id IS NULL THEN
    IF v_booking.fulfillment_type <> 'scheduled'::public.booking_fulfillment_type THEN
      RETURN jsonb_build_object(
        'success', true, 'booking_id', v_booking.id,
        'created_offers', 0, 'pending_offers', 0,
        'window_state', 'not_a_scheduled_booking'
      );
    END IF;
    v_start := v_booking.scheduled_start;
    v_end := v_booking.scheduled_end;
  ELSE
    IF v_booking.fulfillment_type <> 'recurring'::public.booking_fulfillment_type THEN
      RETURN jsonb_build_object(
        'success', true, 'booking_id', v_booking.id,
        'occurrence_id', p_occurrence_id,
        'created_offers', 0, 'pending_offers', 0,
        'window_state', 'not_a_recurring_booking'
      );
    END IF;

    SELECT * INTO v_occ
    FROM public.booking_schedule_occurrences
    WHERE id = p_occurrence_id
      AND booking_id = v_booking.id
    FOR UPDATE;

    IF NOT FOUND OR v_occ.status <> 'scheduled' OR v_occ.worker_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true, 'booking_id', v_booking.id,
        'occurrence_id', p_occurrence_id,
        'created_offers', 0, 'pending_offers', 0,
        'window_state', 'occurrence_not_eligible'
      );
    END IF;

    v_start := v_occ.scheduled_start;
    v_end := v_occ.scheduled_end;
  END IF;

  -- The dispatch window is intentionally ten minutes: start at T-40m and stop
  -- offering at T-30m. A scheduler or event may call this function repeatedly.
  IF v_start <= now() + interval '30 minutes' THEN
    RETURN jsonb_build_object(
      'success', true, 'booking_id', v_booking.id,
      'occurrence_id', p_occurrence_id,
      'created_offers', 0, 'pending_offers', 0,
      'window_state', 'window_closed'
    );
  END IF;

  IF v_start > now() + interval '40 minutes' THEN
    RETURN jsonb_build_object(
      'success', true, 'booking_id', v_booking.id,
      'occurrence_id', p_occurrence_id,
      'created_offers', 0, 'pending_offers', 0,
      'window_state', 'window_not_open'
    );
  END IF;

  UPDATE public.booking_worker_offers
  SET status = 'expired', responded_at = now(), updated_at = now()
  WHERE booking_id = v_booking.id
    AND occurrence_id IS NOT DISTINCT FROM p_occurrence_id
    AND status = 'pending'
    AND expires_at <= now();

  SELECT count(*) INTO v_pending
  FROM public.booking_worker_offers
  WHERE booking_id = v_booking.id
    AND occurrence_id IS NOT DISTINCT FROM p_occurrence_id
    AND status = 'pending'
    AND expires_at > now();

  IF v_pending > 0 THEN
    RETURN jsonb_build_object(
      'success', true, 'booking_id', v_booking.id,
      'occurrence_id', p_occurrence_id,
      'created_offers', 0, 'pending_offers', v_pending,
      'window_state', 'offers_pending'
    );
  END IF;

  SELECT CASE
    WHEN jsonb_typeof(ps.value -> 'value') = 'number'
    THEN (ps.value ->> 'value')::integer
    ELSE NULL
  END INTO v_limit
  FROM public.platform_settings ps
  WHERE ps.key = 'dispatch.worker_offer_limit'
    AND ps.is_active = true;

  SELECT CASE
    WHEN jsonb_typeof(ps.value -> 'value') = 'number'
    THEN (ps.value ->> 'value')::integer
    ELSE NULL
  END INTO v_offer_minutes
  FROM public.platform_settings ps
  WHERE ps.key = 'dispatch.worker_offer_duration_minutes'
    AND ps.is_active = true;

  IF v_limit IS NULL OR v_limit < 1 THEN
    RAISE EXCEPTION 'Dispatch setting dispatch.worker_offer_limit is invalid or missing';
  END IF;
  IF v_offer_minutes IS NULL OR v_offer_minutes < 1 THEN
    RAISE EXCEPTION 'Dispatch setting dispatch.worker_offer_duration_minutes is invalid or missing';
  END IF;

  v_expires := least(now() + make_interval(mins => v_offer_minutes), v_start - interval '30 minutes');
  IF v_expires <= now() THEN
    RETURN jsonb_build_object(
      'success', true, 'booking_id', v_booking.id,
      'occurrence_id', p_occurrence_id,
      'created_offers', 0, 'pending_offers', 0,
      'window_state', 'window_closed'
    );
  END IF;

  SELECT coalesce(
    a.location,
    public.st_setsrid(public.st_makepoint(a.longitude, a.latitude), 4326)::public.geography
  ) INTO v_address
  FROM public.addresses a
  WHERE a.id = v_booking.address_id;

  IF v_address IS NULL THEN
    RAISE EXCEPTION 'Booking location is missing';
  END IF;

  FOR v_worker IN
    SELECT
      wp.id AS worker_id,
      public.st_distance(wl.location, v_address) / 1000.0 AS distance_km
    FROM public.worker_services ws
    JOIN public.worker_profiles wp ON wp.id = ws.worker_id
    JOIN public.profiles p ON p.id = wp.id AND p.role = 'worker'::public.user_role AND p.is_active = true
    JOIN public.worker_presence pr
      ON pr.worker_id = wp.id
     AND pr.is_available = true
     AND pr.expires_at > now()
    JOIN LATERAL (
      SELECT wl.location
      FROM public.worker_locations wl
      WHERE wl.worker_id = wp.id
        AND wl.location IS NOT NULL
        AND wl.recorded_at >= now() - interval '10 minutes'
      ORDER BY wl.recorded_at DESC
      LIMIT 1
    ) wl ON true
    WHERE ws.service_id = v_booking.service_id
      AND wp.is_verified = true
      AND wp.worker_status = 'available'::public.worker_status
      AND wp.service_radius_km > 0
      AND public.st_dwithin(wl.location, v_address, least(wp.service_radius_km, 10) * 1000)
      AND public.st_dwithin(wl.location, v_address, 10000)
      AND public.worker_covers_booking_interval(
        v_booking.service_id, wp.id, v_start, v_end
      )
      AND NOT public.worker_has_active_assignment(wp.id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_worker_offers old_offer
        WHERE old_offer.booking_id = v_booking.id
          AND old_offer.occurrence_id IS NOT DISTINCT FROM p_occurrence_id
          AND old_offer.worker_id = wp.id
          AND old_offer.status IN ('pending', 'declined', 'expired')
      )
    ORDER BY distance_km ASC, wp.rating DESC NULLS LAST,
             wp.total_completed_jobs DESC NULLS LAST, wp.id
    LIMIT v_limit
  LOOP
    INSERT INTO public.booking_worker_offers (
      booking_id, occurrence_id, worker_id, status, offered_at,
      expires_at, responded_at, created_at, updated_at
    ) VALUES (
      v_booking.id, p_occurrence_id, v_worker.worker_id, 'pending', now(),
      v_expires, NULL, now(), now()
    )
    ON CONFLICT DO NOTHING;

    IF FOUND THEN
      v_created := v_created + 1;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_pending
  FROM public.booking_worker_offers
  WHERE booking_id = v_booking.id
    AND occurrence_id IS NOT DISTINCT FROM p_occurrence_id
    AND status = 'pending'
    AND expires_at > now();

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'occurrence_id', p_occurrence_id,
    'created_offers', v_created,
    'pending_offers', v_pending,
    'offer_expires_at', CASE WHEN v_pending > 0 THEN v_expires ELSE NULL END,
    'window_state', 'open'
  );
END;
$$;


ALTER FUNCTION "public"."dispatch_scheduled_booking_offer_batch"("p_booking_id" "uuid", "p_occurrence_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_booking_service_area"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_latitude double precision;
  v_longitude double precision;
  v_is_admin boolean := false;
  v_available boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  ) into v_is_admin;

  if v_is_admin then
    return new;
  end if;

  if new.customer_id <> auth.uid() then
    raise exception 'Customer does not match authenticated user';
  end if;

  select a.latitude, a.longitude
  into v_latitude, v_longitude
  from public.addresses a
  where a.id = new.address_id
    and a.user_id = new.customer_id;

  if v_latitude is null or v_longitude is null then
    raise exception 'Booking address must have a valid location';
  end if;

  select exists (
    select 1
    from public.service_areas sa
    where sa.is_active = true
      and (sa.service_id = new.service_id or sa.service_id is null)
      and st_dwithin(
        st_setsrid(st_makepoint(sa.center_longitude, sa.center_latitude), 4326)::geography,
        st_setsrid(st_makepoint(v_longitude, v_latitude), 4326)::geography,
        sa.radius_km * 1000
      )
  ) into v_available;

  if not v_available then
    raise exception 'This service is not currently available at the selected booking location';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_booking_service_area"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_customer_profile_phone_identity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  v_auth_phone text;
  v_auth_phone_confirmed_at timestamptz;
  v_auth_digits text;
  v_profile_digits text;
BEGIN
  -- Service-role and trusted database maintenance operations remain supported.
  IF coalesce(auth.role(), '') = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  -- An authenticated administrator may perform reviewed account corrections.
  IF auth.uid() IS NOT NULL AND public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- The auth.users worker-signup trigger creates worker profiles internally.
  -- Do not block that trusted trigger; ordinary client requests have auth.uid().
  IF auth.uid() IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = NEW.id
        AND u.raw_user_meta_data ->> 'role' = 'worker'
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Profile phone changes require a verified account session'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'You may only set the phone number for your own profile'
      USING ERRCODE = '42501';
  END IF;

  -- For updates, this new guard is scoped to customer phone identity.
  -- Worker phone-edit workflow will be audited and corrected in the worker phase.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM 'customer'::public.user_role THEN
      RETURN NEW;
    END IF;

    IF NEW.phone IS NOT DISTINCT FROM OLD.phone THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT u.phone, u.phone_confirmed_at
    INTO v_auth_phone, v_auth_phone_confirmed_at
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF v_auth_phone IS NULL OR v_auth_phone_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Verify your mobile number before saving it to your profile'
      USING ERRCODE = '42501';
  END IF;

  v_auth_digits := pg_catalog.regexp_replace(v_auth_phone, '[^0-9]', '', 'g');

  -- This app currently supports Indian mobile numbers.
  IF pg_catalog.length(v_auth_digits) = 12
     AND pg_catalog.left(v_auth_digits, 2) = '91' THEN
    v_auth_digits := pg_catalog.right(v_auth_digits, 10);
  ELSIF pg_catalog.length(v_auth_digits) <> 10 THEN
    RAISE EXCEPTION 'The verified Auth phone is not a supported Indian mobile number'
      USING ERRCODE = '42501';
  END IF;

  v_profile_digits := pg_catalog.regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g');

  IF NOT (
    pg_catalog.length(v_profile_digits) = 10
    OR (
      pg_catalog.length(v_profile_digits) = 11
      AND pg_catalog.left(v_profile_digits, 1) = '0'
    )
    OR (
      pg_catalog.length(v_profile_digits) = 12
      AND pg_catalog.left(v_profile_digits, 2) = '91'
    )
  ) THEN
    RAISE EXCEPTION 'Enter a valid Indian mobile number'
      USING ERRCODE = '22023';
  END IF;

  v_profile_digits := pg_catalog.right(v_profile_digits, 10);

  IF v_profile_digits !~ '^[6-9][0-9]{9}$'
     OR v_profile_digits IS DISTINCT FROM v_auth_digits THEN
    RAISE EXCEPTION 'The profile phone must match the mobile number verified by Supabase Auth'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$_$;


ALTER FUNCTION "public"."enforce_customer_profile_phone_identity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_booking_worker_offers"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer := 0;
  v_changed integer := 0;
  v_booking_id uuid;
  v_booking public.bookings%rowtype;
begin
  if auth.role()<>'service_role'
     and not public.is_admin() then
    raise exception 'Admin or service-role access required';
  end if;

  for v_booking_id in
    select distinct booking_id
    from public.booking_worker_offers
    where status='pending'
      and expires_at<=now()
    order by booking_id
  loop
    select *
    into v_booking
    from public.bookings
    where id=v_booking_id
    for update;

    if not found then
      continue;
    end if;

    update public.booking_worker_offers
    set status='expired',
        responded_at=now(),
        updated_at=now()
    where booking_id=v_booking_id
      and status='pending'
      and expires_at<=now();

    get diagnostics v_changed = row_count;
    v_count:=v_count+v_changed;

    begin
      perform public.dispatch_booking_worker_offers_internal(v_booking_id);
    exception when others then
      null;
    end;
  end loop;

  return v_count;
end;
$$;


ALTER FUNCTION "public"."expire_booking_worker_offers"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_payment_refund"("p_refund_id" "uuid", "p_status" "text", "p_provider_refund_id" "text" DEFAULT NULL::"text", "p_failure_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_refund public.payment_refunds%rowtype;
  v_payment public.payments%rowtype;
  v_succeeded numeric;
  v_existing_status text;
  v_effective_provider_refund_id text;
begin
  if not (
    (select auth.jwt() ->> 'role') = 'service_role'
    or (auth.uid() is not null and public.is_admin())
  ) then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('processing','succeeded','failed','cancelled') then
    raise exception 'Invalid refund status';
  end if;

  select * into v_refund
  from public.payment_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund not found';
  end if;

  v_existing_status := v_refund.status::text;
  v_effective_provider_refund_id :=
    coalesce(p_provider_refund_id, v_refund.provider_refund_id);

  if v_existing_status = p_status then
    if p_status = 'succeeded'
       and v_effective_provider_refund_id is null then
      raise exception 'A succeeded refund must have a provider refund ID';
    end if;

    update public.payment_refunds
    set provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
        failure_reason = coalesce(p_failure_reason, failure_reason),
        processed_at = case
          when p_status in ('succeeded','failed','cancelled')
          then coalesce(processed_at, now())
          else processed_at
        end,
        updated_at = now()
    where id = p_refund_id;

    return jsonb_build_object(
      'success', true,
      'refund_id', p_refund_id,
      'refund_request_id', v_refund.refund_request_id,
      'status', p_status,
      'idempotent', true,
      'payment_status', (
        select status::text from public.payments
        where id = v_refund.payment_id
      )
    );
  end if;

  if v_existing_status in ('succeeded','failed','cancelled') then
    raise exception
      'Refund cannot transition from terminal status % to %',
      v_existing_status, p_status;
  end if;

  if v_existing_status = 'pending' then
    if p_status not in ('processing','failed','cancelled','succeeded') then
      raise exception 'Invalid refund transition';
    end if;
  elsif v_existing_status = 'processing' then
    if p_status not in ('succeeded','failed','cancelled') then
      raise exception 'Invalid refund transition';
    end if;
  else
    raise exception 'Refund has unsupported current status %', v_existing_status;
  end if;

  if p_status = 'succeeded'
     and v_effective_provider_refund_id is null then
    raise exception 'A succeeded refund must have a provider refund ID';
  end if;

  select * into v_payment
  from public.payments
  where id = v_refund.payment_id
  for update;

  select coalesce(sum(amount), 0) into v_succeeded
  from public.payment_refunds
  where payment_id = v_refund.payment_id
    and status = 'succeeded'
    and id <> v_refund.id;

  if p_status = 'succeeded'
     and v_succeeded + v_refund.amount > v_payment.amount then
    raise exception 'Succeeded refunds would exceed the payment amount';
  end if;

  update public.payment_refunds
  set status = p_status,
      provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
      failure_reason = coalesce(p_failure_reason, failure_reason),
      processed_at = case
        when p_status in ('succeeded','failed','cancelled') then now()
        else processed_at
      end,
      updated_at = now()
  where id = p_refund_id;

  if v_refund.refund_request_id is not null then
    update public.refund_requests
    set status = p_status,
        provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
        processed_at = case
          when p_status in ('succeeded','failed','cancelled')
          then coalesce(processed_at, now())
          else processed_at
        end,
        updated_at = now()
    where id = v_refund.refund_request_id;
  end if;

  v_succeeded := v_succeeded +
    case when p_status = 'succeeded' then v_refund.amount else 0 end;

  if v_succeeded >= v_payment.amount then
    update public.payments
    set status = 'refunded'::public.payment_status,
        updated_at = now()
    where id = v_payment.id;
  elsif v_succeeded > 0 then
    update public.payments
    set status = 'partially_refunded'::public.payment_status,
        updated_at = now()
    where id = v_payment.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'refund_id', p_refund_id,
    'refund_request_id', v_refund.refund_request_id,
    'status', p_status,
    'payment_status', (
      select status::text from public.payments
      where id = v_payment.id
    ),
    'succeeded_refund_total', v_succeeded
  );
end;
$$;


ALTER FUNCTION "public"."finalize_payment_refund"("p_refund_id" "uuid", "p_status" "text", "p_provider_refund_id" "text", "p_failure_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."finalize_razorpay_payment"("p_payment_id" "uuid", "p_provider_payment_id" "text", "p_paid_at" timestamp with time zone DEFAULT "now"()) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_booking_id uuid;
  v_dispatch jsonb;
  v_cancelled_at timestamptz;
  v_quote jsonb;
  v_quote_refund numeric := 0;
  v_reserved_refund numeric := 0;
  v_refund_amount numeric := 0;
  v_refund public.payment_refunds%rowtype;
  v_occ record;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment ID is required';
  END IF;

  IF p_provider_payment_id IS NULL
     OR btrim(p_provider_payment_id) = '' THEN
    RAISE EXCEPTION 'Provider payment ID is required';
  END IF;

  IF v_paid_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Invalid payment timestamp';
  END IF;

  -- Global booking lifecycle lock order: booking -> payment -> refund rows.
  -- Read the booking ID without locking payment, then acquire locks in order.
  SELECT p.booking_id
  INTO v_booking_id
  FROM public.payments p
  WHERE p.id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'Payment has no associated booking';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = v_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found for payment';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.booking_id IS DISTINCT FROM v_booking.id THEN
    RAISE EXCEPTION 'Payment booking association changed during finalization';
  END IF;

  IF v_payment.provider_payment_id IS NOT NULL
     AND v_payment.provider_payment_id <> p_provider_payment_id THEN
    RAISE EXCEPTION 'Provider payment ID does not match recorded payment';
  END IF;

  IF v_payment.status = 'paid'::public.payment_status THEN
    IF v_booking.status = 'cancelled'::public.booking_status THEN
      SELECT h.created_at
      INTO v_cancelled_at
      FROM public.booking_status_history h
      WHERE h.booking_id = v_booking.id
        AND h.new_status = 'cancelled'::public.booking_status
      ORDER BY h.created_at DESC, h.id DESC
      LIMIT 1;

      IF v_cancelled_at IS NULL THEN
        RAISE EXCEPTION
          'Cancelled paid booking has no cancellation timestamp; refund reconciliation required';
      END IF;

      v_quote_refund := 0;

      IF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type THEN
        FOR v_occ IN
          SELECT o.total_amount, o.scheduled_start, o.cancelled_at
          FROM public.booking_schedule_occurrences o
          WHERE o.booking_id = v_booking.id
            AND o.status = 'cancelled'
          ORDER BY o.occurrence_index
        LOOP
          v_quote := public.calculate_cancellation_refund(
            coalesce(v_occ.total_amount, 0),
            v_occ.scheduled_start,
            coalesce(v_occ.cancelled_at, v_cancelled_at)
          );

          v_quote_refund := v_quote_refund
            + greatest(coalesce((v_quote->>'refund_amount')::numeric, 0), 0);
        END LOOP;
      ELSE
        v_quote := public.calculate_cancellation_refund(
          coalesce(v_payment.amount, 0),
          v_booking.scheduled_start,
          v_cancelled_at
        );

        v_quote_refund := greatest(coalesce((v_quote->>'refund_amount')::numeric, 0), 0);
      END IF;

      v_quote_refund := least(greatest(v_quote_refund, 0), coalesce(v_payment.amount, 0));

      SELECT coalesce(sum(pr.amount), 0)
      INTO v_reserved_refund
      FROM public.payment_refunds pr
      WHERE pr.payment_id = v_payment.id
        AND pr.status IN ('pending', 'processing', 'succeeded');

      v_refund_amount := greatest(v_quote_refund - v_reserved_refund, 0);

      IF v_refund_amount > 0 THEN
        INSERT INTO public.payment_refunds(
          payment_id, booking_id, amount, currency, reason,
          status, requested_by, requested_at
        )
        VALUES(
          v_payment.id,
          v_booking.id,
          round(v_refund_amount, 2),
          v_payment.currency,
          CASE
            WHEN v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type
            THEN 'Automatic refund: reconciled already-paid cancelled recurring booking'
            ELSE 'Automatic refund: reconciled already-paid cancelled booking'
          END,
          'pending',
          NULL,
          now()
        )
        RETURNING * INTO v_refund;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'already_paid', true,
        'booking_id', v_booking.id,
        'payment_id', v_payment.id,
        'booking_status', 'cancelled',
        'assigned', false,
        'captured_after_cancellation', true,
        'refund_reconciliation_checked', true,
        'refund_amount', round(coalesce(v_refund_amount, 0), 2),
        'refund_id', v_refund.id,
        'refund_status', v_refund.status
      );
    END IF;

    BEGIN
      v_dispatch := public.dispatch_booking_worker_offers_internal(v_booking.id);
    EXCEPTION
      WHEN OTHERS THEN
        v_dispatch := jsonb_build_object(
          'success', false,
          'assigned', false,
          'status', 'searching_worker',
          'error', sqlerrm
        );
    END;

    RETURN jsonb_build_object(
      'success', true,
      'already_paid', true,
      'payment_id', v_payment.id,
      'booking_id', v_booking.id,
      'booking_status', coalesce(v_dispatch->>'status', v_booking.status::text),
      'assigned', coalesce((v_dispatch->>'assigned')::boolean, false),
      'worker_id', v_dispatch->'worker_id',
      'created_offers', coalesce(v_dispatch->'created_offers', '0'::jsonb),
      'pending_offers', coalesce(v_dispatch->'pending_offers', '0'::jsonb)
    );
  END IF;

  IF v_payment.status NOT IN ('pending'::public.payment_status, 'failed'::public.payment_status) THEN
    RAISE EXCEPTION 'Payment is not eligible for success finalization';
  END IF;

  IF v_booking.status = 'cancelled'::public.booking_status THEN
    IF v_booking.scheduled_start IS NULL THEN
      RAISE EXCEPTION 'Cancelled booking has no scheduled start; payment finalization requires reconciliation';
    END IF;

    SELECT h.created_at
    INTO v_cancelled_at
    FROM public.booking_status_history h
    WHERE h.booking_id = v_booking.id
      AND h.new_status = 'cancelled'::public.booking_status
    ORDER BY h.created_at DESC, h.id DESC
    LIMIT 1;

    IF v_cancelled_at IS NULL THEN
      RAISE EXCEPTION 'Cancelled booking has no cancellation history timestamp; payment finalization requires reconciliation';
    END IF;

    UPDATE public.payments
    SET provider_payment_id = p_provider_payment_id,
        status = 'paid'::public.payment_status,
        paid_at = v_paid_at,
        updated_at = now()
    WHERE id = v_payment.id;

    IF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type THEN
      v_quote_refund := 0;

      FOR v_occ IN
        SELECT o.total_amount, o.scheduled_start, o.cancelled_at
        FROM public.booking_schedule_occurrences o
        WHERE o.booking_id = v_booking.id
          AND o.status = 'cancelled'
        ORDER BY o.occurrence_index
      LOOP
        v_quote := public.calculate_cancellation_refund(
          coalesce(v_occ.total_amount, 0),
          v_occ.scheduled_start,
          coalesce(v_occ.cancelled_at, v_cancelled_at)
        );

        v_quote_refund := v_quote_refund
          + greatest(coalesce((v_quote->>'refund_amount')::numeric, 0), 0);
      END LOOP;
    ELSE
      v_quote := public.calculate_cancellation_refund(
        coalesce(v_payment.amount, 0),
        v_booking.scheduled_start,
        v_cancelled_at
      );

      v_quote_refund := greatest(coalesce((v_quote->>'refund_amount')::numeric, 0), 0);
    END IF;

    IF v_quote_refund > v_payment.amount THEN
      v_quote_refund := v_payment.amount;
    END IF;

    IF v_quote_refund > 0 THEN
      SELECT coalesce(sum(pr.amount), 0)
      INTO v_reserved_refund
      FROM public.payment_refunds pr
      WHERE pr.payment_id = v_payment.id
        AND pr.status IN ('pending', 'processing', 'succeeded');

      v_refund_amount := greatest(v_quote_refund - v_reserved_refund, 0);

      IF v_refund_amount > 0 THEN
        INSERT INTO public.payment_refunds(
          payment_id, booking_id, amount, currency, reason,
          status, requested_by, requested_at
        )
        VALUES(
          v_payment.id,
          v_booking.id,
          round(v_refund_amount, 2),
          v_payment.currency,
          CASE
            WHEN v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type
            THEN 'Automatic refund: recurring-series payment captured after cancellation'
            ELSE 'Automatic refund: payment captured after cancellation'
          END,
          'pending',
          NULL,
          now()
        )
        RETURNING * INTO v_refund;
      END IF;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'already_paid', false,
      'payment_id', v_payment.id,
      'booking_id', v_booking.id,
      'booking_status', 'cancelled',
      'assigned', false,
      'captured_after_cancellation', true,
      'refund_amount', round(v_refund_amount, 2),
      'refund_id', v_refund.id,
      'refund_status', v_refund.status
    );
  END IF;

  IF v_booking.status = 'expired'::public.booking_status THEN
    RAISE EXCEPTION 'Booking is expired and cannot be paid';
  END IF;

  IF (
    v_booking.fulfillment_type IN (
      'instant'::public.booking_fulfillment_type,
      'scheduled'::public.booking_fulfillment_type
    )
    AND v_booking.status IN (
      'pending_payment'::public.booking_status,
      'payment_failed'::public.booking_status
    )
    AND v_booking.scheduled_start IS NOT NULL
    AND v_booking.scheduled_start <= now()
  ) THEN
    UPDATE public.bookings
    SET status = 'expired'::public.booking_status,
        updated_at = now()
    WHERE id = v_booking.id
      AND status IN (
        'pending_payment'::public.booking_status,
        'payment_failed'::public.booking_status
      );

    INSERT INTO public.booking_status_history (
      booking_id, old_status, new_status, changed_by, created_at
    )
    VALUES (
      v_booking.id, v_booking.status, 'expired'::public.booking_status, NULL, now()
    );

    RAISE EXCEPTION 'Booking expired before payment finalization';
  END IF;

  UPDATE public.payments
  SET provider_payment_id = p_provider_payment_id,
      status = 'paid'::public.payment_status,
      paid_at = v_paid_at,
      updated_at = now()
  WHERE id = v_payment.id;

  IF v_booking.status IN (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status
  ) THEN
    UPDATE public.bookings
    SET status = 'paid'::public.booking_status,
        updated_at = now()
    WHERE id = v_booking.id;

    INSERT INTO public.booking_status_history (
      booking_id, old_status, new_status, changed_by, created_at
    )
    VALUES (
      v_booking.id, v_booking.status, 'paid'::public.booking_status, NULL, now()
    );
  END IF;

  /*
   * If some recurring occurrences were cancelled while payment was pending,
   * reconcile their policy-based refunds after capture. Other occurrences in
   * the series remain eligible for worker dispatch below.
   */
  IF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type THEN
    v_quote_refund := 0;

    FOR v_occ IN
      SELECT o.total_amount, o.scheduled_start, o.cancelled_at
      FROM public.booking_schedule_occurrences o
      WHERE o.booking_id = v_booking.id
        AND o.status = 'cancelled'
      ORDER BY o.occurrence_index
    LOOP
      v_quote := public.calculate_cancellation_refund(
        coalesce(v_occ.total_amount, 0),
        v_occ.scheduled_start,
        coalesce(v_occ.cancelled_at, now())
      );

      v_quote_refund := v_quote_refund
        + greatest(coalesce((v_quote->>'refund_amount')::numeric, 0), 0);
    END LOOP;

    IF v_quote_refund > v_payment.amount THEN
      v_quote_refund := v_payment.amount;
    END IF;

    IF v_quote_refund > 0 THEN
      SELECT coalesce(sum(pr.amount), 0)
      INTO v_reserved_refund
      FROM public.payment_refunds pr
      WHERE pr.payment_id = v_payment.id
        AND pr.status IN ('pending', 'processing', 'succeeded');

      v_refund_amount := greatest(v_quote_refund - v_reserved_refund, 0);

      IF v_refund_amount > 0 THEN
        INSERT INTO public.payment_refunds(
          payment_id, booking_id, amount, currency, reason,
          status, requested_by, requested_at
        )
        VALUES(
          v_payment.id,
          v_booking.id,
          round(v_refund_amount, 2),
          v_payment.currency,
          'Automatic refund: recurring occurrence(s) cancelled before payment capture',
          'pending',
          NULL,
          now()
        )
        RETURNING * INTO v_refund;
      END IF;
    END IF;
  END IF;

  BEGIN
    v_dispatch := public.dispatch_booking_worker_offers_internal(v_booking.id);
  EXCEPTION
    WHEN OTHERS THEN
      v_dispatch := jsonb_build_object(
        'success', false,
        'assigned', false,
        'status', 'searching_worker',
        'error', sqlerrm
      );

      UPDATE public.bookings
      SET status = 'searching_worker'::public.booking_status,
          updated_at = now()
      WHERE id = v_booking.id
        AND status = 'paid'::public.booking_status;

      INSERT INTO public.booking_status_history (
        booking_id, old_status, new_status, changed_by, created_at
      )
      VALUES (
        v_booking.id,
        'paid'::public.booking_status,
        'searching_worker'::public.booking_status,
        NULL,
        now()
      );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'already_paid', false,
    'payment_id', v_payment.id,
    'booking_id', v_booking.id,
    'booking_status', coalesce(v_dispatch->>'status', 'searching_worker'),
    'assigned', coalesce((v_dispatch->>'assigned')::boolean, false),
    'worker_id', v_dispatch->'worker_id',
    'created_offers', coalesce(v_dispatch->'created_offers', '0'::jsonb),
    'pending_offers', coalesce(v_dispatch->'pending_offers', '0'::jsonb),
    'cancelled_occurrence_refund_amount', round(v_refund_amount, 2),
    'cancelled_occurrence_refund_id', v_refund.id,
    'cancelled_occurrence_refund_status', v_refund.status
  );
END;
$$;


ALTER FUNCTION "public"."finalize_razorpay_payment"("p_payment_id" "uuid", "p_provider_payment_id" "text", "p_paid_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_configured_gst_rate_percent"() RETURNS numeric
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select greatest(0, least(100,
    coalesce(
      (select nullif(trim(ps.value->>'value'), '')::numeric
       from public.platform_settings ps
       where ps.key = 'tax.gst_rate_percent'
         and ps.is_active = true
       order by ps.updated_at desc
       limit 1),
      0
    )
  ));
$$;


ALTER FUNCTION "public"."get_configured_gst_rate_percent"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_configured_gst_rate_percent"() IS 'Returns the configured GST rate percentage. Defaults to 0 until tax.gst_rate_percent is explicitly configured.';



CREATE OR REPLACE FUNCTION "public"."get_customer_booking_refunds"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
  select private.get_customer_booking_refunds(p_booking_id);
$$;


ALTER FUNCTION "public"."get_customer_booking_refunds"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_instant_availability_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_duration_hours" numeric DEFAULT 1) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := auth.uid();
  v_service_id uuid;
  v_address public.geography;
  v_area_available boolean := false;
  v_timezone text := 'Asia/Kolkata';
  v_open_time time := '08:00:00';
  v_close_time time := '22:00:00';
  v_now_local timestamp;
  v_operating_start timestamptz;
  v_operating_end timestamptz;
  v_duration interval;
  v_cursor timestamptz;
  v_last_start timestamptz;
  v_slots jsonb := '[]'::jsonb;
  v_count integer := 0;
begin
  if v_customer_id is null then
    raise exception 'Authentication required';
  end if;

  if p_service_variant_id is null
     or p_address_id is null
     or p_duration_hours is null
     or p_duration_hours < 1
     or p_duration_hours > 24 then
    raise exception 'Invalid instant availability request';
  end if;

  select sv.service_id
    into v_service_id
  from public.service_variants sv
  join public.services s
    on s.id = sv.service_id
  where sv.id = p_service_variant_id
    and sv.is_active = true
    and lower(sv.billing_type) = 'hourly'
    and s.is_active = true
  limit 1;

  if v_service_id is null then
    raise exception 'An active hourly service variant is required';
  end if;

  select coalesce(
    a.location,
    st_setsrid(
      st_makepoint(a.longitude, a.latitude),
      4326
    )::public.geography
  )
    into v_address
  from public.addresses a
  where a.id = p_address_id
    and a.user_id = v_customer_id
    and a.latitude is not null
    and a.longitude is not null;

  if v_address is null then
    raise exception 'Valid customer address is required';
  end if;

  select exists (
    select 1
    from public.service_areas sa
    where sa.is_active = true
      and (sa.service_id = v_service_id or sa.service_id is null)
      and st_dwithin(
        st_setsrid(
          st_makepoint(
            sa.center_longitude,
            sa.center_latitude
          ),
          4326
        )::public.geography,
        v_address,
        sa.radius_km * 1000
      )
  )
    into v_area_available;

  if not v_area_available then
    return jsonb_build_object(
      'service_area_available', false,
      'instant_available', false,
      'slots', '[]'::jsonb
    );
  end if;

  select coalesce(
    nullif(trim(value->>'value'), ''),
    'Asia/Kolkata'
  )
    into v_timezone
  from public.platform_settings
  where key = 'operations.timezone'
    and is_active = true
  order by updated_at desc
  limit 1;

  v_timezone := coalesce(v_timezone, 'Asia/Kolkata');

  select coalesce(
    (
      select (value->>'value')::time
      from public.platform_settings
      where key = 'operations.default_start_time'
        and is_active = true
      order by updated_at desc
      limit 1
    ),
    '08:00:00'::time
  )
    into v_open_time;

  select coalesce(
    (
      select (value->>'value')::time
      from public.platform_settings
      where key = 'operations.default_end_time'
        and is_active = true
      order by updated_at desc
      limit 1
    ),
    '22:00:00'::time
  )
    into v_close_time;

  v_duration := make_interval(
    secs => (p_duration_hours * 3600)::double precision
  );

  v_now_local := now() at time zone v_timezone;

  v_operating_start := (
    v_now_local::date::text || ' ' ||
    v_open_time::text || ' ' ||
    v_timezone
  )::timestamptz;

  v_operating_end := (
    v_now_local::date::text || ' ' ||
    v_close_time::text || ' ' ||
    v_timezone
  )::timestamptz;

  v_cursor := to_timestamp(
    ceil(
      extract(
        epoch from (now() + interval '15 minutes')
      ) / 900
    ) * 900
  );

  if v_cursor < v_operating_start then
    v_cursor := v_operating_start;
  end if;

  v_last_start := least(
    v_operating_end - v_duration,
    now() + interval '4 hours'
  );

  if v_cursor > v_last_start then
    return jsonb_build_object(
      'service_area_available', true,
      'instant_available', false,
      'slots', '[]'::jsonb
    );
  end if;

  while v_cursor <= v_last_start loop
    select count(*)
      into v_count
    from public.worker_profiles wp
    join public.worker_services ws
      on ws.worker_id = wp.id
     and ws.service_id = v_service_id
    join public.worker_presence pr
      on pr.worker_id = wp.id
     and pr.is_available = true
     and pr.expires_at > now()
    join lateral (
      select wl.location
      from public.worker_locations wl
      where wl.worker_id = wp.id
        and wl.location is not null
        and wl.recorded_at >= now() - interval '10 minutes'
      order by wl.recorded_at desc
      limit 1
    ) wl on true
    where wp.is_verified = true
      and wp.worker_status = 'available'::public.worker_status
      and wp.service_radius_km > 0
      and st_dwithin(
        wl.location,
        v_address,
        least(wp.service_radius_km, 10) * 1000
      )
      and st_dwithin(
        wl.location,
        v_address,
        10000
      )
      and public.worker_covers_booking_interval(
        v_service_id,
        wp.id,
        v_cursor,
        v_cursor + v_duration
      )
      and not exists (
        select 1
        from public.bookings b
        where b.worker_id = wp.id
          and b.status in (
            'assigned'::public.booking_status,
            'on_the_way'::public.booking_status,
            'arrived'::public.booking_status,
            'in_progress'::public.booking_status
          )
          and b.scheduled_start < v_cursor + v_duration
          and b.scheduled_end > v_cursor
      );

    if v_count > 0 then
      v_slots := v_slots || jsonb_build_array(
        jsonb_build_object(
          'start', v_cursor,
          'end', v_cursor + v_duration,
          'available_worker_count', v_count
        )
      );
    end if;

    v_cursor := v_cursor + interval '15 minutes';
  end loop;

  return jsonb_build_object(
    'service_area_available', true,
    'instant_available',
      jsonb_array_length(v_slots) > 0,
    'slots', v_slots
  );
end;
$$;


ALTER FUNCTION "public"."get_customer_instant_availability_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_duration_hours" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_near_term_scheduled_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid") RETURNS TABLE("slot_start" timestamp with time zone, "slot_end" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_tz text;
  v_today date;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select coalesce(nullif(trim(value->>'value'),''),'Asia/Kolkata') into v_tz from public.platform_settings where key='operations.timezone' and is_active=true order by updated_at desc limit 1;
  v_tz:=coalesce(v_tz,'Asia/Kolkata');
  v_today:=(now() at time zone v_tz)::date;
  return query select s.slot_start,s.slot_end from public.get_customer_scheduled_slots(p_service_variant_id,p_address_id,v_today,v_today+1) s;
end;
$$;


ALTER FUNCTION "public"."get_customer_near_term_scheduled_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_scheduled_availability_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_duration_hours" integer DEFAULT 1) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user uuid := auth.uid();
  v_service_id uuid;
  v_area_available boolean := false;
  v_duration interval;
  v_cursor timestamptz;
  v_last_start timestamptz;
  v_slots jsonb := '[]'::jsonb;
  v_count integer;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  if p_service_variant_id is null or p_address_id is null
     or p_start is null or p_end is null
     or p_end <= p_start then
    raise exception 'Invalid availability request';
  end if;

  if p_duration_hours < 1 or p_duration_hours > 24 then
    raise exception 'Duration must be between 1 and 24 hours';
  end if;

  select sv.service_id
    into v_service_id
  from public.service_variants sv
  where sv.id = p_service_variant_id
    and sv.is_active = true
  limit 1;

  if v_service_id is null then
    raise exception 'Service variant is not active';
  end if;

  if not exists (
    select 1
    from public.addresses a
    where a.id = p_address_id
      and a.user_id = v_user
  ) then
    raise exception 'Booking address does not belong to this customer';
  end if;

  select exists (
    select 1
    from public.addresses a
    join public.service_areas sa
      on (sa.service_id = v_service_id or sa.service_id is null)
     and sa.is_active = true
     and st_dwithin(
       a.location,
       st_setsrid(st_makepoint(sa.center_longitude, sa.center_latitude), 4326)::geography,
       sa.radius_km * 1000
     )
    where a.id = p_address_id
  )
  into v_area_available;

  if not v_area_available then
    return jsonb_build_object(
      'service_area_available', false,
      'slots', '[]'::jsonb
    );
  end if;

  v_duration := make_interval(hours => p_duration_hours);
  v_cursor := greatest(p_start, now());
  v_last_start := least(
    p_end - v_duration,
    (
      (
        (
          now() at time zone coalesce(
            (
              select nullif(trim(value->>'value'), '')
              from public.platform_settings
              where key = 'operations.timezone'
                and is_active = true
              order by updated_at desc
              limit 1
            ),
            'Asia/Kolkata'
          )
        )::date + 2
      )::timestamp
      at time zone coalesce(
        (
          select nullif(trim(value->>'value'), '')
          from public.platform_settings
          where key = 'operations.timezone'
            and is_active = true
          order by updated_at desc
          limit 1
        ),
        'Asia/Kolkata'
      )
    ) - v_duration
  );

  while v_cursor <= v_last_start loop
    select count(*)
      into v_count
    from public.worker_services ws
    join public.worker_profiles wp
      on wp.id = ws.worker_id
    where ws.service_id = v_service_id
      and wp.is_verified = true
      and wp.worker_status <> 'suspended'::public.worker_status
      and public.worker_covers_booking_interval(
        v_service_id,
        ws.worker_id,
        v_cursor,
        v_cursor + v_duration
      );

    if v_count > 0 then
      v_slots := v_slots || jsonb_build_array(
        jsonb_build_object(
          'start', v_cursor,
          'end', v_cursor + v_duration,
          'available_worker_count', v_count
        )
      );
    end if;

    v_cursor := v_cursor + interval '1 hour';
  end loop;

  return jsonb_build_object(
    'service_area_available', true,
    'slots', v_slots
  );
end;
$$;


ALTER FUNCTION "public"."get_customer_scheduled_availability_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_duration_hours" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_customer_scheduled_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date") RETURNS TABLE("slot_start" timestamp with time zone, "slot_end" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid:=auth.uid();
  v_service_id uuid;
  v_timezone text:='Asia/Kolkata';
  v_today date;
  v_tomorrow date;
  v_date date;
  v_worker record;
  v_window record;
  v_start_local timestamp;
  v_slot_local timestamp;
  v_slot_end_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_end_date<p_start_date then raise exception 'Invalid date range'; end if;
  select coalesce(nullif(trim(value->>'value'),''),'Asia/Kolkata') into v_timezone from public.platform_settings where key='operations.timezone' and is_active=true order by updated_at desc limit 1;
  select (now() at time zone v_timezone)::date,(now() at time zone v_timezone)::date+1 into v_today,v_tomorrow;
  if p_start_date<v_today or p_end_date>v_tomorrow then raise exception 'Worker availability slots are available only through tomorrow; later dates can be booked directly'; end if;
  select sv.service_id into v_service_id from public.service_variants sv join public.services s on s.id=sv.service_id where sv.id=p_service_variant_id and sv.is_active=true and s.is_active=true;
  if v_service_id is null then raise exception 'Service package is not available'; end if;
  if not exists(select 1 from public.addresses a where a.id=p_address_id and a.user_id=v_customer_id and a.latitude is not null and a.longitude is not null) then raise exception 'Valid customer address is required'; end if;
  if not exists(select 1 from public.service_areas sa join public.addresses a on a.id=p_address_id where sa.is_active=true and (sa.service_id=v_service_id or sa.service_id is null) and st_dwithin(st_setsrid(st_makepoint(sa.center_longitude,sa.center_latitude),4326)::geography,coalesce(a.location,st_setsrid(st_makepoint(a.longitude,a.latitude),4326)::geography),sa.radius_km*1000)) then raise exception 'Service is not available at this address'; end if;
  for v_worker in select wp.id,coalesce(wss.timezone,v_timezone) timezone from public.worker_profiles wp join public.worker_services ws on ws.worker_id=wp.id and ws.service_id=v_service_id join public.worker_schedule_settings wss on wss.worker_id=wp.id where wp.is_verified=true and wp.worker_status='available'::public.worker_status loop
    v_date:=p_start_date;
    while v_date<=p_end_date loop
      for v_window in (
        select w.start_time,w.end_time from public.worker_weekly_schedules w where w.worker_id=v_worker.id and w.day_of_week=extract(dow from v_date)::smallint and w.is_active=true
        union
        select e.start_time,e.end_time from public.worker_schedule_exceptions e where e.worker_id=v_worker.id and e.exception_date=v_date and e.exception_type='available' and e.is_active=true and e.start_time is not null and e.end_time is not null
      ) loop
        v_start_local:=v_date::timestamp+v_window.start_time;
        v_slot_local:=v_start_local;
        while v_slot_local + interval '1 hour' <= v_date::timestamp+v_window.end_time loop
          v_slot_end_local:=v_slot_local+interval '1 hour';
          v_start:=v_slot_local at time zone v_worker.timezone;
          v_end:=v_slot_end_local at time zone v_worker.timezone;
          if v_start>now()
             and not exists(select 1 from public.worker_schedule_exceptions e where e.worker_id=v_worker.id and e.exception_date=v_date and e.exception_type='unavailable' and e.is_active=true and (e.start_time is null or e.end_time is null or (v_slot_local::time<e.end_time and v_slot_end_local::time>e.start_time)))
             and not exists(select 1 from public.bookings b where b.worker_id=v_worker.id and b.status in ('assigned'::public.booking_status,'on_the_way'::public.booking_status,'arrived'::public.booking_status,'in_progress'::public.booking_status) and b.scheduled_start<v_end and b.scheduled_end>v_start)
          then slot_start:=v_start; slot_end:=v_end; return next; end if;
          v_slot_local:=v_slot_local+interval '1 hour';
        end loop;
      end loop;
      v_date:=v_date+1;
    end loop;
  end loop;
  return;
end;
$$;


ALTER FUNCTION "public"."get_customer_scheduled_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_eligible_workers"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_result jsonb;
  v_is_scheduled boolean;
  v_service_role boolean :=
    coalesce(auth.role(), '') = 'service_role';
begin
  if not v_service_role and not public.is_admin() then
    raise exception 'Admin or service-role access required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id;

  if not found then
    return jsonb '[]';
  end if;

  v_is_scheduled :=
    v_booking.fulfillment_type in (
      'scheduled'::public.booking_fulfillment_type,
      'recurring'::public.booking_fulfillment_type
    );

  if v_is_scheduled then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'worker_id', v.worker_id,
        'worker_status', v.worker_status,
        'rating', v.rating,
        'total_completed_jobs', v.total_completed_jobs
      )
      order by
        case when v.worker_status = 'available' then 0 else 1 end,
        v.rating desc nulls last,
        v.total_completed_jobs desc nulls last,
        v.worker_id
    ), jsonb '[]')
    into v_result
    from (
      select
        wp.id as worker_id,
        wp.worker_status,
        wp.rating,
        wp.total_completed_jobs
      from public.worker_profiles wp
      join public.worker_services ws
        on ws.worker_id = wp.id
       and ws.service_id = v_booking.service_id
      where wp.is_verified = true
        and wp.worker_status <> 'suspended'::public.worker_status
        and (
          (
            exists (
              select 1
              from public.booking_schedule_occurrences o
              where o.booking_id = v_booking.id
            )
            and public.worker_can_cover_scheduled_booking(
              v_booking.id,
              wp.id
            )
          )
          or
          (
            not exists (
              select 1
              from public.booking_schedule_occurrences o
              where o.booking_id = v_booking.id
            )
            and public.worker_covers_booking_interval(
              v_booking.service_id,
              wp.id,
              v_booking.scheduled_start,
              v_booking.scheduled_end
            )
          )
        )
    ) v;
  else
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'worker_id', v.worker_id,
        'worker_status', v.worker_status,
        'rating', v.rating,
        'total_completed_jobs', v.total_completed_jobs,
        'distance_km', v.distance_km
      )
      order by
        v.distance_km asc,
        v.rating desc nulls last,
        v.total_completed_jobs desc nulls last,
        v.worker_id
    ), jsonb '[]')
    into v_result
    from (
      select
        wp.id as worker_id,
        wp.worker_status,
        wp.rating,
        wp.total_completed_jobs,
        st_distance(
          wl.location,
          coalesce(
            a.location,
            st_setsrid(
              st_makepoint(a.longitude, a.latitude),
              4326
            )::geography
          )
        ) / 1000.0 as distance_km
      from public.worker_services ws
      join public.worker_profiles wp
        on wp.id = ws.worker_id
      join public.worker_presence pr
        on pr.worker_id = wp.id
       and pr.is_available = true
       and pr.expires_at > now()
      join lateral (
        select wl.location
        from public.worker_locations wl
        where wl.worker_id = wp.id
          and wl.location is not null
          and wl.recorded_at >= now() - interval '10 minutes'
        order by wl.recorded_at desc
        limit 1
      ) wl on true
      join public.addresses a
        on a.id = v_booking.address_id
      where ws.service_id = v_booking.service_id
        and wp.is_verified = true
        and wp.worker_status = 'available'::public.worker_status
        and wp.service_radius_km is not null
        and wp.service_radius_km > 0
        and st_dwithin(
          wl.location,
          coalesce(
            a.location,
            st_setsrid(
              st_makepoint(a.longitude, a.latitude),
              4326
            )::geography
          ),
          least(wp.service_radius_km, 10) * 1000
        )
        and not exists (
          select 1
          from public.bookings b
          where b.worker_id = wp.id
            and b.id <> v_booking.id
            and b.status in (
              'assigned'::public.booking_status,
              'on_the_way'::public.booking_status,
              'arrived'::public.booking_status,
              'in_progress'::public.booking_status
            )
            and b.scheduled_start < v_booking.scheduled_end
            and b.scheduled_end > v_booking.scheduled_start
        )
    ) v;
  end if;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."get_eligible_workers"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_available_worker_slots"("p_service_id" "uuid", "p_address_id" "uuid", "p_duration_minutes" integer, "p_from" timestamp with time zone DEFAULT "now"(), "p_days" integer DEFAULT 3) RETURNS TABLE("slot_start" timestamp with time zone, "slot_end" timestamp with time zone, "worker_count" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
with authorized_address as (
  select a.id, a.location
  from public.addresses a
  where a.id = p_address_id
    and (a.user_id = (select auth.uid()) or (select public.is_admin()))
),
params as (
  select greatest(p_duration_minutes, 60) as duration_minutes,
         greatest(p_days, 1) as days
),
slots as (
  select generate_series(
    date_trunc('hour', greatest(p_from, now())),
    date_trunc('hour', greatest(p_from, now())) + make_interval(days => (select days from params)),
    interval '30 minutes'
  ) as slot_start
),
candidates as (
  select s.slot_start,
         s.slot_start + make_interval(mins => (select duration_minutes from params)) as slot_end,
         wp.id as worker_id
  from slots s
  cross join params
  join public.worker_profiles wp
    on wp.is_verified = true
   and wp.worker_status = 'available'::public.worker_status
  join public.worker_services ws
    on ws.worker_id = wp.id and ws.service_id = p_service_id
  cross join authorized_address aa
  where exists (
    select 1 from public.worker_availability wa
    where wa.worker_id = wp.id
      and wa.is_available = true
      and wa.available_from <= s.slot_start
      and wa.available_until >= s.slot_start + make_interval(mins => params.duration_minutes)
  )
  and not exists (
    select 1 from public.bookings b
    where b.worker_id = wp.id
      and b.status in ('assigned'::public.booking_status,'on_the_way'::public.booking_status,'arrived'::public.booking_status,'in_progress'::public.booking_status)
      and b.scheduled_start < s.slot_start + make_interval(mins => params.duration_minutes)
      and b.scheduled_end > s.slot_start
  )
  and (wp.current_location is null
       or aa.location is null
       or st_distance(wp.current_location, aa.location) <= coalesce(wp.service_radius_km,10) * 1000)
)
select slot_start, slot_end, count(distinct worker_id)::integer
from candidates
group by slot_start, slot_end
order by slot_start
limit 12;
$$;


ALTER FUNCTION "public"."get_next_available_worker_slots"("p_service_id" "uuid", "p_address_id" "uuid", "p_duration_minutes" integer, "p_from" timestamp with time zone, "p_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_recurring_booking_max_horizon_days"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_days integer;
begin
  select (value->>'value')::integer
  into v_days
  from public.platform_settings
  where key = 'booking.recurring_max_horizon_days'
    and is_active = true
  order by updated_at desc
  limit 1;

  if v_days is null or v_days < 1 then
    return 365;
  end if;

  return least(v_days, 3650);
exception
  when others then
    return 365;
end;
$$;


ALTER FUNCTION "public"."get_recurring_booking_max_horizon_days"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."guard_customer_deletion_approval"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF NEW.status = 'approved'
     AND EXISTS (
       SELECT 1
       FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.id = NEW.user_id
         AND p.role <> 'worker'::public.user_role
     ) THEN
    RAISE EXCEPTION
      'Non-worker account deletion must be completed through the admin-action Edge Function'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."guard_customer_deletion_approval"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_auth_user_deleted_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."handle_auth_user_deleted_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_worker_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Only worker signups create worker records. Customer/anonymous signups
  -- must never be converted into workers by the auth trigger.
  if coalesce(new.raw_user_meta_data->>'role', '') <> 'worker' then
    return new;
  end if;

  insert into public.profiles (id, full_name, phone, email, role, is_active)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'full_name', ''),
    nullif(new.raw_user_meta_data->>'phone', ''),
    new.email,
    'worker'::public.user_role,
    true
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    email = coalesce(excluded.email, public.profiles.email),
    role = 'worker'::public.user_role,
    updated_at = now();

  insert into public.worker_profiles (id, is_verified, worker_status)
  values (new.id, false, 'offline'::public.worker_status)
  on conflict (id) do nothing;

  if coalesce(new.raw_user_meta_data->>'onboarding_type', 'self_registered') = 'self_registered' then
    insert into public.worker_applications (worker_id, onboarding_type, status)
    values (new.id, 'self_registered', 'draft'::public.worker_application_status)
    on conflict (worker_id) do nothing;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_worker_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::public.user_role
      and p.is_active = true
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_booking_within_operating_hours"("p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_start_text text;
  v_end_text text;
  v_timezone text;
  v_start_time time;
  v_end_time time;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if p_start is null or p_end is null or p_end<=p_start then return false; end if;
  select value->>'value' into v_start_text from public.platform_settings where key='operations.default_start_time' and is_active=true order by updated_at desc limit 1;
  select value->>'value' into v_end_text from public.platform_settings where key='operations.default_end_time' and is_active=true order by updated_at desc limit 1;
  select value->>'value' into v_timezone from public.platform_settings where key='operations.timezone' and is_active=true order by updated_at desc limit 1;
  v_start_time:=coalesce(v_start_text,'08:00:00')::time;
  v_end_time:=coalesce(v_end_text,'22:00:00')::time;
  v_timezone:=coalesce(nullif(trim(v_timezone),''),'Asia/Kolkata');
  if v_start_time>=v_end_time then return false; end if;
  v_local_start:=p_start at time zone v_timezone;
  v_local_end:=p_end at time zone v_timezone;
  if v_local_start::date is distinct from v_local_end::date then return false; end if;
  return v_local_start::time>=v_start_time and v_local_end::time<=v_end_time and v_local_end::time>v_local_start::time;
end;
$$;


ALTER FUNCTION "public"."is_booking_within_operating_hours"("p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."issue_booking_invoice"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_booking public.bookings%rowtype;
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_number text;
  v_is_admin boolean := public.is_admin();
  v_expected_currency text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.customer_id IS DISTINCT FROM auth.uid()
     AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Booking access denied';
  END IF;

  IF v_booking.status NOT IN (
    'paid'::public.booking_status,
    'assigned'::public.booking_status,
    'on_the_way'::public.booking_status,
    'arrived'::public.booking_status,
    'in_progress'::public.booking_status,
    'completed'::public.booking_status
  ) THEN
    RAISE EXCEPTION 'Booking is not invoiceable';
  END IF;

  -- Customers can only create/retrieve a receipt after service completion.
  -- The admin operations workflow retains its existing ability to issue earlier.
  IF NOT v_is_admin
     AND v_booking.status <> 'completed'::public.booking_status THEN
    RAISE EXCEPTION 'A payment receipt is available only for completed bookings';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE booking_id = v_booking.id
    AND status IN (
      'paid'::public.payment_status,
      'partially_refunded'::public.payment_status,
      'refunded'::public.payment_status
    )
  ORDER BY
    CASE WHEN status = 'paid'::public.payment_status THEN 0 ELSE 1 END,
    paid_at DESC NULLS LAST,
    updated_at DESC,
    id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No successful payment was found for this booking';
  END IF;

  IF v_payment.amount IS DISTINCT FROM v_booking.total_amount THEN
    RAISE EXCEPTION 'Payment amount does not match the booking total';
  END IF;

  v_expected_currency := upper(trim(coalesce(
    v_booking.pricing_snapshot->>'currency',
    'INR'
  )));

  IF upper(trim(v_payment.currency)) IS DISTINCT FROM v_expected_currency THEN
    RAISE EXCEPTION 'Payment currency does not match the booking currency';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE booking_id = v_booking.id
  ) THEN
    SELECT *
    INTO v_invoice
    FROM public.invoices
    WHERE booking_id = v_booking.id;

    RETURN jsonb_build_object(
      'success', true,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'total_amount', v_invoice.total_amount,
      'status', v_invoice.status,
      'idempotent', true
    );
  END IF;

  v_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(v_booking.id::text, '-', ''), 1, 10));

  INSERT INTO public.invoices (
    booking_id,
    invoice_number,
    currency,
    base_amount,
    platform_fee,
    tax_amount,
    total_amount,
    pricing_snapshot
  )
  VALUES (
    v_booking.id,
    v_number,
    v_payment.currency,
    v_booking.base_amount,
    v_booking.platform_fee,
    v_booking.tax_amount,
    v_booking.total_amount,
    coalesce(v_booking.pricing_snapshot, '{}'::jsonb)
  )
  RETURNING * INTO v_invoice;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'total_amount', v_invoice.total_amount,
    'status', v_invoice.status,
    'idempotent', false
  );
END;
$$;


ALTER FUNCTION "public"."issue_booking_invoice"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_updated boolean := false;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  update public.notifications
  set is_read = true
  where id = p_notification_id
    and user_id = v_user_id
    and is_read = false
  returning true into v_updated;

  if not found then
    if exists (select 1 from public.notifications where id=p_notification_id and user_id=v_user_id and is_read=true) then
      return jsonb_build_object('success',true,'notification_id',p_notification_id,'is_read',true,'changed',false);
    end if;
    raise exception 'Notification not found';
  end if;

  return jsonb_build_object('success',true,'notification_id',p_notification_id,'is_read',true,'changed',true);
end;
$$;


ALTER FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."modify_customer_booking"("p_booking_id" "uuid", "p_scheduled_start" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_duration_hours" numeric DEFAULT NULL::numeric, "p_address_id" "uuid" DEFAULT NULL::"uuid", "p_notes" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid:=auth.uid();
  v_booking public.bookings%rowtype;
  v_variant public.service_variants%rowtype;
  v_address public.addresses%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_hours numeric;
  v_price jsonb;
  v_new_total numeric;
  v_timezone text:='Asia/Kolkata';
  v_local_date date;
  v_tomorrow date;
begin
  if v_customer_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id=p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.customer_id<>v_customer_id then
    raise exception 'Booking access denied';
  end if;

  if v_booking.fulfillment_type='recurring'::public.booking_fulfillment_type then
    raise exception 'Recurring bookings require the recurring schedule/occurrence modification flow';
  end if;

  if v_booking.worker_id is not null
     or v_booking.status not in (
       'pending_payment'::public.booking_status,
       'paid'::public.booking_status,
       'searching_worker'::public.booking_status
     ) then
    raise exception 'Booking can only be modified before worker assignment';
  end if;

  select *
  into v_variant
  from public.service_variants
  where id=v_booking.service_variant_id
    and is_active=true;

  if not found then
    raise exception 'Service package is not available';
  end if;

  v_start:=coalesce(p_scheduled_start,v_booking.scheduled_start);

  if v_booking.fulfillment_type='scheduled'::public.booking_fulfillment_type then
    select coalesce(
      nullif(trim(value->>'value'),''),
      'Asia/Kolkata'
    )
    into v_timezone
    from public.platform_settings
    where key='operations.timezone'
      and is_active=true
    order by updated_at desc
    limit 1;

    v_timezone:=coalesce(v_timezone,'Asia/Kolkata');
    v_local_date:=(v_start at time zone v_timezone)::date;
    v_tomorrow:=(now() at time zone v_timezone)::date+1;

    if v_local_date<v_tomorrow then
      raise exception 'Scheduled booking must start tomorrow or later';
    end if;
  end if;

  if v_start<=now() then
    raise exception 'Booking time must be in the future';
  end if;

  v_hours:=coalesce(
    p_duration_hours,
    round(
      extract(epoch from (
        v_booking.scheduled_end-v_booking.scheduled_start
      ))/3600.0,
      2
    )
  );

  if v_hours<1 then
    raise exception 'Booking duration must be at least 1 hour';
  end if;

  if lower(coalesce(v_variant.billing_type,'hourly'))<>'hourly'
     and p_duration_hours is not null then
    raise exception 'Duration can only be changed for hourly service packages';
  end if;

  v_end:=v_start+
    make_interval(
      secs=>round(v_hours*3600)::integer
    );

  select *
  into v_address
  from public.addresses
  where id=coalesce(p_address_id,v_booking.address_id)
    and user_id=v_customer_id
    and latitude is not null
    and longitude is not null;

  if not found then
    raise exception 'Valid customer address is required';
  end if;

  if not exists (
    select 1
    from public.service_areas sa
    where sa.is_active=true
      and (
        sa.service_id=v_booking.service_id
        or sa.service_id is null
      )
      and public.st_dwithin(
        public.st_setsrid(
          public.st_makepoint(
            sa.center_longitude,
            sa.center_latitude
          ),
          4326
        )::public.geography,
        coalesce(
          v_address.location,
          public.st_setsrid(
            public.st_makepoint(
              v_address.longitude,
              v_address.latitude
            ),
            4326
          )::public.geography
        ),
        sa.radius_km*1000
      )
  ) then
    raise exception 'This service is not available at the selected booking location';
  end if;

  if v_booking.fulfillment_type='scheduled'::public.booking_fulfillment_type
     and not public.is_booking_within_operating_hours(v_start,v_end) then
    raise exception 'Booking time is outside configured operating hours';
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.customer_id=v_customer_id
      and b.id<>v_booking.id
      and b.status not in (
        'cancelled'::public.booking_status,
        'expired'::public.booking_status,
        'payment_failed'::public.booking_status
      )
      and b.scheduled_start<v_end
      and b.scheduled_end>v_start
  ) then
    raise exception 'Modified time overlaps an existing booking';
  end if;

  v_price:=public.calculate_service_booking_price(
    v_booking.service_variant_id,
    v_hours
  );

  v_new_total:=round(
    (v_price->>'final_amount')::numeric,
    2
  );

  if v_booking.status='paid'
     and v_new_total<>round(v_booking.total_amount,2) then
    return jsonb_build_object(
      'success',false,
      'requires_payment_adjustment',true,
      'booking_id',p_booking_id,
      'current_total',v_booking.total_amount,
      'new_total',v_new_total,
      'pricing',v_price
    );
  end if;

  update public.booking_worker_offers
  set
    status='cancelled',
    responded_at=coalesce(responded_at,now()),
    updated_at=now()
  where booking_id=v_booking.id
    and status='pending';

  update public.bookings
  set
    scheduled_start=v_start,
    scheduled_end=v_end,
    duration_value=ceil(v_hours)::integer,
    duration_unit='hour',
    address_id=coalesce(p_address_id,v_booking.address_id),
    base_amount=v_new_total,
    platform_fee=0,
    tax_amount=0,
    total_amount=v_new_total,
    notes=coalesce(nullif(trim(p_notes),''),notes),
    pricing_snapshot=v_price,
    updated_at=now()
  where id=v_booking.id;

  return jsonb_build_object(
    'success',true,
    'booking_id',v_booking.id,
    'status',v_booking.status,
    'scheduled_start',v_start,
    'scheduled_end',v_end,
    'total_amount',v_new_total,
    'pricing_snapshot',v_price
  );
end;
$$;


ALTER FUNCTION "public"."modify_customer_booking"("p_booking_id" "uuid", "p_scheduled_start" timestamp with time zone, "p_duration_hours" numeric, "p_address_id" "uuid", "p_notes" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."modify_customer_booking_occurrence"("p_occurrence_id" "uuid", "p_new_date" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid:=auth.uid();
  v_occ public.booking_schedule_occurrences%rowtype;
  v_booking public.bookings%rowtype;
  v_timezone text:='Asia/Kolkata';
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_hours numeric(12,2);
  v_old_start timestamptz;
  v_old_end timestamptz;
  v_old_date date;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if p_occurrence_id is null or p_new_date is null then raise exception 'Occurrence and new date are required'; end if;
  select * into v_occ from public.booking_schedule_occurrences where id=p_occurrence_id for update;
  if not found then raise exception 'Occurrence not found'; end if;
  select * into v_booking from public.bookings where id=v_occ.booking_id for update;
  if not found then raise exception 'Parent booking not found'; end if;
  if v_booking.customer_id<>v_customer_id then raise exception 'Booking access denied'; end if;

  if v_booking.fulfillment_type <> 'recurring'::public.booking_fulfillment_type then
    raise exception 'Only recurring booking occurrences can be modified';
  end if;

  if v_booking.worker_id is not null then
    raise exception 'Assigned recurring bookings cannot be modified by the customer';
  end if;

  if v_occ.status<>'scheduled' or v_occ.worker_id is not null then
 raise exception 'Only unassigned scheduled occurrences can be modified'; end if;
  if v_occ.scheduled_start-now()<interval '48 hours' then raise exception 'Recurring occurrence can only be modified at least 48 hours before its scheduled start'; end if;
  if p_new_date=v_occ.occurrence_date then return jsonb_build_object('success',true,'changed',false,'occurrence_id',v_occ.id,'booking_id',v_booking.id,'occurrence_date',v_occ.occurrence_date,'scheduled_start',v_occ.scheduled_start,'scheduled_end',v_occ.scheduled_end); end if;
  select coalesce(nullif(trim(value->>'value'),''),'Asia/Kolkata') into v_timezone from public.platform_settings where key='operations.timezone' and is_active=true order by updated_at desc limit 1;
  if p_new_date<v_booking.schedule_start_date or p_new_date>v_booking.schedule_end_date then raise exception 'New occurrence date must remain inside the recurring schedule range'; end if;
  if not (extract(dow from p_new_date)::smallint=any(v_booking.selected_weekdays)) then raise exception 'New occurrence date must match the recurring schedule weekday selection'; end if;
  if v_booking.off_dates is not null and p_new_date=any(v_booking.off_dates) then raise exception 'New occurrence date cannot be an off date'; end if;
  v_new_start:=(p_new_date::text||' '||v_booking.daily_start_time::text||' '||v_timezone)::timestamptz;
  v_new_end:=(p_new_date::text||' '||v_booking.daily_end_time::text||' '||v_timezone)::timestamptz;
  if v_new_start<=now() then raise exception 'New occurrence date must be in the future'; end if;
  if not public.is_booking_within_operating_hours(v_new_start,v_new_end) then raise exception 'New occurrence time is outside configured operating hours'; end if;
  if exists(select 1 from public.booking_schedule_occurrences o where o.booking_id=v_booking.id and o.id<>v_occ.id and o.occurrence_date=p_new_date) then raise exception 'Another occurrence already exists on the selected date'; end if;
  if exists(select 1 from public.bookings b where b.customer_id=v_customer_id and b.id<>v_booking.id and b.status not in ('cancelled','expired','payment_failed') and b.scheduled_start<v_new_end and b.scheduled_end>v_new_start) then raise exception 'New occurrence time overlaps another booking'; end if;
  v_old_date:=v_occ.occurrence_date; v_old_start:=v_occ.scheduled_start; v_old_end:=v_occ.scheduled_end;
  v_hours:=round(extract(epoch from (v_occ.scheduled_end-v_occ.scheduled_start))/3600.0,2);
  if v_hours<1 then raise exception 'Occurrence duration must be at least 1 hour'; end if;
  update public.booking_schedule_occurrences set original_occurrence_date=coalesce(original_occurrence_date,occurrence_date),occurrence_date=p_new_date,scheduled_start=v_new_start,scheduled_end=v_new_end,last_modified_at=now(),last_modified_by=v_customer_id,updated_at=now() where id=v_occ.id;
  update public.bookings b set scheduled_start=(select min(o.scheduled_start) from public.booking_schedule_occurrences o where o.booking_id=b.id and o.status<>'cancelled'),scheduled_end=(select max(o.scheduled_end) from public.booking_schedule_occurrences o where o.booking_id=b.id and o.status<>'cancelled'),updated_at=now() where b.id=v_booking.id;
  return jsonb_build_object('success',true,'changed',true,'occurrence_id',v_occ.id,'booking_id',v_booking.id,'old_date',v_old_date,'new_date',p_new_date,'old_scheduled_start',v_old_start,'old_scheduled_end',v_old_end,'scheduled_start',v_new_start,'scheduled_end',v_new_end,'duration_hours',v_hours,'price_unchanged',true,'modification_deadline_met',true,'timezone',v_timezone);
end;
$$;


ALTER FUNCTION "public"."modify_customer_booking_occurrence"("p_occurrence_id" "uuid", "p_new_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalize_account_phone"("p_phone" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE STRICT
    SET "search_path" TO ''
    AS $$
  select regexp_replace(btrim(p_phone), '[^0-9]', '', 'g');
$$;


ALTER FUNCTION "public"."normalize_account_phone"("p_phone" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_worker_booking_offer"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.notifications (
    user_id,
    booking_id,
    title,
    message,
    notification_type,
    is_read
  )
  values (
    new.worker_id,
    new.booking_id,
    'New TempStaff booking offer',
    'You have a new booking offer. Open the Worker App to respond.',
    'booking_offer',
    false
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."notify_worker_booking_offer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_worker_of_booking_offer"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_booking public.bookings%rowtype;
  v_occ public.booking_schedule_occurrences%rowtype;
  v_start timestamptz;
  v_title text := 'New booking offer';
  v_message text := 'A new KvikStaff booking is available. Review the offer and accept or decline it.';
BEGIN
  IF NEW.status = 'pending' THEN
    SELECT * INTO v_booking
    FROM public.bookings
    WHERE id = NEW.booking_id;

    IF NEW.occurrence_id IS NOT NULL THEN
      SELECT * INTO v_occ
      FROM public.booking_schedule_occurrences
      WHERE id = NEW.occurrence_id
        AND booking_id = NEW.booking_id;
      IF FOUND THEN
        v_start := v_occ.scheduled_start;
      END IF;
    ELSIF v_booking.fulfillment_type = 'scheduled'::public.booking_fulfillment_type THEN
      v_start := v_booking.scheduled_start;
    END IF;

    IF v_booking.fulfillment_type IN (
      'scheduled'::public.booking_fulfillment_type,
      'recurring'::public.booking_fulfillment_type
    ) AND v_start IS NOT NULL THEN
      v_title := 'Scheduled job offer';
      v_message := format(
        'A job is scheduled for %s IST. Open KvikStaff to review and respond.',
        to_char(v_start AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM')
      );
    END IF;

    INSERT INTO public.notifications (
      user_id,
      booking_id,
      booking_worker_offer_id,
      title,
      message,
      notification_type,
      is_read,
      created_at
    ) VALUES (
      NEW.worker_id,
      NEW.booking_id,
      NEW.id,
      v_title,
      v_message,
      'booking_offer',
      false,
      now()
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."notify_worker_of_booking_offer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prepare_customer_account_deletion"("p_request_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_request public.account_deletion_requests%ROWTYPE;
  v_role public.user_role;
  v_auth_user_id uuid;
  v_profile_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
  INTO v_request
  FROM public.account_deletion_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found';
  END IF;

  -- Once preparation committed, all PII scrubbing and FK rekeying committed atomically.
  -- Retry returns the original Auth ID and pseudonymous profile ID without repeating work.
  IF v_request.status = 'processing' THEN
    IF v_request.auth_user_id IS NULL THEN
      RAISE EXCEPTION 'Processing request is missing its Auth retry identifier';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_request.user_id
        AND p.role = 'customer'::public.user_role
        AND p.is_active = false
        AND p.full_name = 'Deleted customer'
        AND p.company_name = 'Deleted customer'
        AND p.email IS NULL
        AND p.phone IS NULL
        AND p.avatar_url IS NULL
    ) THEN
      RAISE EXCEPTION 'Pseudonymous customer profile is missing or not fully scrubbed';
    END IF;

    RETURN jsonb_build_object(
      'requires_erasure', true,
      'auth_user_id', v_request.auth_user_id,
      'profile_id', v_request.user_id,
      'status', 'processing'
    );
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Deletion request is no longer pending or processing';
  END IF;

  v_auth_user_id := v_request.user_id;

  SELECT p.role
  INTO v_role
  FROM public.profiles p
  WHERE p.id = v_auth_user_id
  FOR UPDATE;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account profile not found';
  END IF;

  -- Preserve the existing worker account deactivation workflow, but never route an
  -- administrator account through the legacy profile-deactivation-only RPC.
  IF v_role = 'worker'::public.user_role THEN
    RETURN jsonb_build_object(
      'requires_erasure', false,
      'role', v_role::text,
      'status', v_request.status
    );
  END IF;

  IF v_role <> 'customer'::public.user_role THEN
    RAISE EXCEPTION 'Only customer accounts can use the account-erasure workflow'
      USING ERRCODE = '42501';
  END IF;

  -- Never erase a customer account while a current/future service remains active.
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.customer_id = v_auth_user_id
      AND b.status IN (
        'pending_payment'::public.booking_status,
        'paid'::public.booking_status,
        'searching_worker'::public.booking_status,
        'assigned'::public.booking_status,
        'on_the_way'::public.booking_status,
        'arrived'::public.booking_status,
        'in_progress'::public.booking_status
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.booking_schedule_occurrences o
    JOIN public.bookings b ON b.id = o.booking_id
    WHERE b.customer_id = v_auth_user_id
      AND o.status IN ('scheduled', 'assigned', 'on_the_way', 'arrived', 'in_progress')
  ) THEN
    RAISE EXCEPTION
      'Customer has active bookings or service occurrences; resolve them before deletion'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.addresses a
    JOIN public.bookings b ON b.address_id = a.id
    WHERE a.user_id = v_auth_user_id
      AND b.customer_id <> v_auth_user_id
  ) THEN
    RAISE EXCEPTION
      'A saved address is referenced by another customer booking; manual review is required'
      USING ERRCODE = '55000';
  END IF;

  v_profile_id := gen_random_uuid();

  INSERT INTO public.profiles (
    id, full_name, phone, email, role, avatar_url, is_active,
    created_at, updated_at, company_name
  ) VALUES (
    v_profile_id, 'Deleted customer', NULL, NULL, 'customer'::public.user_role,
    NULL, false, now(), now(), 'Deleted customer'
  );

  -- Deactivate and scrub the original profile. Its email is cleared automatically when
  -- that old profile is removed by the Auth-delete trigger after FK references are rekeyed.
  UPDATE public.profiles
  SET full_name = 'Deleted customer',
      phone = NULL,
      avatar_url = NULL,
      company_name = 'Deleted customer',
      is_active = false,
      updated_at = now()
  WHERE id = v_auth_user_id;

  -- Preserve address rows only when required by historic bookings; remove their location.
  UPDATE public.addresses a
  SET user_id = v_profile_id,
      label = NULL,
      address_line = 'Address removed following account deletion',
      latitude = 0,
      longitude = 0,
      location = public.ST_SetSRID(public.ST_MakePoint(0, 0), 4326)::public.geography
  WHERE a.user_id = v_auth_user_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.address_id = a.id AND b.customer_id = v_auth_user_id
    );

  DELETE FROM public.addresses a
  WHERE a.user_id = v_auth_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.address_id = a.id
    );

  DELETE FROM public.customer_favourite_services WHERE customer_id = v_auth_user_id;
  DELETE FROM public.notifications WHERE user_id = v_auth_user_id;
  DELETE FROM public.push_tokens WHERE user_id = v_auth_user_id;
  DELETE FROM public.worker_push_deliveries WHERE user_id = v_auth_user_id;
  DELETE FROM public.message_read_receipts WHERE user_id = v_auth_user_id;
  DELETE FROM public.messages WHERE sender_id = v_auth_user_id;
  DELETE FROM public.idempotency_keys WHERE user_id = v_auth_user_id;
  DELETE FROM public.service_availability_requests WHERE customer_id = v_auth_user_id;

  DELETE FROM public.worker_locations wl
  WHERE wl.booking_id IN (
    SELECT b.id FROM public.bookings b WHERE b.customer_id = v_auth_user_id
  );

  DELETE FROM public.booking_otps bo
  WHERE bo.booking_id IN (
    SELECT b.id FROM public.bookings b WHERE b.customer_id = v_auth_user_id
  )
  OR bo.occurrence_id IN (
    SELECT o.id
    FROM public.booking_schedule_occurrences o
    JOIN public.bookings b ON b.id = o.booking_id
    WHERE b.customer_id = v_auth_user_id
  );

  DELETE FROM public.conversations c
  WHERE c.customer_id = v_auth_user_id
     OR EXISTS (
       SELECT 1 FROM public.bookings b
       WHERE b.id = c.booking_id AND b.customer_id = v_auth_user_id
     );

  UPDATE public.bookings
  SET notes = NULL,
      pricing_snapshot = CASE
        WHEN pricing_snapshot IS NULL THEN NULL
        ELSE public.redact_customer_pii_jsonb(pricing_snapshot)
      END,
      updated_at = now()
  WHERE customer_id = v_auth_user_id;

  UPDATE public.booking_schedule_occurrences o
  SET pricing_snapshot = public.redact_customer_pii_jsonb(o.pricing_snapshot),
      updated_at = now()
  WHERE EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = o.booking_id AND b.customer_id = v_auth_user_id
  );

  UPDATE public.invoices i
  SET pricing_snapshot = public.redact_customer_pii_jsonb(i.pricing_snapshot)
  WHERE EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = i.booking_id AND b.customer_id = v_auth_user_id
  );

  UPDATE public.reviews r
  SET customer_id = CASE WHEN r.customer_id = v_auth_user_id THEN v_profile_id ELSE r.customer_id END,
      moderated_by = CASE WHEN r.moderated_by = v_auth_user_id THEN v_profile_id ELSE r.moderated_by END,
      comment = CASE WHEN r.customer_id = v_auth_user_id THEN NULL ELSE r.comment END,
      moderation_reason = CASE WHEN r.customer_id = v_auth_user_id THEN NULL ELSE r.moderation_reason END
  WHERE r.customer_id = v_auth_user_id OR r.moderated_by = v_auth_user_id;

  UPDATE public.support_tickets
  SET user_id = v_profile_id,
      subject = 'Content removed following account deletion',
      description = 'Content removed following account deletion',
      admin_notes = NULL,
      updated_at = now()
  WHERE user_id = v_auth_user_id;

  UPDATE public.worker_booking_incidents i
  SET description = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = i.booking_id AND b.customer_id = v_auth_user_id
        ) THEN 'Content removed following account deletion'
        ELSE i.description
      END,
      admin_notes = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = i.booking_id AND b.customer_id = v_auth_user_id
        ) THEN NULL
        ELSE i.admin_notes
      END,
      resolved_by = CASE WHEN i.resolved_by = v_auth_user_id THEN v_profile_id ELSE i.resolved_by END,
      updated_at = now()
  WHERE i.resolved_by = v_auth_user_id
     OR EXISTS (
       SELECT 1 FROM public.bookings b
       WHERE b.id = i.booking_id AND b.customer_id = v_auth_user_id
     );

  UPDATE public.worker_booking_change_requests cr
  SET reason = 'Content removed following account deletion',
      admin_notes = NULL,
      updated_at = now()
  WHERE EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = cr.booking_id AND b.customer_id = v_auth_user_id
  );

  UPDATE public.refund_requests rr
  SET reason = NULL,
      updated_at = now()
  WHERE rr.booking_id IN (
    SELECT b.id FROM public.bookings b WHERE b.customer_id = v_auth_user_id
  );

  UPDATE public.payment_refunds pr
  SET requested_by = CASE WHEN pr.requested_by = v_auth_user_id THEN v_profile_id ELSE pr.requested_by END,
      reason = NULL,
      failure_reason = NULL,
      updated_at = now()
  WHERE pr.requested_by = v_auth_user_id
     OR pr.booking_id IN (
       SELECT b.id FROM public.bookings b WHERE b.customer_id = v_auth_user_id
     );

  UPDATE public.payment_webhook_events e
  SET payload = public.redact_customer_pii_jsonb(e.payload),
      error_message = CASE
        WHEN e.error_message IS NULL THEN NULL
        ELSE 'Details redacted following account deletion'
      END,
      updated_at = now()
  WHERE EXISTS (
    SELECT 1
    FROM public.payments p
    JOIN public.bookings b ON b.id = p.booking_id
    WHERE b.customer_id = v_auth_user_id
      AND (
        (p.provider_order_id IS NOT NULL
          AND e.payload::text LIKE '%' || p.provider_order_id || '%')
        OR (p.provider_payment_id IS NOT NULL
          AND e.payload::text LIKE '%' || p.provider_payment_id || '%')
      )
  );

  -- Remove historical request reasons and old user IDs from prior audit snapshots.
  UPDATE public.admin_audit_logs al
  SET before_data = CASE
        WHEN jsonb_typeof(al.before_data) = 'object'
          THEN public.redact_customer_pii_jsonb(al.before_data) - 'id'
        ELSE al.before_data
      END,
      after_data = CASE
        WHEN jsonb_typeof(al.after_data) = 'object'
          THEN public.redact_customer_pii_jsonb(al.after_data) - 'id'
        ELSE al.after_data
      END,
      metadata = public.redact_customer_pii_jsonb(al.metadata)
  WHERE al.entity_type = 'account_deletion_request'
    AND al.entity_id IN (
      SELECT r.id FROM public.account_deletion_requests r WHERE r.user_id = v_auth_user_id
    );

  -- Keep any legacy audit actor references valid when the original profile is removed.
  UPDATE public.admin_audit_logs
  SET admin_id = v_profile_id
  WHERE admin_id = v_auth_user_id;

  -- Move profile-oriented audit entries to the pseudonymous profile and redact snapshots.
  UPDATE public.admin_audit_logs al
  SET entity_id = v_profile_id,
      before_data = CASE
        WHEN jsonb_typeof(al.before_data) = 'object'
          THEN public.redact_customer_pii_jsonb(al.before_data) - 'id'
        ELSE al.before_data
      END,
      after_data = CASE
        WHEN jsonb_typeof(al.after_data) = 'object'
          THEN public.redact_customer_pii_jsonb(al.after_data) - 'id'
        ELSE al.after_data
      END,
      metadata = public.redact_customer_pii_jsonb(al.metadata)
  WHERE al.entity_id = v_auth_user_id;

  -- Rekey all direct FK references before deleting the original Auth-backed profile.
  UPDATE public.booking_status_history
  SET changed_by = v_profile_id
  WHERE changed_by = v_auth_user_id;

  UPDATE public.booking_schedule_occurrences
  SET last_modified_by = v_profile_id
  WHERE last_modified_by = v_auth_user_id;

  UPDATE public.bookings
  SET customer_id = CASE WHEN customer_id = v_auth_user_id THEN v_profile_id ELSE customer_id END,
      journey_started_by = CASE WHEN journey_started_by = v_auth_user_id THEN v_profile_id ELSE journey_started_by END,
      started_by = CASE WHEN started_by = v_auth_user_id THEN v_profile_id ELSE started_by END,
      updated_at = now()
  WHERE customer_id = v_auth_user_id
     OR journey_started_by = v_auth_user_id
     OR started_by = v_auth_user_id;

  UPDATE public.account_deletion_requests
  SET user_id = v_profile_id,
      auth_user_id = CASE WHEN id = p_request_id THEN v_auth_user_id ELSE NULL END,
      reason = NULL,
      status = CASE WHEN id = p_request_id THEN 'processing' ELSE status END,
      reviewed_at = CASE WHEN id = p_request_id THEN COALESCE(reviewed_at, now()) ELSE reviewed_at END,
      reviewed_by = CASE WHEN id = p_request_id THEN COALESCE(reviewed_by, auth.uid()) ELSE reviewed_by END
  WHERE user_id = v_auth_user_id;

  PERFORM public.write_admin_audit(
    'prepare_account_deletion',
    'account_deletion_request',
    p_request_id,
    jsonb_build_object('status', v_request.status),
    jsonb_build_object(
      'status', 'processing',
      'identity_fields_scrubbed', true,
      'profile_rekeyed', true,
      'prior_request_reasons_redacted', true
    )
  );

  RETURN jsonb_build_object(
    'requires_erasure', true,
    'auth_user_id', v_auth_user_id,
    'profile_id', v_profile_id,
    'status', 'processing'
  );
END;
$$;


ALTER FUNCTION "public"."prepare_customer_account_deletion"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_admin_audit_mutation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  raise exception 'admin_audit_logs is append-only';
end;
$$;


ALTER FUNCTION "public"."prevent_admin_audit_mutation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_worker_role_demotion_with_profile"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.role is distinct from old.role
     and new.role <> 'worker'::public.user_role
     and exists (select 1 from public.worker_profiles wp where wp.id = new.id) then
    raise exception 'Remove the worker profile before changing this account from worker role';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_worker_role_demotion_with_profile"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_razorpay_webhook_event"("p_event_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_event public.payment_webhook_events%rowtype;
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_entity jsonb;
  v_order_id text;
  v_provider_payment_id text;
  v_amount numeric;
  v_currency text;
  v_result jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Service role required'; end if;
  if p_event_id is null then raise exception 'Webhook event ID is required'; end if;
  select * into v_event from public.payment_webhook_events where id=p_event_id for update;
  if not found then raise exception 'Webhook event not found'; end if;
  if v_event.provider<>'razorpay' then raise exception 'Unsupported payment provider'; end if;
  if v_event.signature_verified is not true then raise exception 'Webhook signature was not verified'; end if;
  if v_event.status='processed' then
    return jsonb_build_object('success',true,'already_processed',true,'event_id',v_event.id,'event_name',v_event.event_name);
  end if;
  if v_event.status='failed' then
    return jsonb_build_object('success',false,'already_failed',true,'event_id',v_event.id,'event_name',v_event.event_name,'error',v_event.error_message);
  end if;

  v_entity := v_event.payload #> '{payload,payment,entity}';
  if v_entity is null or jsonb_typeof(v_entity)<>'object' then
    update public.payment_webhook_events set status='failed',error_message='Webhook payment entity is missing',updated_at=now() where id=v_event.id;
    raise exception 'Webhook payment entity is missing';
  end if;

  v_order_id := nullif(trim(v_entity->>'order_id'),'');
  v_provider_payment_id := nullif(trim(v_entity->>'id'),'');
  v_currency := upper(nullif(trim(v_entity->>'currency'),''));
  v_amount := case when (v_entity->>'amount') ~ '^[0-9]+(\\.[0-9]+)?$' then (v_entity->>'amount')::numeric/100 else null end;

  if v_event.event_name='payment.captured' then
    if v_order_id is null or v_provider_payment_id is null then
      update public.payment_webhook_events set status='failed',error_message='Captured payment is missing order/payment ID',updated_at=now() where id=v_event.id;
      raise exception 'Captured payment is missing order/payment ID';
    end if;
    if v_currency is distinct from 'INR' or v_amount is null or v_amount<=0 then
      update public.payment_webhook_events set status='failed',error_message='Captured payment currency or amount is invalid',updated_at=now() where id=v_event.id;
      raise exception 'Captured payment currency or amount is invalid';
    end if;
    select * into v_payment from public.payments where provider='razorpay' and provider_order_id=v_order_id for update;
    if not found then
      update public.payment_webhook_events set status='failed',error_message='No payment record matches the Razorpay order',updated_at=now() where id=v_event.id;
      raise exception 'No payment record matches the Razorpay order';
    end if;
    if v_amount <> v_payment.amount or v_payment.currency<>v_currency then
      update public.payment_webhook_events set status='failed',error_message='Webhook payment amount/currency does not match payment record',updated_at=now() where id=v_event.id;
      raise exception 'Webhook payment amount/currency does not match payment record';
    end if;
    v_result:=public.finalize_razorpay_payment(v_payment.id,v_provider_payment_id,now());
  elsif v_event.event_name='payment.failed' then
    if v_order_id is null then
      update public.payment_webhook_events set status='failed',error_message='Failed payment is missing order ID',updated_at=now() where id=v_event.id;
      raise exception 'Failed payment is missing order ID';
    end if;
    select * into v_payment from public.payments where provider='razorpay' and provider_order_id=v_order_id for update;
    if not found then
      update public.payment_webhook_events set status='failed',error_message='No payment record matches the Razorpay order',updated_at=now() where id=v_event.id;
      raise exception 'No payment record matches the Razorpay order';
    end if;
    select * into v_booking from public.bookings where id=v_payment.booking_id for update;
    if v_payment.status='pending'::public.payment_status then
      update public.payments set provider_payment_id=coalesce(v_provider_payment_id,provider_payment_id),status='failed'::public.payment_status,updated_at=now() where id=v_payment.id;
      if v_booking.status='pending_payment'::public.booking_status then
        update public.bookings set status='payment_failed'::public.booking_status,updated_at=now() where id=v_booking.id;
        insert into public.booking_status_history(booking_id,old_status,new_status,changed_by,created_at) values(v_booking.id,'pending_payment'::public.booking_status,'payment_failed'::public.booking_status,null,now());
      end if;
    end if;
    v_result:=jsonb_build_object('success',true,'payment_failed',true,'payment_id',v_payment.id,'booking_id',v_booking.id);
  else
    update public.payment_webhook_events set status='failed',error_message='Unsupported Razorpay event type: '||v_event.event_name,updated_at=now() where id=v_event.id;
    raise exception 'Unsupported Razorpay event type: %',v_event.event_name;
  end if;

  update public.payment_webhook_events set status='processed',processed_at=now(),error_message=null,updated_at=now() where id=v_event.id;
  return jsonb_build_object('success',true,'event_id',v_event.id,'event_name',v_event.event_name,'result',coalesce(v_result,'{}'::jsonb));
exception when others then
  update public.payment_webhook_events set status='failed',error_message=left(sqlerrm,1000),updated_at=now() where id=p_event_id and status='received';
  raise;
end;
$_$;


ALTER FUNCTION "public"."process_razorpay_webhook_event"("p_event_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_privileged_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    new.email := (select u.email from auth.users u where u.id = new.id);
    return new;
  end if;

  if auth.uid() is null then
    if exists (
      select 1
      from auth.users u
      where u.id = new.id
        and u.email is not distinct from new.email
    ) then
      return new;
    end if;

    if exists (
      select 1
      from auth.users u
      where u.id = new.id
        and u.raw_user_meta_data->>'role' = 'worker'
    ) then
      return new;
    end if;

    raise exception 'Profile changes must originate from an authenticated account';
  end if;

  if tg_op = 'INSERT' then
    if new.id <> auth.uid() then
      raise exception 'You may only create your own profile';
    end if;
    new.role := 'customer'::public.user_role;
    new.is_active := true;
    new.email := (select u.email from auth.users u where u.id = new.id);
    return new;
  end if;

  if new.id <> old.id then
    raise exception 'Profile id cannot be changed';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Role cannot be changed by the account owner';
  end if;

  if new.is_active is distinct from old.is_active then
    raise exception 'Account status cannot be changed by the account owner';
  end if;

  new.email := (select u.email from auth.users u where u.id = new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_profile_privileged_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_worker_earnings_immutability"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Worker earnings are immutable';
  end if;
  if new.worker_id is distinct from old.worker_id
     or new.booking_id is distinct from old.booking_id
     or new.gross_amount is distinct from old.gross_amount
     or new.platform_fee is distinct from old.platform_fee
     or new.net_amount is distinct from old.net_amount then
    raise exception 'Worker earnings financial fields are immutable';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_worker_earnings_immutability"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_worker_profile_operational_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'Worker profile id cannot be changed';
  end if;

  if new.created_at is distinct from old.created_at then
    raise exception 'Worker profile creation time cannot be changed';
  end if;

  if new.service_radius_km is distinct from old.service_radius_km then
    raise exception 'Worker service radius is managed by TempStaff administrators';
  end if;

  if new.is_featured is distinct from old.is_featured then
    raise exception 'Worker featured status is managed by TempStaff administrators';
  end if;

  if new.current_location is distinct from old.current_location
     and coalesce(current_setting('app.worker_profile_internal_mutation', true), '') <> 'location' then
    raise exception 'Worker location must be updated through the location API';
  end if;

  if new.worker_status is distinct from old.worker_status
     and coalesce(current_setting('app.worker_profile_internal_mutation', true), '') <> 'presence' then
    raise exception 'Worker status is managed by TempStaff workflow';
  end if;

  if new.is_verified is distinct from old.is_verified then
    raise exception 'Worker verification is managed by TempStaff administrators';
  end if;

  if new.rating is distinct from old.rating then
    raise exception 'Worker rating is managed by TempStaff';
  end if;

  if new.total_completed_jobs is distinct from old.total_completed_jobs then
    raise exception 'Completed job count is managed by TempStaff';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."protect_worker_profile_operational_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_worker_trust_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() = 'service_role' or public.is_admin() then return new; end if;
  if new.id <> old.id then raise exception 'Worker profile id cannot be changed'; end if;
  if new.is_verified is distinct from old.is_verified then raise exception 'Worker verification is managed by TempStaff administrators'; end if;
  if new.rating is distinct from old.rating then raise exception 'Worker rating is managed by TempStaff'; end if;
  if new.total_completed_jobs is distinct from old.total_completed_jobs then raise exception 'Completed job count is managed by TempStaff'; end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."protect_worker_trust_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_expired_worker_presence"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer:=0;
  v_row record;
BEGIN
  IF auth.role()<>'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin or service-role access required';
  END IF;

  FOR v_row IN
    SELECT wp.id AS worker_id
    FROM public.worker_profiles wp
    JOIN public.worker_presence pr ON pr.worker_id=wp.id
    WHERE pr.is_available=true
      AND pr.expires_at IS NOT NULL
      AND pr.expires_at<=now()
    FOR UPDATE OF wp SKIP LOCKED
  LOOP
    UPDATE public.worker_presence
    SET is_available=false,expires_at=now(),updated_at=now()
    WHERE worker_id=v_row.worker_id
      AND is_available=true
      AND expires_at IS NOT NULL
      AND expires_at<=now();

    PERFORM set_config('app.worker_profile_internal_mutation','presence',true);

    UPDATE public.worker_profiles
    SET worker_status='offline'::public.worker_status,updated_at=now()
    WHERE id=v_row.worker_id AND worker_status='available'::public.worker_status;

    v_count:=v_count+1;
  END LOOP;
  RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."reconcile_expired_worker_presence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_paid_booking"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_dispatch jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.customer_id <> auth.uid()
     and not public.is_admin() then
    raise exception 'Booking access denied';
  end if;

  select *
  into v_payment
  from public.payments
  where booking_id = p_booking_id
    and status = 'paid'::public.payment_status
  order by updated_at desc
  limit 1;

  if not found then
    raise exception 'No paid payment found for booking';
  end if;

  if v_booking.status in (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status
  ) then
    perform public.transition_booking_state(
      p_booking_id,
      'paid'::public.booking_status
    );

    select *
    into v_booking
    from public.bookings
    where id = p_booking_id;
  end if;

  if v_booking.status in (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status,
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  ) then
    v_dispatch :=
      public.dispatch_booking_worker_offers_internal(
        p_booking_id
      );
  else
    v_dispatch := jsonb_build_object(
      'success', true,
      'assigned', v_booking.worker_id is not null,
      'status', v_booking.status::text,
      'worker_id', v_booking.worker_id
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'payment_id', v_payment.id,
    'assignment', v_dispatch
  );
end;
$$;


ALTER FUNCTION "public"."reconcile_paid_booking"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_worker_assignment_presence"("p_worker_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_worker_status public.worker_status;
  v_is_verified boolean;
  v_profile_active boolean;
  v_has_assignment boolean;
  v_was_available boolean := false;
  v_fresh_location boolean := false;
  v_presence public.worker_presence%rowtype;
BEGIN
  IF p_worker_id IS NULL THEN
    RETURN;
  END IF;

  SELECT wp.worker_status, wp.is_verified, p.is_active
  INTO v_worker_status, v_is_verified, v_profile_active
  FROM public.worker_profiles wp
  JOIN public.profiles p ON p.id = wp.id
  WHERE wp.id = p_worker_id
    AND p.role = 'worker'::public.user_role
  FOR UPDATE OF wp;

  IF NOT FOUND OR v_worker_status = 'suspended'::public.worker_status THEN
    RETURN;
  END IF;

  SELECT * INTO v_presence
  FROM public.worker_presence
  WHERE worker_id = p_worker_id
  FOR UPDATE;

  v_has_assignment := public.worker_has_active_assignment(p_worker_id);

  IF v_has_assignment THEN
    -- Capture online intent only when transitioning into busy; preserve it when
    -- other booking/occurrence triggers fire during the same assignment lifecycle.
    IF v_worker_status <> 'busy'::public.worker_status THEN
      v_was_available := coalesce(
        v_worker_status = 'available'::public.worker_status
        AND v_presence.is_available = true
        AND v_presence.expires_at > now(),
        false
      );

      INSERT INTO public.worker_presence (
        worker_id, is_available, last_seen_at, expires_at,
        was_available_before_busy, updated_at
      )
      VALUES (
        p_worker_id, false, v_presence.last_seen_at, now(),
        v_was_available, now()
      )
      ON CONFLICT (worker_id) DO UPDATE
      SET is_available = false,
          expires_at = now(),
          was_available_before_busy = v_was_available,
          updated_at = now();
    ELSE
      UPDATE public.worker_presence
      SET is_available = false,
          expires_at = now(),
          updated_at = now()
      WHERE worker_id = p_worker_id;
    END IF;

    PERFORM set_config('app.worker_profile_internal_mutation', 'presence', true);
    UPDATE public.worker_profiles
    SET worker_status = 'busy'::public.worker_status,
        updated_at = now()
    WHERE id = p_worker_id
      AND worker_status <> 'suspended'::public.worker_status;

    UPDATE public.worker_availability
    SET is_available = false
    WHERE worker_id = p_worker_id;
    RETURN;
  END IF;

  -- There are no active assignments. Restore online state only if the worker was
  -- online before accepting the assignment and a fresh GPS fix still exists.
  IF v_worker_status = 'busy'::public.worker_status THEN
    SELECT coalesce(pr.was_available_before_busy, false)
    INTO v_was_available
    FROM public.worker_presence pr
    WHERE pr.worker_id = p_worker_id;

    SELECT EXISTS (
      SELECT 1
      FROM public.worker_locations wl
      WHERE wl.worker_id = p_worker_id
        AND wl.location IS NOT NULL
        AND wl.recorded_at >= now() - interval '10 minutes'
    ) INTO v_fresh_location;

    IF coalesce(v_was_available, false)
       AND coalesce(v_is_verified, false)
       AND coalesce(v_profile_active, false)
       AND coalesce(v_fresh_location, false) THEN
      PERFORM set_config('app.worker_profile_internal_mutation', 'presence', true);
      UPDATE public.worker_profiles
      SET worker_status = 'available'::public.worker_status,
          updated_at = now()
      WHERE id = p_worker_id
        AND worker_status = 'busy'::public.worker_status;

      INSERT INTO public.worker_presence (
        worker_id, is_available, last_seen_at, expires_at,
        was_available_before_busy, updated_at
      )
      VALUES (
        p_worker_id, true, now(), now() + interval '3 minutes', false, now()
      )
      ON CONFLICT (worker_id) DO UPDATE
      SET is_available = true,
          last_seen_at = now(),
          expires_at = now() + interval '3 minutes',
          was_available_before_busy = false,
          updated_at = now();

      UPDATE public.worker_availability
      SET is_available = true
      WHERE worker_id = p_worker_id;
    ELSE
      PERFORM set_config('app.worker_profile_internal_mutation', 'presence', true);
      UPDATE public.worker_profiles
      SET worker_status = 'offline'::public.worker_status,
          updated_at = now()
      WHERE id = p_worker_id
        AND worker_status = 'busy'::public.worker_status;

      INSERT INTO public.worker_presence (
        worker_id, is_available, last_seen_at, expires_at,
        was_available_before_busy, updated_at
      )
      VALUES (
        p_worker_id, false, coalesce(v_presence.last_seen_at, now()), now(), false, now()
      )
      ON CONFLICT (worker_id) DO UPDATE
      SET is_available = false,
          expires_at = now(),
          was_available_before_busy = false,
          updated_at = now();

      UPDATE public.worker_availability
      SET is_available = false
      WHERE worker_id = p_worker_id;
    END IF;
  END IF;
END;
$$;


ALTER FUNCTION "public"."reconcile_worker_assignment_presence"("p_worker_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_worker_assignment_presence_from_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.reconcile_worker_assignment_presence(OLD.worker_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.worker_id IS DISTINCT FROM NEW.worker_id THEN
      PERFORM public.reconcile_worker_assignment_presence(OLD.worker_id);
    END IF;
  END IF;

  PERFORM public.reconcile_worker_assignment_presence(NEW.worker_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."reconcile_worker_assignment_presence_from_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reconcile_worker_assignment_presence_from_occurrence"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.reconcile_worker_assignment_presence(OLD.worker_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.worker_id IS DISTINCT FROM NEW.worker_id THEN
      PERFORM public.reconcile_worker_assignment_presence(OLD.worker_id);
    END IF;
  END IF;

  PERFORM public.reconcile_worker_assignment_presence(NEW.worker_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."reconcile_worker_assignment_presence_from_occurrence"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_razorpay_webhook_event"("p_event_id" "text", "p_event_name" "text", "p_payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_event_id uuid;
  v_existing public.payment_webhook_events%rowtype;
begin
  if p_event_id is null or btrim(p_event_id) = '' then
    raise exception 'Webhook event ID is required';
  end if;
  if p_event_name is null or btrim(p_event_name) = '' then
    raise exception 'Webhook event name is required';
  end if;
  if p_payload is null then
    raise exception 'Webhook payload is required';
  end if;

  insert into public.payment_webhook_events(
    provider,event_id,event_name,signature_verified,payload,status,received_at,created_at,updated_at
  ) values (
    'razorpay',btrim(p_event_id),btrim(p_event_name),true,p_payload,'received',now(),now(),now()
  )
  on conflict(provider,event_id) do nothing
  returning id into v_event_id;

  if v_event_id is not null then
    return jsonb_build_object(
      'success',true,
      'duplicate',false,
      'event_id',v_event_id,
      'provider_event_id',btrim(p_event_id),
      'status','received'
    );
  end if;

  select * into v_existing
  from public.payment_webhook_events
  where provider='razorpay' and event_id=btrim(p_event_id);

  return jsonb_build_object(
    'success',true,
    'duplicate',true,
    'event_id',v_existing.id,
    'provider_event_id',v_existing.event_id,
    'status',v_existing.status
  );
end;
$$;


ALTER FUNCTION "public"."record_razorpay_webhook_event"("p_event_id" "text", "p_event_name" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_locations" (
    "id" bigint NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "booking_id" "uuid",
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "location" "public"."geography"(Point,4326),
    "recorded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_locations_latitude_range_chk" CHECK ((("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision))),
    CONSTRAINT "worker_locations_longitude_range_chk" CHECK ((("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision)))
);


ALTER TABLE "public"."worker_locations" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_worker_booking_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) RETURNS "public"."worker_locations"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_location public.worker_locations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.worker_profiles wp on wp.id = p.id
    where p.id = v_user_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
      and coalesce(wp.is_verified, false) = true
      and wp.worker_status <> 'suspended'::public.worker_status
  ) then
    raise exception 'Worker account is inactive, unverified, or suspended';
  end if;

  if p_booking_id is null then
    raise exception 'Booking ID is required';
  end if;

  if p_latitude is null
     or p_longitude is null
     or p_latitude < -90
     or p_latitude > 90
     or p_longitude < -180
     or p_longitude > 180 then
    raise exception 'Invalid coordinates';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
    and worker_id = v_user_id
  for update;

  if not found then
    raise exception 'Booking not assigned to this worker';
  end if;

  if v_booking.status not in (
    'on_the_way'::public.booking_status,
    'arrived'::public.booking_status,
    'in_progress'::public.booking_status
  ) then
    raise exception 'Location tracking is not active for this booking';
  end if;

  insert into public.worker_locations (
    worker_id,
    booking_id,
    latitude,
    longitude,
    recorded_at
  )
  values (
    v_user_id,
    p_booking_id,
    p_latitude,
    p_longitude,
    now()
  )
  returning * into v_location;

  return v_location;
end;
$$;


ALTER FUNCTION "public"."record_worker_booking_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."record_worker_booking_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) IS 'Authenticated worker-only location write path. Validates worker ownership, booking status, and coordinate bounds before inserting a tracking point.';



CREATE OR REPLACE FUNCTION "public"."redact_customer_pii_jsonb"("p_value" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF jsonb_typeof(p_value) = 'object' THEN
    SELECT COALESCE(
      jsonb_object_agg(e.key, public.redact_customer_pii_jsonb(e.value)),
      '{}'::jsonb
    )
    INTO v_result
    FROM jsonb_each(p_value) AS e(key, value)
    WHERE lower(e.key) NOT IN (
      'email', 'contact', 'phone', 'phone_number', 'mobile', 'name',
      'full_name', 'first_name', 'last_name', 'username', 'address',
      'billing_address', 'shipping_address', 'address_line', 'address_line_1',
      'address_line_2', 'addresses', 'latitude', 'longitude', 'location', 'coordinates',
      'avatar_url', 'customer', 'customer_details', 'customer_name', 'customer_email',
      'customer_phone', 'customer_id', 'customer_user_id', 'user_id', 'user_uuid',
      'profile_id', 'user_name', 'user_email', 'user_phone', 'recipient', 'recipient_name',
      'recipient_email', 'recipient_phone', 'receiver_name', 'contact_name', 'shipping',
      'billing', 'email_address', 'billing_email', 'billing_name', 'shipping_name',
      'notes', 'customer_note', 'customer_notes', 'delivery_instruction', 'reason',
      'review_reason', 'moderation_reason', 'admin_notes', 'subject', 'comment', 'message',
      'body', 'text', 'vpa', 'upi_id', 'description', 'company_name', 'device_token',
      'push_token', 'access_token', 'refresh_token', 'authorization', 'account_number',
      'ifsc', 'bank_account', 'account_holder_name', 'contact_email', 'contact_phone'
    );
    RETURN v_result;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    SELECT COALESCE(
      jsonb_agg(public.redact_customer_pii_jsonb(e.value) ORDER BY e.ordinality),
      '[]'::jsonb
    )
    INTO v_result
    FROM jsonb_array_elements(p_value) WITH ORDINALITY AS e(value, ordinality);
    RETURN v_result;
  END IF;

  RETURN p_value;
END;
$$;


ALTER FUNCTION "public"."redact_customer_pii_jsonb"("p_value" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "platform" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "push_tokens_token_nonempty" CHECK (("btrim"("token") <> ''::"text"))
);


ALTER TABLE "public"."push_tokens" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_customer_push_token"("p_token" "text", "p_platform" "text" DEFAULT NULL::"text") RETURNS "public"."push_tokens"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_customer_id uuid := auth.uid();
  v_row public.push_tokens%rowtype;
  v_token text :=
    trim(coalesce(p_token, ''));
  v_platform text :=
    nullif(
      lower(
        trim(
          coalesce(
            p_platform,
            ''
          )
        )
      ),
      ''
    );
begin
  if v_customer_id is null then
    raise exception
      'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_customer_id
      and p.role =
        'customer'::public.user_role
      and p.is_active = true
  ) then
    raise exception
      'Customer account is inactive';
  end if;

  if v_token = ''
     or length(v_token) > 255
     or v_token !~
       '^ExponentPushToken\[[^\]]+\]$' then
    raise exception
      'Invalid Expo push token';
  end if;

  if v_platform is not null
     and v_platform not in (
       'android',
       'ios',
       'web'
     ) then
    raise exception
      'Invalid push token platform';
  end if;

  select *
  into v_row
  from public.push_tokens
  where token = v_token
  for update;

  if found then
    if v_row.user_id is distinct from v_customer_id then
      raise exception
        'Push token is already registered to another customer';
    end if;

    update public.push_tokens
    set platform = v_platform,
        is_active = true,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;
  else
    insert into public.push_tokens (
      user_id,
      token,
      platform,
      is_active
    )
    values (
      v_customer_id,
      v_token,
      v_platform,
      true
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$_$;


ALTER FUNCTION "public"."register_customer_push_token"("p_token" "text", "p_platform" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_worker_push_token"("p_token" "text", "p_platform" "text" DEFAULT NULL::"text") RETURNS "public"."push_tokens"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  v_user_id uuid;
  v_token text;
  v_platform text;
  v_row public.push_tokens;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_user_id
      AND role = 'worker'::public.user_role
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Worker account not active.';
  END IF;

  v_token := btrim(p_token);
  IF v_token IS NULL OR v_token = '' THEN
    RAISE EXCEPTION 'Push token is required.';
  END IF;

  IF length(v_token) > 255 THEN
    RAISE EXCEPTION 'Invalid Expo push token.';
  END IF;

  IF v_token !~ '^ExponentPushToken\[[^\]]+\]$' THEN
    RAISE EXCEPTION 'Invalid Expo push token.';
  END IF;

  v_platform := btrim(lower(p_platform));
  IF v_platform IS NOT NULL
     AND v_platform != ''
     AND v_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'Invalid platform.';
  END IF;

  INSERT INTO public.push_tokens (
    user_id,
    token,
    platform,
    is_active
  )
  VALUES (
    v_user_id,
    v_token,
    NULLIF(v_platform, ''),
    true
  )
  ON CONFLICT (token)
  DO UPDATE SET
    user_id = EXCLUDED.user_id,
    is_active = true,
    platform = COALESCE(NULLIF(EXCLUDED.platform, ''), public.push_tokens.platform),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$_$;


ALTER FUNCTION "public"."register_worker_push_token"("p_token" "text", "p_platform" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_booking_refund"("p_booking_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_request public.refund_requests%rowtype;
  v_payment_refund public.payment_refunds%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.status in (
    'completed'::public.booking_status,
    'expired'::public.booking_status
  ) then
    raise exception 'Completed or expired bookings require a dedicated adjustment workflow; full refund request is not permitted';
  end if;

  select *
  into v_payment
  from public.payments
  where booking_id = p_booking_id
    and status = 'paid'::public.payment_status
  order by updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No paid payment found for booking';
  end if;

  if v_payment.amount <= 0 then
    raise exception 'Refund amount is invalid';
  end if;

  select *
  into v_request
  from public.refund_requests
  where booking_id = p_booking_id
  for update;

  if found then
    select *
    into v_payment_refund
    from public.payment_refunds
    where refund_request_id = v_request.id
    limit 1
    for update;

    if not found then
      insert into public.payment_refunds (
        payment_id,
        booking_id,
        amount,
        currency,
        reason,
        status,
        requested_by,
        refund_request_id
      )
      values (
        v_request.payment_id,
        v_request.booking_id,
        v_request.amount,
        v_request.currency,
        v_request.reason,
        'pending',
        auth.uid(),
        v_request.id
      )
      returning * into v_payment_refund;
    end if;

    return jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'refund_id', v_request.id,
      'payment_refund_id', v_payment_refund.id,
      'payment_id', v_request.payment_id,
      'amount', v_request.amount,
      'currency', v_request.currency,
      'status', v_request.status,
      'payment_refund_status', v_payment_refund.status,
      'idempotent', true
    );
  end if;

  insert into public.refund_requests (
    booking_id,
    payment_id,
    amount,
    currency,
    reason
  )
  values (
    p_booking_id,
    v_payment.id,
    v_payment.amount,
    v_payment.currency,
    nullif(trim(p_reason), '')
  )
  returning * into v_request;

  insert into public.payment_refunds (
    payment_id,
    booking_id,
    amount,
    currency,
    reason,
    status,
    requested_by,
    refund_request_id
  )
  values (
    v_payment.id,
    p_booking_id,
    v_payment.amount,
    v_payment.currency,
    nullif(trim(p_reason), ''),
    'pending',
    auth.uid(),
    v_request.id
  )
  returning * into v_payment_refund;

  return jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'refund_id', v_request.id,
    'payment_refund_id', v_payment_refund.id,
    'payment_id', v_request.payment_id,
    'amount', v_request.amount,
    'currency', v_request.currency,
    'status', v_request.status,
    'payment_refund_status', v_payment_refund.status,
    'idempotent', false
  );
end;
$$;


ALTER FUNCTION "public"."request_booking_refund"("p_booking_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_service_availability"("p_service_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) RETURNS "public"."service_availability_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_customer_id uuid := (SELECT auth.uid());
  v_existing public.service_availability_requests;
  v_result public.service_availability_requests;
begin
  if v_customer_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_customer_id
      and p.role = 'customer'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Active customer account required';
  end if;

  if p_service_id is null or not exists (
    select 1 from public.services s
    where s.id = p_service_id and s.is_active = true
  ) then
    raise exception 'Active service is required';
  end if;

  if p_latitude is null or p_latitude < -90 or p_latitude > 90
     or p_longitude is null or p_longitude < -180 or p_longitude > 180 then
    raise exception 'A valid location is required';
  end if;

  select * into v_existing
  from public.service_availability_requests r
  where r.customer_id = v_customer_id
    and r.service_id = p_service_id
    and r.status = 'pending'
  order by r.created_at desc
  limit 1
  for update;

  if v_existing.id is not null then
    return v_existing;
  end if;

  insert into public.service_availability_requests (
    customer_id, service_id, latitude, longitude, status
  ) values (
    v_customer_id, p_service_id, p_latitude, p_longitude, 'pending'
  )
  returning * into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."request_service_availability"("p_service_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."account_deletion_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "auth_user_id" "uuid",
    CONSTRAINT "account_deletion_auth_user_id_only_while_processing" CHECK ((("auth_user_id" IS NULL) OR ("status" = 'processing'::"text"))),
    CONSTRAINT "account_deletion_requests_reason_nonempty" CHECK ((("reason" IS NULL) OR ("length"(TRIM(BOTH FROM "reason")) > 0))),
    CONSTRAINT "account_deletion_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."account_deletion_requests" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_worker_account_deletion"("p_reason" "text" DEFAULT NULL::"text") RETURNS "public"."account_deletion_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_request public.account_deletion_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if v_reason is not null and length(v_reason) > 2000 then
    raise exception 'Deletion reason must not exceed 2000 characters';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Active worker account required';
  end if;

  select *
  into v_request
  from public.account_deletion_requests
  where user_id = v_worker_id
    and status = 'pending'
  order by requested_at desc
  limit 1
  for update;

  if found then
    return v_request;
  end if;

  insert into public.account_deletion_requests(
    user_id,
    reason,
    status
  )
  values(
    v_worker_id,
    v_reason,
    'pending'
  )
  returning * into v_request;

  return v_request;
end;
$$;


ALTER FUNCTION "public"."request_worker_account_deletion"("p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."requeue_stale_payment_refund"("p_refund_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_refund public.payment_refunds%rowtype;
begin
  if p_refund_id is null then
    raise exception 'Refund ID is required';
  end if;

  if coalesce((select auth.jwt() ->> 'role'),'') <> 'service_role' then
    raise exception 'Service role access required';
  end if;

  select *
  into v_refund
  from public.payment_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund not found';
  end if;

  if v_refund.status = 'succeeded' then
    return jsonb_build_object(
      'success', true,
      'requeued', false,
      'status', 'succeeded',
      'refund_id', p_refund_id,
      'idempotent', true
    );
  end if;

  if v_refund.status <> 'processing' then
    return jsonb_build_object(
      'success', true,
      'requeued', false,
      'status', v_refund.status::text,
      'refund_id', p_refund_id,
      'idempotent', true
    );
  end if;

  if v_refund.provider_refund_id is not null then
    return jsonb_build_object(
      'success', true,
      'requeued', false,
      'status', 'processing',
      'refund_id', p_refund_id,
      'requires_reconciliation', true
    );
  end if;

  if v_refund.updated_at > now() - interval '10 minutes' then
    return jsonb_build_object(
      'success', true,
      'requeued', false,
      'status', 'processing',
      'refund_id', p_refund_id,
      'still_fresh', true
    );
  end if;

  update public.payment_refunds
  set
    status = 'pending',
    updated_at = now()
  where id = p_refund_id
    and status = 'processing'
    and provider_refund_id is null
    and updated_at <= now() - interval '10 minutes';

  if not found then
    select status::text
    into v_refund.status
    from public.payment_refunds
    where id = p_refund_id;

    return jsonb_build_object(
      'success', true,
      'requeued', false,
      'status', coalesce(v_refund.status::text, 'unknown'),
      'refund_id', p_refund_id,
      'concurrent_change', true
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'requeued', true,
    'status', 'pending',
    'refund_id', p_refund_id
  );
end;
$$;


ALTER FUNCTION "public"."requeue_stale_payment_refund"("p_refund_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reschedule_customer_booking"("p_booking_id" "uuid", "p_new_start" timestamp with time zone, "p_new_end" timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_customer_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_offer public.booking_worker_offers%rowtype;
  v_timezone text := 'Asia/Kolkata';
  v_new_start_local timestamp;
  v_new_end_local timestamp;
  v_new_date date;
  v_tomorrow date;
  v_old_start timestamptz;
  v_old_end timestamptz;
  v_duration_seconds bigint;
  v_available_workers integer := 0;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = v_customer_id
      AND role = 'customer'::public.user_role
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Customer account is inactive';
  END IF;

  IF p_booking_id IS NULL OR p_new_start IS NULL OR p_new_end IS NULL THEN
    RAISE EXCEPTION 'Booking and new schedule are required';
  END IF;

  IF p_new_end <= p_new_start THEN
    RAISE EXCEPTION 'New end time must be after new start time';
  END IF;

  SELECT COALESCE(
    NULLIF(TRIM(value->>'value'), ''),
    'Asia/Kolkata'
  )
  INTO v_timezone
  FROM public.platform_settings
  WHERE key = 'operations.timezone'
    AND is_active = true
  ORDER BY updated_at DESC
  LIMIT 1;

  v_timezone := COALESCE(v_timezone, 'Asia/Kolkata');

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      'customer-booking:' || v_customer_id::text,
      0
    )
  );

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND customer_id = v_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  FOR v_offer IN
    SELECT *
    FROM public.booking_worker_offers
    WHERE booking_id = p_booking_id
      AND status = 'pending'
    ORDER BY id
    FOR UPDATE
  LOOP
    NULL;
  END LOOP;

  IF v_booking.fulfillment_type <>
       'scheduled'::public.booking_fulfillment_type THEN
    RAISE EXCEPTION 'Only scheduled bookings can be rescheduled';
  END IF;

  IF v_booking.worker_id IS NOT NULL THEN
    RAISE EXCEPTION 'Assigned bookings cannot be rescheduled by the customer';
  END IF;

  IF v_booking.status NOT IN (
    'pending_payment'::public.booking_status,
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  ) THEN
    RAISE EXCEPTION 'This booking can no longer be rescheduled';
  END IF;

  IF p_new_start <= now() THEN
    RAISE EXCEPTION 'New booking time must be in the future';
  END IF;

  v_new_start_local := p_new_start AT TIME ZONE v_timezone;
  v_new_end_local := p_new_end AT TIME ZONE v_timezone;
  v_new_date := v_new_start_local::date;
  v_tomorrow := (now() AT TIME ZONE v_timezone)::date + 1;

  IF v_new_date < v_tomorrow THEN
    RAISE EXCEPTION 'Scheduled booking must start tomorrow or later';
  END IF;

  IF v_new_end_local::date <> v_new_date THEN
    RAISE EXCEPTION 'Scheduled booking must start and end on the same local date';
  END IF;

  IF NOT public.is_booking_within_operating_hours(p_new_start, p_new_end) THEN
    RAISE EXCEPTION 'Requested working hours are outside configured operating hours';
  END IF;

  v_old_start := v_booking.scheduled_start;
  v_old_end := v_booking.scheduled_end;
  v_duration_seconds := extract(epoch FROM (v_old_end - v_old_start));

  IF v_duration_seconds <= 0 THEN
    RAISE EXCEPTION 'Existing booking duration is invalid';
  END IF;

  IF extract(epoch FROM (p_new_end - p_new_start)) <> v_duration_seconds THEN
    RAISE EXCEPTION 'Rescheduling must preserve the original booking duration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.customer_id = v_customer_id
      AND b.id <> v_booking.id
      AND b.status NOT IN (
        'cancelled'::public.booking_status,
        'expired'::public.booking_status,
        'payment_failed'::public.booking_status
      )
      AND b.scheduled_start < p_new_end
      AND b.scheduled_end > p_new_start
  ) THEN
    RAISE EXCEPTION 'New booking time overlaps another customer booking';
  END IF;

  -- Validate worker coverage before changing offers or the schedule.
  SELECT COUNT(DISTINCT ws.worker_id)::integer
  INTO v_available_workers
  FROM public.worker_services ws
  JOIN public.worker_profiles wp
    ON wp.id = ws.worker_id
  WHERE ws.service_id = v_booking.service_id
    AND wp.is_verified = true
    AND wp.worker_status <> 'suspended'::public.worker_status
    AND public.worker_covers_booking_interval(
      v_booking.service_id,
      ws.worker_id,
      p_new_start,
      p_new_end
    );

  IF v_available_workers = 0 THEN
    RAISE EXCEPTION 'No workers are available for the requested time slot';
  END IF;

  UPDATE public.booking_worker_offers
  SET status = 'cancelled',
      responded_at = COALESCE(responded_at, now()),
      updated_at = now()
  WHERE booking_id = v_booking.id
    AND status = 'pending';

  UPDATE public.bookings
  SET scheduled_start = p_new_start,
      scheduled_end = p_new_end,
      updated_at = now()
  WHERE id = v_booking.id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'scheduled_start', p_new_start,
    'scheduled_end', p_new_end,
    'previous_scheduled_start', v_old_start,
    'previous_scheduled_end', v_old_end,
    'timezone', v_timezone
  );
END;
$$;


ALTER FUNCTION "public"."reschedule_customer_booking"("p_booking_id" "uuid", "p_new_start" timestamp with time zone, "p_new_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "document_type" "public"."worker_document_type" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text",
    "mime_type" "text",
    "file_size" bigint,
    "status" "public"."worker_document_status" DEFAULT 'pending'::"public"."worker_document_status" NOT NULL,
    "rejection_reason" "text",
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."worker_documents" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_worker_document"("p_document_type" "public"."worker_document_type", "p_file_path" "text", "p_file_name" "text" DEFAULT NULL::"text", "p_mime_type" "text" DEFAULT NULL::"text", "p_file_size" bigint DEFAULT NULL::bigint) RETURNS "public"."worker_documents"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_worker_id uuid := auth.uid();
  v_application_id uuid;
  v_result public.worker_documents;
begin
  if v_worker_id is null or not exists (
    select 1 from public.profiles p
    where p.id = v_worker_id and p.role = 'worker'::public.user_role and p.is_active = true
  ) then
    raise exception 'Unauthorized';
  end if;

  if p_file_path is null or p_file_path not like v_worker_id::text || '/%' then
    raise exception 'Invalid document path';
  end if;

  if p_file_size is not null and (p_file_size <= 0 or p_file_size > 10485760) then
    raise exception 'File size must be between 1 byte and 10 MB';
  end if;

  if p_mime_type is not null and p_mime_type not in ('image/jpeg','image/png','application/pdf') then
    raise exception 'Unsupported document type';
  end if;

  select a.id into v_application_id
  from public.worker_applications a
  where a.worker_id = v_worker_id
  order by a.created_at desc
  limit 1;

  if v_application_id is null then
    raise exception 'Worker application not found';
  end if;

  insert into public.worker_documents (
    application_id, worker_id, document_type, file_path, file_name,
    mime_type, file_size, status, rejection_reason, reviewed_at, reviewed_by, updated_at
  ) values (
    v_application_id, v_worker_id, p_document_type, p_file_path, p_file_name,
    p_mime_type, p_file_size, 'pending'::public.worker_document_status,
    null, null, null, now()
  )
  on conflict (application_id, document_type) do update set
    worker_id = excluded.worker_id,
    file_path = excluded.file_path,
    file_name = excluded.file_name,
    mime_type = excluded.mime_type,
    file_size = excluded.file_size,
    status = 'pending'::public.worker_document_status,
    rejection_reason = null,
    reviewed_at = null,
    reviewed_by = null,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."save_worker_document"("p_document_type" "public"."worker_document_type", "p_file_path" "text", "p_file_name" "text", "p_mime_type" "text", "p_file_size" bigint) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_onboarding_profiles" (
    "worker_id" "uuid" NOT NULL,
    "date_of_birth" "date",
    "gender" "text",
    "current_address" "text",
    "permanent_address" "text",
    "city" "text",
    "state" "text",
    "pincode" "text",
    "experience_years" numeric(5,1),
    "experience_summary" "text",
    "profile_photo_path" "text",
    "service_latitude" double precision,
    "service_longitude" double precision,
    "onboarding_step" smallint DEFAULT 1 NOT NULL,
    "consent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_onboarding_profiles_experience_check" CHECK ((("experience_years" IS NULL) OR ("experience_years" >= (0)::numeric))),
    CONSTRAINT "worker_onboarding_profiles_gender_check" CHECK ((("gender" IS NULL) OR ("gender" = ANY (ARRAY['male'::"text", 'female'::"text", 'other'::"text", 'prefer_not_to_say'::"text"])))),
    CONSTRAINT "worker_onboarding_profiles_lat_check" CHECK ((("service_latitude" IS NULL) OR (("service_latitude" >= ('-90'::integer)::double precision) AND ("service_latitude" <= (90)::double precision)))),
    CONSTRAINT "worker_onboarding_profiles_lon_check" CHECK ((("service_longitude" IS NULL) OR (("service_longitude" >= ('-180'::integer)::double precision) AND ("service_longitude" <= (180)::double precision)))),
    CONSTRAINT "worker_onboarding_profiles_pincode_check" CHECK ((("pincode" IS NULL) OR ("pincode" ~ '^[0-9]{6}$'::"text"))),
    CONSTRAINT "worker_onboarding_profiles_step_check" CHECK ((("onboarding_step" >= 1) AND ("onboarding_step" <= 8)))
);


ALTER TABLE "public"."worker_onboarding_profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_worker_onboarding"("p_date_of_birth" "date" DEFAULT NULL::"date", "p_gender" "text" DEFAULT NULL::"text", "p_current_address" "text" DEFAULT NULL::"text", "p_permanent_address" "text" DEFAULT NULL::"text", "p_city" "text" DEFAULT NULL::"text", "p_state" "text" DEFAULT NULL::"text", "p_pincode" "text" DEFAULT NULL::"text", "p_experience_years" numeric DEFAULT NULL::numeric, "p_experience_summary" "text" DEFAULT NULL::"text", "p_profile_photo_path" "text" DEFAULT NULL::"text", "p_service_latitude" double precision DEFAULT NULL::double precision, "p_service_longitude" double precision DEFAULT NULL::double precision, "p_onboarding_step" smallint DEFAULT 1) RETURNS "public"."worker_onboarding_profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_worker_id uuid := auth.uid();
  v_result public.worker_onboarding_profiles;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_worker_id and role = 'worker'::public.user_role and is_active = true
  ) then
    raise exception 'Worker account required';
  end if;

  if p_onboarding_step < 1 or p_onboarding_step > 8 then
    raise exception 'Invalid onboarding step';
  end if;

  if p_gender is not null and p_gender not in ('male','female','other','prefer_not_to_say') then
    raise exception 'Invalid gender';
  end if;

  insert into public.worker_onboarding_profiles (
    worker_id, date_of_birth, gender, current_address, permanent_address,
    city, state, pincode, experience_years, experience_summary,
    profile_photo_path, service_latitude, service_longitude, onboarding_step, updated_at
  ) values (
    v_worker_id, p_date_of_birth, nullif(trim(p_gender), ''), nullif(trim(p_current_address), ''),
    nullif(trim(p_permanent_address), ''), nullif(trim(p_city), ''), nullif(trim(p_state), ''),
    nullif(trim(p_pincode), ''), p_experience_years, nullif(trim(p_experience_summary), ''),
    nullif(trim(p_profile_photo_path), ''), p_service_latitude, p_service_longitude, p_onboarding_step, now()
  )
  on conflict (worker_id) do update set
    date_of_birth = excluded.date_of_birth,
    gender = excluded.gender,
    current_address = excluded.current_address,
    permanent_address = excluded.permanent_address,
    city = excluded.city,
    state = excluded.state,
    pincode = excluded.pincode,
    experience_years = excluded.experience_years,
    experience_summary = excluded.experience_summary,
    profile_photo_path = excluded.profile_photo_path,
    service_latitude = excluded.service_latitude,
    service_longitude = excluded.service_longitude,
    onboarding_step = greatest(public.worker_onboarding_profiles.onboarding_step, excluded.onboarding_step),
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."save_worker_onboarding"("p_date_of_birth" "date", "p_gender" "text", "p_current_address" "text", "p_permanent_address" "text", "p_city" "text", "p_state" "text", "p_pincode" "text", "p_experience_years" numeric, "p_experience_summary" "text", "p_profile_photo_path" "text", "p_service_latitude" double precision, "p_service_longitude" double precision, "p_onboarding_step" smallint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_booking_schedule_occurrence_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_booking_schedule_occurrence_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_booking_worker_offer_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_booking_worker_offer_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_home_promotions_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_home_promotions_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_payment_webhook_event_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_payment_webhook_event_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_platform_setting_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_platform_setting_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_refund_request_result"("p_refund_id" "uuid", "p_status" "text", "p_provider_refund_id" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_request public.refund_requests%rowtype;
  v_payment_refund public.payment_refunds%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('processing','succeeded','failed') then
    raise exception 'Invalid refund status';
  end if;

  select *
  into v_request
  from public.refund_requests
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund request not found';
  end if;

  select *
  into v_payment_refund
  from public.payment_refunds
  where refund_request_id = v_request.id
  limit 1
  for update;

  if not found then
    select *
    into v_payment_refund
    from public.payment_refunds
    where payment_id = v_request.payment_id
      and booking_id = v_request.booking_id
      and refund_request_id is null
      and amount = v_request.amount
    order by created_at asc
    limit 1
    for update;

    if found then
      update public.payment_refunds
      set refund_request_id = v_request.id,
          updated_at = now()
      where id = v_payment_refund.id
      returning * into v_payment_refund;
    end if;
  end if;

  if v_payment_refund.id is null then
    insert into public.payment_refunds(
      payment_id,
      booking_id,
      amount,
      currency,
      reason,
      status,
      requested_by,
      requested_at,
      refund_request_id
    )
    values(
      v_request.payment_id,
      v_request.booking_id,
      v_request.amount,
      v_request.currency,
      v_request.reason,
      'pending',
      auth.uid(),
      coalesce(v_request.requested_at, now()),
      v_request.id
    )
    returning * into v_payment_refund;
  end if;

  v_result := public.finalize_payment_refund(
    v_payment_refund.id,
    p_status,
    p_provider_refund_id,
    null
  );

  return jsonb_build_object(
    'success', true,
    'refund_id', v_request.id,
    'payment_refund_id', v_payment_refund.id,
    'status', v_result->>'status',
    'payment_status', v_result->>'payment_status',
    'succeeded_refund_total', v_result->'succeeded_refund_total',
    'consolidated', true
  );
end;
$$;


ALTER FUNCTION "public"."set_refund_request_result"("p_refund_id" "uuid", "p_status" "text", "p_provider_refund_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_service_availability_request_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_service_availability_request_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_support_ticket_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at := now();
  if new.status in ('resolved','closed') and old.status not in ('resolved','closed') then
    new.resolved_at := coalesce(new.resolved_at, now());
  elsif new.status not in ('resolved','closed') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."set_support_ticket_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_worker_onboarding_consent"() RETURNS "public"."worker_onboarding_profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_worker_id uuid := auth.uid();
  v_result public.worker_onboarding_profiles;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_worker_id
      and role = 'worker'::public.user_role
      and is_active = true
  ) then
    raise exception 'Worker account required';
  end if;

  update public.worker_onboarding_profiles
  set consent_at = now(),
      updated_at = now()
  where worker_id = v_worker_id
  returning * into v_result;

  if v_result.worker_id is null then
    raise exception 'Worker onboarding profile not found';
  end if;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."set_worker_onboarding_consent"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_worker_schedule_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_worker_schedule_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_worker_services"("p_service_ids" "uuid"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_worker_id uuid := auth.uid();
  v_service_count integer;
begin
  if v_worker_id is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required');
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    return jsonb_build_object('success', false, 'error', 'Worker account is inactive');
  end if;

  if not exists (
    select 1 from public.worker_profiles wp where wp.id = v_worker_id
  ) then
    return jsonb_build_object('success', false, 'error', 'Worker profile not found');
  end if;

  if p_service_ids is null
     or array_length(p_service_ids, 1) is null
     or array_length(p_service_ids, 1) = 0 then
    return jsonb_build_object('success', false, 'error', 'Select at least one service');
  end if;

  select count(*)
  into v_service_count
  from unnest(p_service_ids) as service_id(id)
  join public.services s on s.id = service_id.id
  where s.is_active = true;

  if v_service_count <> array_length(p_service_ids, 1) then
    return jsonb_build_object(
      'success', false, 'error', 'One or more selected services are invalid'
    );
  end if;

  delete from public.worker_services where worker_id = v_worker_id;

  insert into public.worker_services (worker_id, service_id)
  select v_worker_id, service_id.id
  from unnest(p_service_ids) as service_id(id)
  on conflict (worker_id, service_id) do nothing;

  return jsonb_build_object(
    'success', true,
    'worker_id', v_worker_id,
    'service_count', array_length(p_service_ids, 1)
  );
end;
$$;


ALTER FUNCTION "public"."set_worker_services"("p_service_ids" "uuid"[]) OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "onboarding_type" "text" NOT NULL,
    "status" "public"."worker_application_status" DEFAULT 'draft'::"public"."worker_application_status" NOT NULL,
    "submitted_at" timestamp with time zone,
    "reviewed_at" timestamp with time zone,
    "reviewed_by" "uuid",
    "review_notes" "text",
    "reapply_after" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_applications_onboarding_type_check" CHECK (("onboarding_type" = ANY (ARRAY['admin_created'::"text", 'self_registered'::"text"])))
);


ALTER TABLE "public"."worker_applications" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_worker_application"() RETURNS "public"."worker_applications"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_worker_id uuid := auth.uid();
  v_application public.worker_applications;
  v_profile public.worker_onboarding_profiles;
  v_doc_count integer;
  v_required_count integer := 6;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Active worker account required';
  end if;

  select * into v_profile
  from public.worker_onboarding_profiles
  where worker_id = v_worker_id;

  if v_profile.worker_id is null then
    raise exception 'Complete worker onboarding before submitting';
  end if;

  if v_profile.date_of_birth is null
     or v_profile.gender is null
     or v_profile.current_address is null
     or v_profile.city is null
     or v_profile.state is null
     or v_profile.pincode is null
     or v_profile.experience_years is null
     or v_profile.service_latitude is null
     or v_profile.service_longitude is null then
    raise exception 'Complete all required worker profile details before submitting';
  end if;

  if not exists (select 1 from public.worker_services where worker_id = v_worker_id) then
    raise exception 'Select at least one service before submitting';
  end if;

  select count(distinct document_type) into v_doc_count
  from public.worker_documents
  where worker_id = v_worker_id
    and document_type in ('aadhaar','pan','passport_photo','address_proof','police_verification','bank_account');

  if v_doc_count < v_required_count then
    raise exception 'Upload all required worker documents before submitting';
  end if;

  if v_profile.consent_at is null then
    raise exception 'Worker consent is required before submitting';
  end if;

  select * into v_application
  from public.worker_applications
  where worker_id = v_worker_id
  for update;

  if v_application.id is null then
    raise exception 'Worker application not found';
  end if;

  if v_application.status not in ('draft','changes_required') then
    return v_application;
  end if;

  update public.worker_applications
  set status = 'submitted'::public.worker_application_status,
      submitted_at = now(),
      updated_at = now(),
      review_notes = null
  where id = v_application.id
  returning * into v_application;

  return v_application;
end;
$$;


ALTER FUNCTION "public"."submit_worker_application"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_address_location_from_coordinates"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.latitude is null or new.longitude is null then
    raise exception 'Address coordinates are required';
  end if;
  if new.latitude < -90 or new.latitude > 90 then
    raise exception 'Address latitude is invalid';
  end if;
  if new.longitude < -180 or new.longitude > 180 then
    raise exception 'Address longitude is invalid';
  end if;
  new.location := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::public.geography;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_address_location_from_coordinates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_booking_occurrence_worker"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.worker_id is distinct from old.worker_id then
    update public.booking_schedule_occurrences
    set worker_id = new.worker_id,
        status = case
          when new.worker_id is not null and status = 'scheduled' then 'assigned'
          when new.worker_id is null and status = 'assigned' then 'scheduled'
          else status
        end,
        updated_at = now()
    where booking_id = new.id
      and worker_id is distinct from new.worker_id
      and status not in ('completed','cancelled','expired');
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_booking_occurrence_worker"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_booking_pricing_totals_from_snapshot"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_gross numeric;
  v_discount numeric;
  v_subtotal numeric;
  v_platform_fee numeric;
  v_tax numeric;
  v_final numeric;
begin
  if new.pricing_snapshot is null
     or jsonb_typeof(new.pricing_snapshot) <> 'object' then
    return new;
  end if;

  v_platform_fee := coalesce(
    nullif(new.pricing_snapshot->>'platform_fee','')::numeric,
    0
  );

  v_tax := coalesce(
    nullif(new.pricing_snapshot->>'tax_amount','')::numeric,
    0
  );

  v_final := nullif(
    new.pricing_snapshot->>'final_amount',
    ''
  )::numeric;

  /*
   * final_amount is the authoritative persisted payable total.
   * Therefore the reconciled booking base is:
   *
   * final - platform fee - tax
   *
   * This works for both old snapshots that only contain gross/
   * discount and new snapshots that contain an explicit subtotal.
   */
  if v_final is not null then
    v_subtotal := greatest(
      v_final - v_platform_fee - v_tax,
      0
    );
  else
    v_subtotal := nullif(
      new.pricing_snapshot->>'subtotal_after_discount',
      ''
    )::numeric;

    if v_subtotal is null then
      v_subtotal := nullif(
        new.pricing_snapshot->>'base_amount',
        ''
      )::numeric;
    end if;

    if v_subtotal is null then
      v_gross := nullif(
        new.pricing_snapshot->>'gross_amount',
        ''
      )::numeric;

      v_discount := coalesce(
        nullif(
          new.pricing_snapshot->>'discount_amount',
          ''
        )::numeric,
        0
      );

      if v_gross is not null then
        v_subtotal := greatest(
          v_gross - v_discount,
          0
        );
      end if;
    end if;
  end if;

  if v_subtotal is not null then
    new.base_amount := round(
      greatest(v_subtotal,0),
      2
    );
  end if;

  new.platform_fee := round(
    greatest(v_platform_fee,0),
    2
  );

  new.tax_amount := round(
    greatest(v_tax,0),
    2
  );

  new.total_amount := round(
    new.base_amount +
    new.platform_fee +
    new.tax_amount,
    2
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_booking_pricing_totals_from_snapshot"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_cancelled_booking_occurrences"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'cancelled'::public.booking_status and old.status is distinct from new.status then
    update public.booking_schedule_occurrences
    set status = 'cancelled',
        worker_id = null,
        updated_at = now()
    where booking_id = new.id
      and status <> 'completed';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_cancelled_booking_occurrences"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_email_from_auth"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.profiles
     set email = new.email,
         updated_at = now()
   where id = new.id
     and email is distinct from new.email;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_profile_email_from_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_service_area_group_rows"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  update public.service_areas
  set name = new.name,
      city = new.city,
      state = new.state,
      center_latitude = new.center_latitude,
      center_longitude = new.center_longitude,
      radius_km = new.radius_km,
      is_active = new.is_active,
      updated_at = now()
  where group_id = new.id;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_service_area_group_rows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_worker_application_operational_state"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'approved'::public.worker_application_status then
    update public.worker_profiles
    set is_verified = true,
        worker_status = case when worker_status = 'suspended'::public.worker_status then worker_status else 'offline'::public.worker_status end,
        updated_at = now()
    where id = new.worker_id;
  else
    update public.worker_profiles
    set is_verified = false,
        worker_status = case when worker_status = 'suspended'::public.worker_status then worker_status else 'offline'::public.worker_status end,
        current_location = null,
        updated_at = now()
    where id = new.worker_id;

    update public.worker_presence
    set is_available = false,
        expires_at = now(),
        updated_at = now()
    where worker_id = new.worker_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."sync_worker_application_operational_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_worker_location_geometry"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  new.location := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326)::geography;
  new.recorded_at := coalesce(new.recorded_at, now());
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_worker_location_geometry"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tempstaff_worker_notification_push"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret
  INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'tempstaff_worker_push_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING
      'TempStaff worker push secret is not configured';

    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url :=
        'https://gfzlsxlevzezfjoaaghb.supabase.co/functions/v1/send-worker-push',

      body :=
        jsonb_build_object(
          'type',
          'INSERT',

          'table',
          'notifications',

          'schema',
          'public',

          'record',
          jsonb_build_object(
            'id',
            NEW.id,

            'user_id',
            NEW.user_id,

            'booking_id',
            NEW.booking_id,

            'booking_worker_offer_id',

            NEW.booking_worker_offer_id,

            'title',
            NEW.title,

            'message',
            NEW.message,

            'notification_type',
            NEW.notification_type,

            'created_at',
            NEW.created_at
          ),

          'old_record',
          NULL
        ),

      params :=
        '{}'::jsonb,

      headers :=
        jsonb_build_object(
          'Content-Type',
          'application/json',

          'apikey',
          v_secret
        ),

      timeout_milliseconds := 5000
    );

  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING
        'TempStaff push dispatch failed: %',
        SQLERRM;
  END;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tempstaff_worker_notification_push"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_booking_occurrence_state"("p_occurrence_id" "uuid", "p_new_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_occ public.booking_schedule_occurrences%rowtype;
  v_booking public.bookings%rowtype;
  v_old_status text;
  v_is_admin boolean := false;
  v_is_worker boolean := false;
  v_is_customer boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_occurrence_id is null then raise exception 'Occurrence ID is required'; end if;
  if p_new_status not in ('scheduled','assigned','on_the_way','arrived','in_progress','completed','cancelled') then
    raise exception 'Invalid occurrence status';
  end if;

  select * into v_occ
  from public.booking_schedule_occurrences
  where id = p_occurrence_id
  for update;
  if not found then raise exception 'Occurrence not found'; end if;

  select * into v_booking
  from public.bookings
  where id = v_occ.booking_id
  for update;

  v_old_status := v_occ.status;
  v_is_admin := public.is_admin();
  v_is_customer := v_booking.customer_id = auth.uid();
  v_is_worker := v_occ.worker_id = auth.uid();

  if v_old_status = p_new_status then
    return jsonb_build_object('success',true,'occurrence_id',v_occ.id,'status',v_old_status,'transitioned',false);
  end if;

  if p_new_status = 'cancelled' then
    if not (v_is_admin or v_is_customer or v_is_worker) then
      raise exception 'Occurrence access denied';
    end if;
    if v_old_status in ('completed','cancelled','in_progress','arrived','on_the_way') and not (v_is_admin or v_is_worker) then
      raise exception 'Customer cannot cancel an active or completed occurrence';
    end if;
    update public.booking_schedule_occurrences
    set status = 'cancelled', updated_at = now()
    where id = v_occ.id;
    return jsonb_build_object('success',true,'occurrence_id',v_occ.id,'old_status',v_old_status,'status','cancelled','transitioned',true);
  end if;

  if not (v_is_admin or v_is_worker) then
    raise exception 'Worker access required';
  end if;

  if p_new_status = 'on_the_way' and v_old_status <> 'assigned' then
    raise exception 'Occurrence must be assigned before travelling';
  end if;
  if p_new_status = 'arrived' and v_old_status <> 'on_the_way' then
    raise exception 'Occurrence must be on the way before arrival';
  end if;
  if p_new_status = 'in_progress' or p_new_status = 'completed' then
    raise exception 'Occurrence start and completion require OTP verification';
  end if;
  if p_new_status = 'assigned' and v_occ.worker_id is null then
    raise exception 'Assigned occurrence requires a worker';
  end if;

  update public.booking_schedule_occurrences
  set status = p_new_status,
      journey_started_at = case when p_new_status = 'on_the_way' and journey_started_at is null then now() else journey_started_at end,
      arrived_at = case when p_new_status = 'arrived' and arrived_at is null then now() else arrived_at end,
      updated_at = now()
  where id = v_occ.id;

  return jsonb_build_object('success',true,'occurrence_id',v_occ.id,'old_status',v_old_status,'status',p_new_status,'transitioned',true);
end;
$$;


ALTER FUNCTION "public"."transition_booking_occurrence_state"("p_occurrence_id" "uuid", "p_new_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transition_booking_state"("p_booking_id" "uuid", "p_new_status" "public"."booking_status", "p_worker_id" "uuid" DEFAULT NULL::"uuid", "p_set_worker" boolean DEFAULT false, "p_clear_worker" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_old_status public.booking_status;
  v_old_worker_id uuid;
  v_allowed boolean := false;
  v_has_active_booking boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_booking_id is null then
    raise exception 'Booking ID is required';
  end if;

  if p_new_status is null then
    raise exception 'New booking status is required';
  end if;

  if p_set_worker and p_worker_id is null then
    raise exception 'Worker ID is required when assigning a worker';
  end if;

  if p_set_worker and p_clear_worker then
    raise exception 'Cannot set and clear worker at the same time';
  end if;

  select *
  into v_booking
  from public.bookings
  where id=p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  v_old_status:=v_booking.status;
  v_old_worker_id:=v_booking.worker_id;

  if v_old_status=p_new_status then
    if p_set_worker and v_booking.worker_id is distinct from p_worker_id then
      update public.bookings
      set worker_id=p_worker_id, updated_at=now()
      where id=v_booking.id;
    elsif p_clear_worker and v_booking.worker_id is not null then
      update public.bookings
      set worker_id=null, updated_at=now()
      where id=v_booking.id;
    end if;

    if p_clear_worker and v_old_worker_id is not null then
      perform public.reconcile_worker_assignment_presence(v_old_worker_id);
    end if;

    select *
    into v_booking
    from public.bookings
    where id=p_booking_id;

    return jsonb_build_object(
      'success',true,
      'booking_id',v_booking.id,
      'old_status',v_old_status::text,
      'status',v_booking.status::text,
      'worker_id',v_booking.worker_id,
      'transitioned',false
    );
  end if;

  v_allowed :=
       (v_old_status='pending_payment' and p_new_status in ('paid','payment_failed','cancelled'))
    or (v_old_status='payment_failed' and p_new_status in ('paid','cancelled'))
    or (v_old_status='paid' and p_new_status in ('searching_worker','assigned','cancelled'))
    or (v_old_status='searching_worker' and p_new_status in ('assigned','cancelled'))
    or (v_old_status='assigned' and p_new_status in ('searching_worker','on_the_way','cancelled'))
    or (v_old_status='on_the_way' and p_new_status in ('arrived','cancelled'))
    or (v_old_status='arrived' and p_new_status in ('in_progress','cancelled'))
    or (v_old_status='in_progress' and p_new_status in ('completed','cancelled'));

  if not v_allowed then
    raise exception
      'Invalid booking state transition: % -> %',
      v_old_status::text,
      p_new_status::text;
  end if;

  if p_new_status='assigned' then
    if not p_set_worker and v_booking.worker_id is null then
      raise exception 'Assigned booking requires a worker';
    end if;
  end if;

  if p_new_status='searching_worker'
     and not p_clear_worker
     and v_booking.worker_id is not null then
    raise exception
      'Searching worker booking cannot retain an assigned worker';
  end if;

  if p_set_worker then
    update public.bookings
    set worker_id=p_worker_id,
        status=p_new_status,
        updated_at=now()
    where id=v_booking.id;
  elsif p_clear_worker then
    update public.bookings
    set worker_id=null,
        status=p_new_status,
        updated_at=now()
    where id=v_booking.id;
  else
    update public.bookings
    set status=p_new_status,
        updated_at=now()
    where id=v_booking.id;
  end if;

  if p_new_status='on_the_way' then
    update public.bookings
    set journey_started_at=coalesce(journey_started_at,now()),
        journey_started_by=coalesce(journey_started_by,auth.uid()),
        updated_at=now()
    where id=v_booking.id;
  elsif p_new_status='arrived' then
    update public.bookings
    set arrived_at=coalesce(arrived_at,now()),
        updated_at=now()
    where id=v_booking.id;
  elsif p_new_status='in_progress' then
    update public.bookings
    set started_at=coalesce(started_at,now()),
        started_by=coalesce(started_by,auth.uid()),
        updated_at=now()
    where id=v_booking.id;
  elsif p_new_status='completed' then
    update public.bookings
    set completed_at=coalesce(completed_at,now()),
        updated_at=now()
    where id=v_booking.id;
  end if;

  /*
   * Scheduled bookings may have a legacy occurrence for compatibility.
   * Recurring occurrences remain independently authoritative.
   */
  if v_booking.fulfillment_type='scheduled'::public.booking_fulfillment_type then
    update public.booking_schedule_occurrences
    set
      status=case
        when p_new_status='assigned' then 'assigned'
        when p_new_status='on_the_way' then 'on_the_way'
        when p_new_status='arrived' then 'arrived'
        when p_new_status='in_progress' then 'in_progress'
        when p_new_status='completed' then 'completed'
        when p_new_status='searching_worker' then 'scheduled'
        else status
      end,
      journey_started_at=case
        when p_new_status='on_the_way' then coalesce(journey_started_at,now())
        else journey_started_at
      end,
      arrived_at=case
        when p_new_status='arrived' then coalesce(arrived_at,now())
        else arrived_at
      end,
      started_at=case
        when p_new_status='in_progress' then coalesce(started_at,now())
        else started_at
      end,
      completed_at=case
        when p_new_status='completed' then coalesce(completed_at,now())
        else completed_at
      end,
      updated_at=now()
    where booking_id=v_booking.id
      and status not in ('cancelled','expired');
  end if;

  /*
   * Terminal cancellation invalidates every outstanding worker offer.
   */
  if p_new_status='cancelled'::public.booking_status then
    update public.booking_worker_offers
    set
      status='cancelled',
      responded_at=coalesce(responded_at,now()),
      updated_at=now()
    where booking_id=v_booking.id
      and status='pending';
  end if;

  if p_clear_worker and v_old_worker_id is not null then
    perform public.reconcile_worker_assignment_presence(v_old_worker_id);
  end if;

  insert into public.booking_status_history(
    booking_id,
    old_status,
    new_status,
    changed_by,
    created_at
  )
  values(
    v_booking.id,
    v_old_status,
    p_new_status,
    auth.uid(),
    now()
  );

  select *
  into v_booking
  from public.bookings
  where id=p_booking_id;

  return jsonb_build_object(
    'success',true,
    'booking_id',v_booking.id,
    'old_status',v_old_status::text,
    'status',v_booking.status::text,
    'worker_id',v_booking.worker_id,
    'transitioned',true
  );
end;
$$;


ALTER FUNCTION "public"."transition_booking_state"("p_booking_id" "uuid", "p_new_status" "public"."booking_status", "p_worker_id" "uuid", "p_set_worker" boolean, "p_clear_worker" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_auto_assign_on_worker_location"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_auto_assign_on_worker_location"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_auto_assign_waiting_scheduled_bookings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_auto_assign_waiting_scheduled_bookings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_auto_dispatch_on_worker_location"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.booking_id is null then
    perform public.auto_dispatch_waiting_bookings_for_worker(new.worker_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_auto_dispatch_on_worker_location"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_auto_dispatch_waiting_bookings_for_worker"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.auto_dispatch_waiting_bookings_for_worker(new.worker_id);
  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_auto_dispatch_waiting_bookings_for_worker"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_idempotency_keys_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog'
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_idempotency_keys_updated_at"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "worker_id" "uuid",
    "service_id" "uuid" NOT NULL,
    "address_id" "uuid" NOT NULL,
    "status" "public"."booking_status" DEFAULT 'pending_payment'::"public"."booking_status" NOT NULL,
    "duration_value" integer NOT NULL,
    "duration_unit" "public"."booking_duration_unit" NOT NULL,
    "scheduled_start" timestamp with time zone NOT NULL,
    "scheduled_end" timestamp with time zone NOT NULL,
    "base_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "platform_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fulfillment_type" "public"."booking_fulfillment_type" DEFAULT 'scheduled'::"public"."booking_fulfillment_type" NOT NULL,
    "worker_accepted_at" timestamp with time zone,
    "service_variant_id" "uuid" NOT NULL,
    "schedule_start_date" "date",
    "schedule_end_date" "date",
    "daily_start_time" time without time zone,
    "daily_end_time" time without time zone,
    "selected_weekdays" smallint[],
    "off_dates" "date"[],
    "total_working_hours" numeric(12,2),
    "pricing_snapshot" "jsonb",
    "journey_started_at" timestamp with time zone,
    "journey_started_by" "uuid",
    "arrived_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "started_by" "uuid",
    "start_otp_verified_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "end_otp_verified_at" timestamp with time zone,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "applied_promotion_id" "uuid",
    CONSTRAINT "bookings_amounts_reconcile" CHECK (("total_amount" = "round"((("base_amount" + "platform_fee") + "tax_amount"), 2))),
    CONSTRAINT "bookings_minimum_duration" CHECK (("scheduled_end" >= ("scheduled_start" + '01:00:00'::interval))),
    CONSTRAINT "bookings_schedule_dates_check" CHECK ((("schedule_start_date" IS NULL) OR ("schedule_end_date" IS NULL) OR ("schedule_end_date" >= "schedule_start_date"))),
    CONSTRAINT "bookings_schedule_times_check" CHECK ((("daily_start_time" IS NULL) OR ("daily_end_time" IS NULL) OR ("daily_end_time" > "daily_start_time"))),
    CONSTRAINT "bookings_selected_weekdays_check" CHECK ((("selected_weekdays" IS NULL) OR ((("cardinality"("selected_weekdays") >= 1) AND ("cardinality"("selected_weekdays") <= 7)) AND ("selected_weekdays" <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint])))),
    CONSTRAINT "bookings_tax_amount_nonnegative" CHECK (("tax_amount" >= (0)::numeric))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_worker_booking_status"("p_booking_id" "uuid", "p_status" "public"."booking_status") RETURNS "public"."bookings"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings;
  v_has_active_booking boolean;
  v_platform_fee numeric;
begin
  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
    and worker_id = auth.uid();

  if not found then
    raise exception
      'Booking not found or worker is not assigned to this booking.';
  end if;

  if v_booking.status = 'paid'
     and p_status = 'assigned'::public.booking_status then
    null;

  elsif v_booking.status = 'assigned'
     and p_status in (
       'on_the_way'::public.booking_status,
       'cancelled'::public.booking_status
     ) then
    null;

  elsif v_booking.status = 'on_the_way'
     and p_status in (
       'arrived'::public.booking_status,
       'cancelled'::public.booking_status
     ) then
    null;

  elsif v_booking.status = 'arrived'
     and p_status = 'in_progress'::public.booking_status then
    null;

  elsif v_booking.status = 'in_progress'
     and p_status = 'completed'::public.booking_status then
    null;

  else
    raise exception
      'Invalid worker status transition from % to %.',
      v_booking.status,
      p_status;
  end if;

  update public.bookings
  set status = p_status,
      updated_at = now()
  where id = p_booking_id
    and worker_id = auth.uid()
  returning *
  into v_booking;

  if p_status = 'completed'::public.booking_status then
    v_platform_fee := coalesce(v_booking.platform_fee, 0);

    insert into public.worker_earnings (
      worker_id,
      booking_id,
      gross_amount,
      platform_fee,
      net_amount
    )
    select
      v_booking.worker_id,
      v_booking.id,
      v_booking.total_amount,
      v_platform_fee,
      v_booking.total_amount - v_platform_fee
    where not exists (
      select 1
      from public.worker_earnings
      where booking_id = v_booking.id
    );
  end if;

  if p_status in (
    'assigned'::public.booking_status,
    'on_the_way'::public.booking_status,
    'arrived'::public.booking_status,
    'in_progress'::public.booking_status
  ) then
    perform public.reconcile_worker_assignment_presence(auth.uid());
  end if;

  if p_status in (
    'completed'::public.booking_status,
    'cancelled'::public.booking_status
  ) then
    perform public.reconcile_worker_assignment_presence(auth.uid());
  end if;

  return v_booking;
end;
$$;


ALTER FUNCTION "public"."update_worker_booking_status"("p_booking_id" "uuid", "p_status" "public"."booking_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_booking_occurrence_lifecycle"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.status = 'completed' and (new.completed_at is null or new.end_otp_verified_at is null or new.started_at is null or new.start_otp_verified_at is null) then
    raise exception 'Completed occurrence requires start/end timestamps and OTP verification';
  end if;
  if new.status = 'in_progress' and (new.started_at is null or new.start_otp_verified_at is null) then
    raise exception 'In-progress occurrence requires start timestamp and Start OTP verification';
  end if;
  if new.status in ('on_the_way','arrived','in_progress','completed') and new.journey_started_at is null then
    raise exception 'Active occurrence requires journey start timestamp';
  end if;
  if new.status in ('arrived','in_progress','completed') and new.arrived_at is null then
    raise exception 'Arrived/in-progress/completed occurrence requires arrival timestamp';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_booking_occurrence_lifecycle"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_booking_operating_hours"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_start_text text;
  v_end_text text;
  v_timezone text;
  v_start_time time;
  v_end_time time;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  select value ->> 'value' into v_start_text
  from public.platform_settings
  where key = 'operations.default_start_time' and is_active = true
  limit 1;

  select value ->> 'value' into v_end_text
  from public.platform_settings
  where key = 'operations.default_end_time' and is_active = true
  limit 1;

  select value ->> 'value' into v_timezone
  from public.platform_settings
  where key = 'operations.timezone' and is_active = true
  limit 1;

  v_start_time := coalesce(v_start_text, '08:00:00')::time;
  v_end_time := coalesce(v_end_text, '22:00:00')::time;
  v_timezone := coalesce(nullif(trim(v_timezone), ''), 'Asia/Kolkata');

  if v_start_time >= v_end_time then
    raise exception 'Operating hours configuration must have start time before end time';
  end if;

  v_local_start := new.scheduled_start at time zone v_timezone;
  v_local_end := new.scheduled_end at time zone v_timezone;

  if v_local_start::time < v_start_time then
    raise exception 'Booking starts before configured operating hours';
  end if;

  if v_local_end::time > v_end_time then
    raise exception 'Booking ends after configured operating hours';
  end if;

  if new.duration_unit = 'hour'::public.booking_duration_unit
     and v_local_start::date = v_local_end::date
     and v_local_end::time <= v_local_start::time then
    raise exception 'Booking cannot cross midnight under current operating-hours configuration';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_booking_operating_hours"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_booking_service_variant_consistency"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_variant_service_id uuid;
begin
  if new.service_variant_id is null or new.service_id is null then
    raise exception 'Booking service and service variant are required';
  end if;

  select sv.service_id
    into v_variant_service_id
  from public.service_variants sv
  where sv.id = new.service_variant_id;

  if v_variant_service_id is null then
    raise exception 'Booking service variant not found';
  end if;

  if v_variant_service_id is distinct from new.service_id then
    raise exception 'Booking service does not match the selected service variant';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_booking_service_variant_consistency"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_booking_worker_state"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if new.status in (
    'assigned'::public.booking_status,
    'on_the_way'::public.booking_status,
    'arrived'::public.booking_status,
    'in_progress'::public.booking_status
  ) and new.worker_id is null then
    raise exception 'Active booking state requires a worker';
  end if;

  if new.status in (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status,
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  ) and new.worker_id is not null then
    raise exception 'Unassigned booking state cannot retain a worker';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_booking_worker_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_customer_company_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.role = 'customer'::public.user_role
     and nullif(trim(new.company_name), '') is null then
    raise exception 'Company name is required for customer accounts';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_customer_company_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_hourly_price_period"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_service_id uuid := new.service_id;
begin
  if new.is_active then
    perform pg_advisory_xact_lock(hashtextextended('hourly-price:' || v_service_id::text, 0));
    if exists (
      select 1
      from public.service_hourly_prices p
      where p.service_id = v_service_id
        and p.id <> new.id
        and p.is_active
        and p.effective_from < coalesce(new.effective_to, 'infinity'::timestamptz)
        and new.effective_from < coalesce(p.effective_to, 'infinity'::timestamptz)
    ) then
      raise exception 'Active hourly price periods for a service cannot overlap';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_hourly_price_period"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_near_term_booking_occurrence_worker"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_timezone text;
  v_tomorrow date;
begin
  select *
  into v_booking
  from public.bookings
  where id = new.booking_id;

  if not found then
    raise exception 'Parent booking is required';
  end if;

  if v_booking.fulfillment_type <> 'scheduled'::public.booking_fulfillment_type then
    return new;
  end if;

  select coalesce(
    nullif(trim(value->>'value'), ''),
    'Asia/Kolkata'
  )
  into v_timezone
  from public.platform_settings
  where key = 'operations.timezone'
    and is_active = true
  order by updated_at desc
  limit 1;

  v_timezone := coalesce(v_timezone, 'Asia/Kolkata');
  v_tomorrow := (now() at time zone v_timezone)::date + 1;

  if new.occurrence_date < v_tomorrow then
    raise exception
      'Scheduled booking occurrence must start tomorrow or later';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_near_term_booking_occurrence_worker"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_near_term_scheduled_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_timezone text;
  v_local_start date;
  v_tomorrow date;
begin
  if new.fulfillment_type <> 'scheduled'::public.booking_fulfillment_type then
    return new;
  end if;

  if new.scheduled_start is null or new.scheduled_end is null then
    raise exception 'Scheduled booking times are required';
  end if;

  select coalesce(
    nullif(trim(value->>'value'),''),
    'Asia/Kolkata'
  )
  into v_timezone
  from public.platform_settings
  where key='operations.timezone'
    and is_active=true
  order by updated_at desc
  limit 1;

  v_timezone:=coalesce(v_timezone,'Asia/Kolkata');

  v_local_start:=new.scheduled_start at time zone v_timezone;
  v_tomorrow:=(now() at time zone v_timezone)::date+1;

  if v_local_start < v_tomorrow then
    raise exception
      'Scheduled booking must start tomorrow or later';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_near_term_scheduled_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_occurrence_assignment_consistency"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_parent_worker uuid;
begin
  select worker_id into v_parent_worker from public.bookings where id=new.booking_id;
  if new.status not in ('cancelled','expired')
     and v_parent_worker is not null
     and new.worker_id is distinct from v_parent_worker then
    raise exception 'Occurrence worker must match parent booking worker';
  end if;
  if new.worker_id is null and new.status in ('assigned','on_the_way','arrived','in_progress') then
    raise exception 'Active occurrence requires a worker';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_occurrence_assignment_consistency"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_occurrence_matches_parent_schedule"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_timezone text;
  v_local_start timestamp;
  v_local_end timestamp;
begin
  if new.booking_id is null then
    raise exception 'Occurrence booking_id is required';
  end if;

  if new.occurrence_index is null or new.occurrence_index < 1 then
    raise exception 'Occurrence index must be at least 1';
  end if;

  select * into v_booking
  from public.bookings
  where id = new.booking_id;

  if not found then
    raise exception 'Parent booking not found';
  end if;

  if v_booking.schedule_start_date is null
     or v_booking.schedule_end_date is null
     or v_booking.daily_start_time is null
     or v_booking.daily_end_time is null
     or v_booking.selected_weekdays is null then
    raise exception 'Occurrence requires a recurring parent booking';
  end if;

  if new.occurrence_date < v_booking.schedule_start_date
     or new.occurrence_date > v_booking.schedule_end_date then
    raise exception 'Occurrence date must remain inside the parent schedule range';
  end if;

  if not (extract(dow from new.occurrence_date)::smallint = any(v_booking.selected_weekdays)) then
    raise exception 'Occurrence weekday must match the parent recurring schedule';
  end if;

  if v_booking.off_dates is not null and new.occurrence_date = any(v_booking.off_dates) then
    raise exception 'Occurrence date cannot be an off date in the parent recurring schedule';
  end if;

  select coalesce(nullif(trim(value->>'value'),''),'Asia/Kolkata')
    into v_timezone
  from public.platform_settings
  where key='operations.timezone' and is_active=true
  order by updated_at desc
  limit 1;

  v_timezone := coalesce(v_timezone,'Asia/Kolkata');
  v_local_start := new.scheduled_start at time zone v_timezone;
  v_local_end := new.scheduled_end at time zone v_timezone;

  if v_local_start::date is distinct from new.occurrence_date
     or v_local_end::date is distinct from new.occurrence_date then
    raise exception 'Occurrence timestamps must use the occurrence date';
  end if;

  if v_local_start::time is distinct from v_booking.daily_start_time
     or v_local_end::time is distinct from v_booking.daily_end_time then
    raise exception 'Occurrence timestamps must match the parent recurring daily times';
  end if;

  if new.scheduled_end <= new.scheduled_start then
    raise exception 'Occurrence end must be after occurrence start';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_occurrence_matches_parent_schedule"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_occurrence_worker_matches_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking_worker uuid;
begin
  select worker_id into v_booking_worker
  from public.bookings
  where id = new.booking_id;

  if new.status not in ('cancelled','expired')
     and v_booking_worker is not null
     and new.worker_id is distinct from v_booking_worker then
    raise exception 'Recurring booking occurrences must use the parent booking worker';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_occurrence_worker_matches_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_payment_amount_against_booking"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
begin
  if new.booking_id is null then
    raise exception 'Payment booking ID is required';
  end if;

  select * into v_booking
  from public.bookings
  where id = new.booking_id;

  if not found then
    raise exception 'Payment booking not found';
  end if;

  if new.amount is null or new.amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;

  if round(new.amount, 2) <> round(v_booking.total_amount, 2) then
    raise exception 'Payment amount must match booking total amount';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_payment_amount_against_booking"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_recurring_booking_horizon"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_max_days integer;
  v_horizon integer;
begin
  if new.fulfillment_type = 'recurring'::public.booking_fulfillment_type then
    if new.schedule_start_date is null or new.schedule_end_date is null then
      raise exception 'Recurring booking dates are required';
    end if;

    v_max_days := public.get_recurring_booking_max_horizon_days();
    v_horizon := new.schedule_end_date - new.schedule_start_date;

    if v_horizon > v_max_days then
      raise exception
        'Recurring booking exceeds the maximum booking horizon of % days',
        v_max_days;
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_recurring_booking_horizon"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_service_area_radius"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.radius_km <= 0 or new.radius_km > 10 then
    raise exception 'Service area radius must be greater than 0 and at most 10 km';
  end if;
  if new.center_latitude < -90 or new.center_latitude > 90 or new.center_longitude < -180 or new.center_longitude > 180 then
    raise exception 'Invalid service area coordinates';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_service_area_radius"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_service_booking_schedule_policy"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ begin if not exists (select 1 from pg_timezone_names where name = new.timezone) then raise exception 'Invalid IANA timezone: %', new.timezone; end if; if new.working_weekdays is null or cardinality(new.working_weekdays) < 1 or cardinality(new.working_weekdays) > 7 then raise exception 'Working weekdays must contain 1 to 7 days'; end if; if not (new.working_weekdays <@ ARRAY[0,1,2,3,4,5,6]::smallint[]) then raise exception 'Working weekdays contain an invalid day'; end if; if cardinality(new.working_weekdays) <> (select count(distinct x) from unnest(new.working_weekdays) as u(x)) then raise exception 'Working weekdays cannot contain duplicates'; end if; return new; end; $$;


ALTER FUNCTION "public"."validate_service_booking_schedule_policy"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_variant_price_period"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_variant_id uuid := new.service_variant_id;
begin
  if new.is_active then
    perform pg_advisory_xact_lock(hashtextextended('variant-price:' || v_variant_id::text, 0));
    if exists (
      select 1
      from public.service_variant_prices p
      where p.service_variant_id = v_variant_id
        and p.id <> new.id
        and p.is_active
        and p.effective_from < coalesce(new.effective_to, 'infinity'::timestamptz)
        and new.effective_from < coalesce(p.effective_to, 'infinity'::timestamptz)
    ) then
      raise exception 'Active price periods for a service variant cannot overlap';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_variant_price_period"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_worker_document_integrity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_application_worker uuid;
  v_role public.user_role;
  v_path_parts text[];
  v_max_bytes bigint := 10485760;
begin
  select p.role into v_role from public.profiles p where p.id = new.worker_id;
  if v_role is distinct from 'worker'::public.user_role then
    raise exception 'Worker document owner must have worker role';
  end if;

  select a.worker_id into v_application_worker
  from public.worker_applications a
  where a.id = new.application_id;
  if v_application_worker is null then
    raise exception 'Worker application not found';
  end if;
  if v_application_worker is distinct from new.worker_id then
    raise exception 'Worker document application owner mismatch';
  end if;

  if btrim(coalesce(new.file_name,'')) = '' then
    raise exception 'Document file name is required';
  end if;
  if btrim(coalesce(new.file_path,'')) = '' then
    raise exception 'Document file path is required';
  end if;
  if new.file_size is null or new.file_size < 0 or new.file_size > v_max_bytes then
    raise exception 'Document file size is invalid';
  end if;
  if new.mime_type is null or new.mime_type not in ('image/jpeg','image/png','application/pdf') then
    raise exception 'Unsupported document MIME type';
  end if;

  v_path_parts := string_to_array(new.file_path, '/');
  if coalesce(array_length(v_path_parts,1),0) < 3
     or v_path_parts[1] <> new.worker_id::text
     or v_path_parts[2] <> new.document_type::text then
    raise exception 'Document file path must be worker_id/document_type/file';
  end if;

  if new.status = 'pending'::public.worker_document_status then
    if new.reviewed_at is not null or new.reviewed_by is not null or new.rejection_reason is not null then
      raise exception 'Pending document cannot contain review metadata';
    end if;
  elsif new.status = 'approved'::public.worker_document_status then
    if new.reviewed_at is null or new.reviewed_by is null or new.rejection_reason is not null then
      raise exception 'Approved document review metadata is invalid';
    end if;
  elsif new.status = 'rejected'::public.worker_document_status then
    if new.reviewed_at is null or new.reviewed_by is null then
      raise exception 'Rejected document requires review metadata';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_worker_document_integrity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_worker_earnings_integrity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_worker_id uuid;
  v_total numeric;
  v_platform_fee numeric;
  v_booking_status booking_status;
begin
  if new.worker_id is null or new.booking_id is null then
    raise exception 'Worker earnings require worker and booking';
  end if;

  select b.worker_id, b.total_amount, b.platform_fee, b.status
  into v_worker_id, v_total, v_platform_fee, v_booking_status
  from public.bookings b
  where b.id = new.booking_id
  for share;

  if not found then
    raise exception 'Booking not found for worker earnings';
  end if;

  if v_worker_id is null or v_worker_id <> new.worker_id then
    raise exception 'Worker earnings worker does not match booking worker';
  end if;

  if v_booking_status <> 'completed'::public.booking_status then
    raise exception 'Worker earnings can only be created for completed bookings';
  end if;

  if new.gross_amount is null or new.gross_amount < 0 then
    raise exception 'Invalid gross earnings amount';
  end if;

  if new.platform_fee is null or new.platform_fee < 0 then
    raise exception 'Invalid platform fee amount';
  end if;

  if new.net_amount is null or new.net_amount < 0 then
    raise exception 'Invalid net earnings amount';
  end if;

  if new.gross_amount <> v_total then
    raise exception 'Gross earnings must equal booking total';
  end if;

  if new.platform_fee <> coalesce(v_platform_fee, 0) then
    raise exception 'Earnings platform fee must equal booking platform fee';
  end if;

  if new.net_amount <> new.gross_amount - new.platform_fee then
    raise exception 'Net earnings do not reconcile';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_worker_earnings_integrity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_worker_operational_configuration"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Operational worker configuration requires an active worker account';
  end if;

  if tg_table_name = 'worker_services' then
    if not exists (select 1 from public.services s where s.id = new.service_id and s.is_active = true) then
      raise exception 'Worker service must reference an active service';
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_worker_operational_configuration"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_worker_profile_owner_role"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.id <> auth.uid() then
      raise exception 'Worker profile must belong to the authenticated account';
    end if;

    if not exists (
      select 1
      from public.profiles p
      where p.id = new.id
        and p.role = 'worker'::public.user_role
        and p.is_active = true
    ) then
      raise exception 'Worker profile requires an active worker account';
    end if;

    -- Workers start from a safe baseline. Verification, presence, location,
    -- radius, rating, counters and featured status are controlled elsewhere.
    new.is_verified := false;
    new.worker_status := 'offline'::public.worker_status;
    new.service_radius_km := 10;
    new.current_location := null;
    new.is_featured := false;
    new.rating := 0;
    new.total_completed_jobs := 0;
    return new;
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = new.id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker profile requires an active worker account';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_worker_profile_owner_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_worker_schedule_operating_window"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_start_text text;
  v_end_text text;
  v_start time;
  v_end time;
  v_default_start time := '08:00';
  v_default_end time := '22:00';
begin
  /*
   * Exception rows with type "unavailable" may represent a full-day
   * block and therefore do not need the operating-window check.
   *
   * Keep this table-specific field access inside the exception branch.
   * The same validator is also attached to worker_weekly_schedules,
   * which does not have exception_type.
   */
  if tg_table_name = 'worker_schedule_exceptions' then
    if new.exception_type <> 'available' then
      return new;
    end if;
  end if;

  select value->>'value'
    into v_start_text
  from public.platform_settings
  where key = 'operations.default_start_time'
    and is_active = true
  order by updated_at desc
  limit 1;

  select value->>'value'
    into v_end_text
  from public.platform_settings
  where key = 'operations.default_end_time'
    and is_active = true
  order by updated_at desc
  limit 1;

  begin
    if v_start_text is not null then
      v_start := v_start_text::time;
    end if;
  exception when others then
    v_start := v_default_start;
  end;

  begin
    if v_end_text is not null then
      v_end := v_end_text::time;
    end if;
  exception when others then
    v_end := v_default_end;
  end;

  v_start := coalesce(v_start, v_default_start);
  v_end := coalesce(v_end, v_default_end);

  if v_start >= v_end then
    raise exception 'Operating hours configuration is invalid';
  end if;

  /*
   * Unavailable full-day exceptions can have null times.
   * Available exceptions and weekly schedule rows must have
   * valid times to reach this validation.
   */
  if new.start_time is null or new.end_time is null then
    return new;
  end if;

  if new.start_time < v_start or new.end_time > v_end then
    raise exception
      'Worker schedule must remain within configured operating hours (% to %)',
      v_start,
      v_end;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_worker_schedule_operating_window"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_worker_schedule_settings_integrity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker schedule settings require an active worker account';
  end if;

  if not exists (
    select 1 from pg_timezone_names tz where tz.name = new.timezone
  ) then
    raise exception 'Worker schedule timezone must be a valid IANA timezone';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_worker_schedule_settings_integrity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_worker_service_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.worker_id
      and p.role = 'worker'::public.user_role
  ) then
    raise exception 'Worker service assignments require a worker profile owner';
  end if;

  if not exists (
    select 1
    from public.worker_profiles wp
    where wp.id = new.worker_id
  ) then
    raise exception 'Worker service assignments require a worker profile';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."validate_worker_service_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_worker_weekly_schedule_overlap"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.is_active then
    if exists (
      select 1
      from public.worker_weekly_schedules w
      where w.worker_id = new.worker_id
        and w.day_of_week = new.day_of_week
        and w.is_active = true
        and w.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
        and new.start_time < w.end_time
        and new.end_time > w.start_time
    ) then
      raise exception 'Worker weekly schedule windows cannot overlap on the same day';
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_worker_weekly_schedule_overlap"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_booking_occurrence_otp_atomic"("p_occurrence_id" "uuid", "p_otp_type" "text", "p_otp_hash" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  v_occurrence_booking_id uuid;
  v_occ public.booking_schedule_occurrences%rowtype;
  v_booking public.bookings%rowtype;
  v_otp public.booking_otps%rowtype;
  v_new_status text;
  v_actor uuid := auth.uid();
  v_has_active boolean := false;
  v_has_remaining boolean := false;
  v_completed_gross numeric := 0;
  v_completed_platform_fee numeric := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.worker_profiles wp ON wp.id = p.id
    WHERE p.id = v_actor
      AND p.role = 'worker'::public.user_role
      AND p.is_active = true
      AND wp.is_verified = true
      AND wp.worker_status <> 'suspended'::public.worker_status
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker account is not active and verified');
  END IF;

  IF p_occurrence_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Occurrence ID is required');
  END IF;

  IF lower(trim(p_otp_type)) NOT IN ('start', 'end') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP type');
  END IF;

  IF p_otp_hash IS NULL
     OR length(trim(p_otp_hash)) <> 64
     OR p_otp_hash !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP hash');
  END IF;

  -- Lock the parent before the occurrence so this flow agrees with
  -- customer cancellation, series cancellation, and admin occurrence actions.
  SELECT booking_id
  INTO v_occurrence_booking_id
  FROM public.booking_schedule_occurrences
  WHERE id = p_occurrence_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Occurrence not found');
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = v_occurrence_booking_id
    AND worker_id = v_actor
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker is not assigned to this occurrence');
  END IF;

  SELECT *
  INTO v_occ
  FROM public.booking_schedule_occurrences
  WHERE id = p_occurrence_id
    AND booking_id = v_booking.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Occurrence not found or its parent changed');
  END IF;

  IF v_occ.worker_id IS DISTINCT FROM v_actor THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker is not assigned to this occurrence');
  END IF;

  IF v_booking.fulfillment_type <> 'recurring'::public.booking_fulfillment_type THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recurring booking occurrence is required for occurrence OTP verification');
  END IF;

  IF lower(trim(p_otp_type)) = 'start' THEN
    IF v_occ.status <> 'arrived' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Occurrence must be arrived before start OTP verification');
    END IF;
    v_new_status := 'in_progress';
  ELSE
    IF v_occ.status <> 'in_progress' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Occurrence must be in progress before end OTP verification');
    END IF;
    v_new_status := 'completed';
  END IF;

  SELECT *
  INTO v_otp
  FROM public.booking_otps
  WHERE occurrence_id = p_occurrence_id
    AND otp_type = lower(trim(p_otp_type))::public.otp_type
    AND status = 'pending'::public.otp_status
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired OTP');
  END IF;

  IF COALESCE(v_otp.attempts, 0) >= 5 THEN
    UPDATE public.booking_otps
    SET status = 'expired'::public.otp_status
    WHERE id = v_otp.id;
    RETURN jsonb_build_object('success', false, 'error', 'OTP has been locked after too many attempts');
  END IF;

  IF v_otp.expires_at IS NOT NULL AND v_otp.expires_at <= now() THEN
    UPDATE public.booking_otps
    SET status = 'expired'::public.otp_status
    WHERE id = v_otp.id;
    RETURN jsonb_build_object('success', false, 'error', 'OTP has expired. Please generate a new OTP.');
  END IF;

  IF lower(v_otp.otp_hash) <> lower(trim(p_otp_hash)) THEN
    UPDATE public.booking_otps
    SET attempts = COALESCE(attempts, 0) + 1,
        status = CASE
          WHEN COALESCE(attempts, 0) + 1 >= 5
          THEN 'expired'::public.otp_status
          ELSE status
        END
    WHERE id = v_otp.id
      AND status = 'pending'::public.otp_status;

    RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP');
  END IF;

  UPDATE public.booking_otps
  SET status = 'verified'::public.otp_status,
      verified_at = now()
  WHERE id = v_otp.id
    AND status = 'pending'::public.otp_status;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP has already been used');
  END IF;

  UPDATE public.booking_schedule_occurrences
  SET status = v_new_status,
      started_at = CASE
        WHEN v_new_status = 'in_progress' THEN COALESCE(started_at, now())
        ELSE started_at
      END,
      completed_at = CASE
        WHEN v_new_status = 'completed' THEN COALESCE(completed_at, now())
        ELSE completed_at
      END,
      start_otp_verified_at = CASE
        WHEN lower(trim(p_otp_type)) = 'start' THEN now()
        ELSE start_otp_verified_at
      END,
      end_otp_verified_at = CASE
        WHEN lower(trim(p_otp_type)) = 'end' THEN now()
        ELSE end_otp_verified_at
      END,
      updated_at = now()
  WHERE id = v_occ.id;

  IF v_new_status = 'completed' THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.booking_schedule_occurrences o
      WHERE o.booking_id = v_occ.booking_id
        AND o.id <> v_occ.id
        AND o.status IN ('assigned', 'on_the_way', 'arrived', 'in_progress')
    )
    INTO v_has_active;

    SELECT EXISTS(
      SELECT 1
      FROM public.booking_schedule_occurrences o
      WHERE o.booking_id = v_occ.booking_id
        AND o.status NOT IN ('completed', 'cancelled')
    )
    INTO v_has_remaining;

    IF NOT v_has_remaining THEN
      SELECT COALESCE(SUM(o.total_amount), 0),
             COALESCE(SUM(o.platform_fee), 0)
      INTO v_completed_gross, v_completed_platform_fee
      FROM public.booking_schedule_occurrences o
      WHERE o.booking_id = v_booking.id
        AND o.status = 'completed';

      UPDATE public.bookings
      SET status = 'completed'::public.booking_status,
          completed_at = COALESCE(completed_at, now()),
          end_otp_verified_at = COALESCE(end_otp_verified_at, now()),
          updated_at = now()
      WHERE id = v_booking.id
        AND status NOT IN (
          'completed'::public.booking_status,
          'cancelled'::public.booking_status
        );

      INSERT INTO public.booking_status_history(
        booking_id, old_status, new_status, changed_by, created_at
      )
      SELECT v_booking.id, v_booking.status, 'completed'::public.booking_status, v_actor, now()
      WHERE v_booking.status IS DISTINCT FROM 'completed'::public.booking_status
        AND v_booking.status IS DISTINCT FROM 'cancelled'::public.booking_status;

      INSERT INTO public.worker_earnings(
        worker_id, booking_id, gross_amount, platform_fee, net_amount
      )
      SELECT v_booking.worker_id, v_booking.id, v_completed_gross,
             v_completed_platform_fee, v_completed_gross - v_completed_platform_fee
      WHERE v_booking.worker_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.worker_earnings we
          WHERE we.booking_id = v_booking.id
        );
    END IF;

    IF NOT v_has_active THEN
      PERFORM public.reconcile_worker_assignment_presence(v_actor);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'occurrence_id', v_occ.id,
    'booking_id', v_occ.booking_id,
    'otp_type', lower(trim(p_otp_type)),
    'status', v_new_status,
    'booking_completed', CASE
      WHEN v_new_status = 'completed' AND NOT v_has_remaining THEN true
      ELSE false
    END
  );
END;
$_$;


ALTER FUNCTION "public"."verify_booking_occurrence_otp_atomic"("p_occurrence_id" "uuid", "p_otp_type" "text", "p_otp_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_booking_otp_atomic"("p_booking_id" "uuid", "p_otp_type" "text", "p_otp_hash" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_booking public.bookings%rowtype;
  v_otp public.booking_otps%rowtype;
  v_new_status public.booking_status;
  v_has_active_booking boolean;
  v_platform_fee numeric;
  v_result jsonb;
  v_otp_type text := lower(trim(p_otp_type));
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Authentication required'
    );
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.worker_profiles wp on wp.id = p.id
    where p.id = auth.uid()
      and p.role = 'worker'::public.user_role
      and p.is_active = true
      and coalesce(wp.is_verified, false) = true
      and wp.worker_status <> 'suspended'::public.worker_status
  ) then
    return jsonb_build_object(
      'success', false,
      'error', 'Worker account is inactive, unverified, or suspended'
    );
  end if;

  if v_otp_type not in ('start','end') then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid OTP type'
    );
  end if;

  if p_otp_hash is null
     or length(trim(p_otp_hash)) <> 64
     or p_otp_hash !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid OTP hash'
    );
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
    and worker_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Booking not found or worker is not assigned'
    );
  end if;

  if v_booking.fulfillment_type='recurring'::public.booking_fulfillment_type then
    return jsonb_build_object('success',false,'error','Recurring bookings must use the individual occurrence for OTP verification');
  end if;

  if v_otp_type = 'start' then
    if v_booking.status <> 'arrived'::public.booking_status then
      return jsonb_build_object(
        'success', false,
        'error', 'Booking must be arrived before start OTP verification'
      );
    end if;
    v_new_status := 'in_progress'::public.booking_status;
  else
    if v_booking.status <> 'in_progress'::public.booking_status then
      return jsonb_build_object(
        'success', false,
        'error', 'Booking must be in progress before end OTP verification'
      );
    end if;
    v_new_status := 'completed'::public.booking_status;
  end if;

  select *
  into v_otp
  from public.booking_otps
  where booking_id = p_booking_id
    and otp_type = v_otp_type::public.otp_type
    and status = 'pending'::public.otp_status
  order by created_at desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid or expired OTP'
    );
  end if;

  if coalesce(v_otp.attempts, 0) >= 5 then
    update public.booking_otps
    set status = 'expired'::public.otp_status
    where id = v_otp.id;

    return jsonb_build_object(
      'success', false,
      'error', 'OTP has been locked after too many attempts'
    );
  end if;

  if v_otp.expires_at is not null
     and v_otp.expires_at <= now() then
    update public.booking_otps
    set status = 'expired'::public.otp_status
    where id = v_otp.id;

    return jsonb_build_object(
      'success', false,
      'error', 'OTP has expired. Please generate a new OTP.'
    );
  end if;

  if lower(v_otp.otp_hash) <> lower(trim(p_otp_hash)) then
    update public.booking_otps
    set
      attempts = coalesce(attempts, 0) + 1,
      status = case
        when coalesce(attempts, 0) + 1 >= 5
        then 'expired'::public.otp_status
        else status
      end
    where id = v_otp.id
      and status = 'pending'::public.otp_status;

    return jsonb_build_object(
      'success', false,
      'error', 'Invalid OTP'
    );
  end if;

  update public.booking_otps
  set
    status = 'verified'::public.otp_status,
    verified_at = now()
  where id = v_otp.id
    and status = 'pending'::public.otp_status;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'OTP has already been used'
    );
  end if;

  if v_booking.fulfillment_type='recurring'::public.booking_fulfillment_type then
    return jsonb_build_object('success',false,'error','Recurring bookings must use the individual occurrence for OTP verification');
  end if;

  if v_otp_type = 'start' then
    update public.bookings
    set
      start_otp_verified_at = now(),
      started_at = coalesce(started_at, now()),
      started_by = coalesce(started_by, auth.uid()),
      updated_at = now()
    where id = v_booking.id;

    v_result := public.transition_booking_state(
      v_booking.id,
      v_new_status,
      null,
      false,
      false
    );
  else
    update public.bookings
    set
      end_otp_verified_at = now(),
      completed_at = coalesce(completed_at, now()),
      updated_at = now()
    where id = v_booking.id;

    v_result := public.transition_booking_state(
      v_booking.id,
      v_new_status,
      null,
      false,
      false
    );

    v_platform_fee := coalesce(v_booking.platform_fee, 0);

    insert into public.worker_earnings (
      worker_id,
      booking_id,
      gross_amount,
      platform_fee,
      net_amount
    )
    select
      v_booking.worker_id,
      v_booking.id,
      v_booking.total_amount,
      v_platform_fee,
      v_booking.total_amount - v_platform_fee
    where not exists (
      select 1
      from public.worker_earnings
      where booking_id = v_booking.id
    );

    select exists (
      select 1
      from public.bookings
      where worker_id = auth.uid()
        and id <> v_booking.id
        and status in (
          'assigned',
          'on_the_way',
          'arrived',
          'in_progress'
        )
    )
    into v_has_active_booking;

    if not v_has_active_booking then
      perform public.reconcile_worker_assignment_presence(auth.uid());
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'otp_type', v_otp_type,
    'status', v_new_status::text
  );
end;
$_$;


ALTER FUNCTION "public"."verify_booking_otp_atomic"("p_booking_id" "uuid", "p_otp_type" "text", "p_otp_hash" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_refund_processor_secret"("p_secret" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_expected text;
begin
  if p_secret is null
     or btrim(p_secret) = '' then
    return false;
  end if;

  select decrypted_secret
  into v_expected
  from vault.decrypted_secrets
  where name = 'tempstaff_refund_processor_secret'
  limit 1;

  return v_expected is not null
     and v_expected = p_secret;
end;
$$;


ALTER FUNCTION "public"."verify_refund_processor_secret"("p_secret" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_worker_payout_processor_secret"("p_secret" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'tempstaff_payout_processor_secret'
      and decrypted_secret = p_secret
  );
$$;


ALTER FUNCTION "public"."verify_worker_payout_processor_secret"("p_secret" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_booking_action"("p_booking_id" "uuid", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_booking public.bookings%rowtype;
  v_result jsonb;
  v_action text := lower(trim(p_action));
begin
  if auth.uid() is null then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Authentication required'
    );
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.worker_profiles wp
      on wp.id = p.id
    where p.id = auth.uid()
      and p.role = 'worker'::public.user_role
      and p.is_active = true
      and wp.is_verified = true
      and wp.worker_status <> 'suspended'::public.worker_status
  ) then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Worker account is not active and verified'
    );
  end if;

  /*
   * Offer acceptance/decline has its own concurrency-safe RPC.
   */
  if v_action in ('accept', 'decline') then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Use the booking offer action to accept or decline a worker offer'
    );
  end if;

  /*
   * Workers do not directly cancel customer bookings.
   * Reassignment/replacement is an administrative operation.
   */
  if v_action = 'cancel' then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Workers cannot cancel customer bookings. Request admin replacement or reassignment instead.'
    );
  end if;

  /*
   * Starting and completing the service require OTP verification.
   */
  if v_action in ('start', 'complete') then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'This action requires OTP verification'
    );
  end if;

  if v_action not in (
    'on_the_way',
    'arrived'
  ) then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Invalid worker booking action'
    );
  end if;

  /*
   * Lock the booking so concurrent worker actions cannot
   * operate on stale state.
   */
  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
    and worker_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Booking not found or worker is not assigned to this booking'
    );
  end if;

  /*
   * Recurring bookings are controlled occurrence-by-occurrence.
   */
  if v_booking.fulfillment_type =
      'recurring'::public.booking_fulfillment_type then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Recurring bookings must use the individual occurrence'
    );
  end if;

  /*
   * Journey may only begin at or after the scheduled start
   * for scheduled bookings.
   *
   * Instant bookings are not delayed by this check.
   */
  if v_action = 'on_the_way'
     and v_booking.fulfillment_type =
         'scheduled'::public.booking_fulfillment_type
     and v_booking.scheduled_start > now() then

    return jsonb_build_object(
      'success',
      false,
      'error',
      'This scheduled booking has not started yet. You can start the journey at the scheduled start time.',
      'scheduled_start',
      v_booking.scheduled_start
    );
  end if;

  if v_action = 'on_the_way' then

    if v_booking.status <>
        'assigned'::public.booking_status then
      return jsonb_build_object(
        'success',
        false,
        'error',
        'Booking must be assigned before travelling'
      );
    end if;

    v_result :=
      public.transition_booking_state(
        v_booking.id,
        'on_the_way'::public.booking_status
      );

  else

    if v_booking.status <>
        'on_the_way'::public.booking_status then
      return jsonb_build_object(
        'success',
        false,
        'error',
        'Worker must be on the way before marking arrival'
      );
    end if;

    v_result :=
      public.transition_booking_state(
        v_booking.id,
        'arrived'::public.booking_status
      );

  end if;

  return jsonb_build_object(
    'success',
    true,
    'booking_id',
    v_booking.id,
    'action',
    v_action,
    'old_status',
    v_result ->> 'old_status',
    'status',
    v_result ->> 'status',
    'worker_accepted_at',
    null
  );
end;
$$;


ALTER FUNCTION "public"."worker_booking_action"("p_booking_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_can_cover_scheduled_booking"("p_booking_id" "uuid", "p_worker_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_service_id uuid;
  v_timezone text;
  v_occ public.booking_schedule_occurrences%rowtype;
  v_local_start timestamp;
  v_local_end timestamp;
  v_dow smallint;
begin
  /*
   * Future scheduled assignment is based on verified worker status plus
   * future schedule coverage. The worker does NOT need to be currently
   * online/available or broadcasting live GPS at assignment time.
   *
   * Near-term customer booking creation has a separate current-availability
   * validation, so this rule does not weaken that path.
   */
  if not exists (
    select 1
    from public.worker_profiles wp
    where wp.id = p_worker_id
      and wp.is_verified = true
      and wp.worker_status <> 'suspended'::public.worker_status
  ) then
    return false;
  end if;

  select b.service_id
  into v_service_id
  from public.bookings b
  where b.id = p_booking_id;

  if v_service_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.worker_services ws
    where ws.worker_id = p_worker_id
      and ws.service_id = v_service_id
  ) then
    return false;
  end if;

  select coalesce(wss.timezone, 'Asia/Kolkata')
  into v_timezone
  from public.worker_schedule_settings wss
  where wss.worker_id = p_worker_id;

  if v_timezone is null then
    v_timezone := 'Asia/Kolkata';
  end if;

  if not exists (
    select 1
    from public.booking_schedule_occurrences o
    where o.booking_id = p_booking_id
  ) then
    return false;
  end if;

  for v_occ in
    select *
    from public.booking_schedule_occurrences
    where booking_id = p_booking_id
    order by occurrence_index
  loop
    v_local_start := v_occ.scheduled_start at time zone v_timezone;
    v_local_end := v_occ.scheduled_end at time zone v_timezone;
    v_dow := extract(dow from v_local_start)::smallint;

    if not exists (
      select 1
      from (
        select w.start_time, w.end_time
        from public.worker_weekly_schedules w
        where w.worker_id = p_worker_id
          and w.day_of_week = v_dow
          and w.is_active = true

        union

        select e.start_time, e.end_time
        from public.worker_schedule_exceptions e
        where e.worker_id = p_worker_id
          and e.exception_date = v_local_start::date
          and e.exception_type = 'available'
          and e.is_active = true
          and e.start_time is not null
          and e.end_time is not null
      ) windows
      where windows.start_time < windows.end_time
        and v_local_start::time >= windows.start_time
        and v_local_end::time <= windows.end_time
    ) then
      return false;
    end if;

    if exists (
      select 1
      from public.worker_schedule_exceptions e
      where e.worker_id = p_worker_id
        and e.exception_date = v_local_start::date
        and e.exception_type = 'unavailable'
        and e.is_active = true
        and (
          e.start_time is null
          or e.end_time is null
          or (
            v_local_start::time < e.end_time
            and v_local_end::time > e.start_time
          )
        )
    ) then
      return false;
    end if;

    if exists (
      select 1
      from public.bookings b
      where b.id <> p_booking_id
        and b.status in (
          'assigned'::public.booking_status,
          'on_the_way'::public.booking_status,
          'arrived'::public.booking_status,
          'in_progress'::public.booking_status
        )
        and (
          (
            not exists (
              select 1
              from public.booking_schedule_occurrences o2
              where o2.booking_id = b.id
            )
            and b.worker_id = p_worker_id
            and b.scheduled_start < v_occ.scheduled_end
            and b.scheduled_end > v_occ.scheduled_start
          )
          or exists (
            select 1
            from public.booking_schedule_occurrences o2
            where o2.booking_id = b.id
              and o2.scheduled_start < v_occ.scheduled_end
              and o2.scheduled_end > v_occ.scheduled_start
              and coalesce(o2.status, 'scheduled') not in (
                'completed',
                'cancelled',
                'expired'
              )
              and coalesce(o2.worker_id, b.worker_id) = p_worker_id
          )
        )
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;


ALTER FUNCTION "public"."worker_can_cover_scheduled_booking"("p_booking_id" "uuid", "p_worker_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_covers_booking_interval"("p_service_id" "uuid", "p_worker_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_timezone text; v_local_start timestamp; v_local_end timestamp; v_dow smallint;
begin
 if p_service_id is null or p_worker_id is null or p_start is null or p_end is null or p_end<=p_start then return false; end if;
 if not exists(select 1 from public.worker_profiles wp where wp.id=p_worker_id and wp.is_verified=true and wp.worker_status<>'suspended'::public.worker_status) then return false; end if;
 if not exists(select 1 from public.worker_services ws where ws.worker_id=p_worker_id and ws.service_id=p_service_id) then return false; end if;
 select coalesce(nullif(trim(wss.timezone),''),'Asia/Kolkata') into v_timezone from public.worker_schedule_settings wss where wss.worker_id=p_worker_id; v_timezone:=coalesce(v_timezone,'Asia/Kolkata');
 v_local_start:=p_start at time zone v_timezone; v_local_end:=p_end at time zone v_timezone; if v_local_start::date is distinct from v_local_end::date then return false; end if; v_dow:=extract(dow from v_local_start)::smallint;
 if not exists(select 1 from (select w.start_time,w.end_time from public.worker_weekly_schedules w where w.worker_id=p_worker_id and w.day_of_week=v_dow and w.is_active=true union select e.start_time,e.end_time from public.worker_schedule_exceptions e where e.worker_id=p_worker_id and e.exception_date=v_local_start::date and e.exception_type='available' and e.is_active=true and e.start_time is not null and e.end_time is not null) win where win.start_time<win.end_time and v_local_start::time>=win.start_time and v_local_end::time<=win.end_time) then return false; end if;
 if exists(select 1 from public.worker_schedule_exceptions e where e.worker_id=p_worker_id and e.exception_date=v_local_start::date and e.exception_type='unavailable' and e.is_active=true and (e.start_time is null or e.end_time is null or (v_local_start::time<e.end_time and v_local_end::time>e.start_time))) then return false; end if;
 if exists(
  select 1
  from public.bookings b
  where b.status in ('assigned'::public.booking_status,'on_the_way'::public.booking_status,'arrived'::public.booking_status,'in_progress'::public.booking_status)
    and (
      (
        not exists (
          select 1
          from public.booking_schedule_occurrences o
          where o.booking_id = b.id
        )
        and b.worker_id = p_worker_id
        and b.scheduled_start < p_end
        and b.scheduled_end > p_start
      )
      or exists (
        select 1
        from public.booking_schedule_occurrences o
        where o.booking_id = b.id
          and o.scheduled_start < p_end
          and o.scheduled_end > p_start
          and coalesce(o.status, 'scheduled') not in ('completed','cancelled','expired')
          and coalesce(o.worker_id, b.worker_id) = p_worker_id
      )
    )
) then return false; end if;
 return true;
end; $$;


ALTER FUNCTION "public"."worker_covers_booking_interval"("p_service_id" "uuid", "p_worker_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_create_booking_change_request"("p_booking_id" "uuid", "p_request_type" "text", "p_reason" "text", "p_requested_start" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_requested_end" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_occurrence_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."worker_booking_change_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_occurrence public.booking_schedule_occurrences%rowtype;
  v_request public.worker_booking_change_requests%rowtype;
  v_request_type text := lower(btrim(coalesce(p_request_type, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_timezone text := 'Asia/Kolkata';
  v_current_start timestamptz;
  v_current_end timestamptz;
  v_new_start_local timestamp;
  v_new_end_local timestamp;
  v_new_date date;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  if v_request_type not in ('cancel', 'reschedule') then
    raise exception 'Invalid booking change request type';
  end if;

  if length(v_reason) < 1 or length(v_reason) > 2000 then
    raise exception 'Request reason must be between 1 and 2000 characters';
  end if;

  select coalesce(
    nullif(trim(value->>'value'), ''),
    'Asia/Kolkata'
  )
  into v_timezone
  from public.platform_settings
  where key = 'operations.timezone'
    and is_active = true
  order by updated_at desc
  limit 1;

  v_timezone := coalesce(v_timezone, 'Asia/Kolkata');

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if p_occurrence_id is not null then
    select *
    into v_occurrence
    from public.booking_schedule_occurrences
    where id = p_occurrence_id
      and booking_id = p_booking_id
    for update;

    if not found then
      raise exception 'Booking occurrence not found';
    end if;

    if v_occurrence.worker_id <> v_worker_id then
      raise exception 'Worker is not assigned to this occurrence';
    end if;

    if v_occurrence.status not in ('scheduled', 'assigned') then
      raise exception 'This occurrence can no longer accept worker change requests';
    end if;

    v_current_start := v_occurrence.scheduled_start;
    v_current_end := v_occurrence.scheduled_end;
  else
    if v_booking.worker_id <> v_worker_id then
      raise exception 'Worker is not assigned to this booking';
    end if;

    if v_booking.status <> 'assigned' then
      raise exception 'This booking can no longer accept worker change requests';
    end if;

    v_current_start := v_booking.scheduled_start;
    v_current_end := v_booking.scheduled_end;
  end if;

  if v_request_type = 'cancel' then
    if p_requested_start is not null or p_requested_end is not null then
      raise exception 'Cancellation requests must not include new times';
    end if;
  else
    if p_requested_start is null
       or p_requested_end is null
       or p_requested_end <= p_requested_start then
      raise exception 'A valid requested start and end are required for reschedule requests';
    end if;

    if p_requested_start <= now() then
      raise exception 'Requested start must be in the future';
    end if;

    if v_current_start is null or v_current_end is null then
      raise exception 'Current booking schedule is missing';
    end if;

    if extract(epoch from (p_requested_end - p_requested_start))
       <> extract(epoch from (v_current_end - v_current_start))
    then
      raise exception 'Rescheduling must preserve the original booking duration';
    end if;

    v_new_start_local := p_requested_start at time zone v_timezone;
    v_new_end_local := p_requested_end at time zone v_timezone;
    v_new_date := v_new_start_local::date;

    if v_new_end_local::date <> v_new_date then
      raise exception 'Booking must start and end on the same local date';
    end if;

    if not public.is_booking_within_operating_hours(
      p_requested_start,
      p_requested_end
    ) then
      raise exception 'Requested working hours are outside configured operating hours';
    end if;
  end if;

  if exists (
    select 1
    from public.worker_booking_change_requests r
    where r.worker_id = v_worker_id
      and r.booking_id = p_booking_id
      and r.occurrence_id is not distinct from p_occurrence_id
      and r.status = 'open'
  ) then
    raise exception 'An open worker change request already exists for this booking';
  end if;

  insert into public.worker_booking_change_requests(
    worker_id,
    booking_id,
    occurrence_id,
    request_type,
    reason,
    requested_start,
    requested_end
  )
  values(
    v_worker_id,
    p_booking_id,
    p_occurrence_id,
    v_request_type,
    v_reason,
    p_requested_start,
    p_requested_end
  )
  returning * into v_request;

  return v_request;
end;
$$;


ALTER FUNCTION "public"."worker_create_booking_change_request"("p_booking_id" "uuid", "p_request_type" "text", "p_reason" "text", "p_requested_start" timestamp with time zone, "p_requested_end" timestamp with time zone, "p_occurrence_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_disable_payout_account"("p_payout_account_id" "uuid") RETURNS "public"."worker_payout_accounts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_account public.worker_payout_accounts%rowtype;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id
    and worker_id = v_worker_id
    and status <> 'disabled'
  for update;

  if not found then
    raise exception 'Worker payout account not found';
  end if;

  update public.worker_payout_accounts
  set is_default = false,
      status = 'disabled',
      updated_at = now()
  where id = p_payout_account_id;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id;

  return v_account;
end;
$$;


ALTER FUNCTION "public"."worker_disable_payout_account"("p_payout_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_get_available_earnings"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  with worker_net as (
    select coalesce(sum(e.net_amount), 0)::numeric as net_earnings
    from public.worker_earnings e
    where e.worker_id = (select auth.uid())
  ),
  allocated as (
    select coalesce(sum(i.amount), 0)::numeric as allocated_amount
    from public.worker_payout_items i
    join public.worker_payouts p on p.id = i.payout_id
    join public.worker_earnings e on e.id = i.earning_id
    where e.worker_id = (select auth.uid())
      and p.status in ('queued','pending','processing','processed')
  )
  select jsonb_build_object(
    'gross_earnings',
      coalesce((
        select sum(e.gross_amount)
        from public.worker_earnings e
        where e.worker_id = (select auth.uid())
      ), 0),
    'platform_fees',
      coalesce((
        select sum(e.platform_fee)
        from public.worker_earnings e
        where e.worker_id = (select auth.uid())
      ), 0),
    'net_earnings',
      (select net_earnings from worker_net),
    'allocated_amount',
      (select allocated_amount from allocated),
    'available_amount',
      greatest(
        0,
        (select net_earnings from worker_net)
        - (select allocated_amount from allocated)
      )
  );
$$;


ALTER FUNCTION "public"."worker_get_available_earnings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_get_booking_context"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_booking_id is null then
    raise exception 'Booking id is required';
  end if;

  if not exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
  ) then
    raise exception 'Booking not found';
  end if;

  if not exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and (
        b.worker_id = auth.uid()
        or exists (
          select 1
          from public.booking_worker_offers bwo
          where bwo.booking_id = b.id
            and bwo.worker_id = auth.uid()
            and bwo.status = 'pending'
            and bwo.expires_at > now()
        )
      )
  ) then
    raise exception 'Booking access denied';
  end if;

  select jsonb_build_object(
    'booking_id', b.id,
    'customer_id', b.customer_id,
    'customer_name', nullif(btrim(p.full_name), ''),
    'service_id', b.service_id,
    'service_name', s.name,
    'variant_id', b.service_variant_id,
    'variant_name', sv.name,
    'address_id', b.address_id,
    'address_label', nullif(btrim(a.label), ''),
    'address_line', nullif(btrim(a.address_line), ''),
    'latitude', a.latitude,
    'longitude', a.longitude
  )
  into v_result
  from public.bookings b
  left join public.profiles p
    on p.id = b.customer_id
   and p.role = 'customer'
  left join public.services s
    on s.id = b.service_id
  left join public.service_variants sv
    on sv.id = b.service_variant_id
   and sv.service_id = b.service_id
  left join public.addresses a
    on a.id = b.address_id
   and a.user_id = b.customer_id
  where b.id = p_booking_id;

  if v_result is null then
    raise exception 'Booking context unavailable';
  end if;

  return v_result;
end;
$$;


ALTER FUNCTION "public"."worker_get_booking_context"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_get_booking_offer_details"("p_offer_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_offer public.booking_worker_offers%rowtype;
  v_booking public.bookings%rowtype;
  v_occ public.booking_schedule_occurrences%rowtype;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_offer
  FROM public.booking_worker_offers
  WHERE id = p_offer_id
    AND worker_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offer not found for this worker';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = v_offer.booking_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_offer.occurrence_id IS NOT NULL THEN
    SELECT * INTO v_occ
    FROM public.booking_schedule_occurrences
    WHERE id = v_offer.occurrence_id
      AND booking_id = v_booking.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Offered occurrence no longer exists';
    END IF;
  END IF;

  IF v_offer.status = 'pending' THEN
    IF v_offer.expires_at <= now()
       OR v_booking.status NOT IN ('paid'::public.booking_status, 'searching_worker'::public.booking_status)
       OR v_booking.worker_id IS NOT NULL
       OR public.worker_has_active_assignment(auth.uid())
       OR NOT EXISTS (
         SELECT 1
         FROM public.profiles p
         JOIN public.worker_profiles wp ON wp.id = p.id
         WHERE p.id = auth.uid()
           AND p.role = 'worker'::public.user_role
           AND p.is_active = true
           AND wp.is_verified = true
           AND wp.worker_status = 'available'::public.worker_status
       )
       OR NOT EXISTS (
         SELECT 1
         FROM public.worker_presence pr
         WHERE pr.worker_id = auth.uid()
           AND pr.is_available = true
           AND pr.expires_at > now()
       )
       OR NOT EXISTS (
         SELECT 1
         FROM public.worker_locations wl
         WHERE wl.worker_id = auth.uid()
           AND wl.location IS NOT NULL
           AND wl.recorded_at >= now() - interval '10 minutes'
       ) THEN
      RAISE EXCEPTION 'Offer is no longer available or worker is not eligible';
    END IF;

    IF v_offer.occurrence_id IS NOT NULL THEN
      IF v_occ.status <> 'scheduled'
         OR v_occ.worker_id IS NOT NULL
         OR v_occ.scheduled_start <= now() + interval '30 minutes' THEN
        RAISE EXCEPTION 'Occurrence offer is no longer available';
      END IF;
    ELSIF v_booking.fulfillment_type = 'scheduled'::public.booking_fulfillment_type
       AND v_booking.scheduled_start <= now() + interval '30 minutes' THEN
      RAISE EXCEPTION 'Scheduled offer is no longer available';
    END IF;
  ELSIF v_offer.status = 'accepted' THEN
    IF v_offer.occurrence_id IS NOT NULL THEN
      IF v_occ.worker_id IS DISTINCT FROM auth.uid()
         OR v_occ.status NOT IN ('assigned', 'on_the_way', 'arrived', 'in_progress', 'completed') THEN
        RAISE EXCEPTION 'Accepted occurrence is no longer assigned to this worker';
      END IF;
    ELSIF v_booking.worker_id IS DISTINCT FROM auth.uid()
       OR v_booking.status NOT IN (
         'assigned'::public.booking_status,
         'on_the_way'::public.booking_status,
         'arrived'::public.booking_status,
         'in_progress'::public.booking_status,
         'completed'::public.booking_status
       ) THEN
      RAISE EXCEPTION 'Accepted booking is no longer assigned to this worker';
    END IF;
  ELSE
    RAISE EXCEPTION 'Offer is no longer available';
  END IF;

  v_result := jsonb_build_object(
    'booking', jsonb_build_object(
      'id', v_booking.id,
      'customer_id', v_booking.customer_id,
      'worker_id', CASE WHEN v_offer.occurrence_id IS NOT NULL THEN v_occ.worker_id ELSE v_booking.worker_id END,
      'service_id', v_booking.service_id,
      'service_variant_id', v_booking.service_variant_id,
      'address_id', v_booking.address_id,
      'status', v_booking.status::text,
      'fulfillment_type', v_booking.fulfillment_type::text,
      'duration_value', v_booking.duration_value,
      'duration_unit', v_booking.duration_unit::text,
      'scheduled_start', CASE WHEN v_offer.occurrence_id IS NOT NULL THEN v_occ.scheduled_start ELSE v_booking.scheduled_start END,
      'scheduled_end', CASE WHEN v_offer.occurrence_id IS NOT NULL THEN v_occ.scheduled_end ELSE v_booking.scheduled_end END,
      'total_working_hours', CASE WHEN v_offer.occurrence_id IS NOT NULL THEN NULL ELSE v_booking.total_working_hours END,
      'total_amount', CASE WHEN v_offer.occurrence_id IS NOT NULL THEN v_occ.total_amount ELSE v_booking.total_amount END,
      'pricing_snapshot', CASE WHEN v_offer.occurrence_id IS NOT NULL THEN v_occ.pricing_snapshot ELSE v_booking.pricing_snapshot END,
      'notes', v_booking.notes,
      'worker_accepted_at', CASE WHEN v_offer.occurrence_id IS NOT NULL THEN v_occ.worker_accepted_at ELSE v_booking.worker_accepted_at END,
      'journey_started_at', v_booking.journey_started_at,
      'arrived_at', v_booking.arrived_at,
      'started_at', v_booking.started_at,
      'start_otp_verified_at', v_booking.start_otp_verified_at,
      'completed_at', v_booking.completed_at,
      'end_otp_verified_at', v_booking.end_otp_verified_at,
      'schedule_start_date', v_booking.schedule_start_date,
      'schedule_end_date', v_booking.schedule_end_date,
      'daily_start_time', v_booking.daily_start_time,
      'daily_end_time', v_booking.daily_end_time,
      'selected_weekdays', v_booking.selected_weekdays,
      'off_dates', v_booking.off_dates,
      'created_at', v_booking.created_at,
      'updated_at', v_booking.updated_at
    ),
    'occurrence_id', v_offer.occurrence_id,
    'occurrence_index', CASE WHEN v_offer.occurrence_id IS NOT NULL THEN v_occ.occurrence_index ELSE NULL END,
    'offer_id', v_offer.id,
    'offer_status', v_offer.status::text,
    'offer_expires_at', v_offer.expires_at
  );

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."worker_get_booking_offer_details"("p_offer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_get_incident_summary"("p_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select jsonb_build_object(
    'open_count',
    count(*) filter (where i.status in ('open','in_review')),
    'resolved_count',
    count(*) filter (where i.status = 'resolved'),
    'dismissed_count',
    count(*) filter (where i.status = 'dismissed')
  )
  from public.worker_booking_incidents i
  where i.worker_id = (select auth.uid())
    and (
      p_booking_id is null
      or i.booking_id = p_booking_id
    );
$$;


ALTER FUNCTION "public"."worker_get_incident_summary"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_get_payout_overview"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_total_earned numeric := 0;
  v_reserved numeric := 0;
  v_paid numeric := 0;
  v_available numeric := 0;
  v_account_count integer := 0;
  v_verified_account_count integer := 0;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  select coalesce(sum(e.net_amount), 0)
  into v_total_earned
  from public.worker_earnings e
  where e.worker_id = v_worker_id;

  select coalesce(sum(i.amount), 0)
  into v_reserved
  from public.worker_payout_items i
  join public.worker_payouts p on p.id = i.payout_id
  where p.worker_id = v_worker_id
    and p.status in ('queued','pending','processing');

  select coalesce(sum(i.amount), 0)
  into v_paid
  from public.worker_payout_items i
  join public.worker_payouts p on p.id = i.payout_id
  where p.worker_id = v_worker_id
    and p.status = 'processed';

  v_available := greatest(
    0,
    v_total_earned - v_reserved - v_paid
  );

  select count(*)
  into v_account_count
  from public.worker_payout_accounts a
  where a.worker_id = v_worker_id
    and a.status <> 'disabled';

  select count(*)
  into v_verified_account_count
  from public.worker_payout_accounts a
  where a.worker_id = v_worker_id
    and a.status = 'verified';

  return jsonb_build_object(
    'total_earned', round(v_total_earned, 2),
    'reserved_for_payout', round(v_reserved, 2),
    'paid_out', round(v_paid, 2),
    'available_for_payout', round(v_available, 2),
    'payout_accounts', v_account_count,
    'verified_payout_accounts', v_verified_account_count,
    'payout_enabled', false
  );
end;
$$;


ALTER FUNCTION "public"."worker_get_payout_overview"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_get_performance_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_completed_jobs integer := 0;
  v_completed_occurrences integer := 0;
  v_total_earnings numeric := 0;
  v_average_rating numeric := 0;
  v_total_reviews integer := 0;
  v_offer_total integer := 0;
  v_offer_accepted integer := 0;
  v_offer_declined integer := 0;
  v_offer_expired integer := 0;
  v_acceptance_rate numeric := 0;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  select count(*) into v_completed_jobs
  from public.bookings b
  where b.worker_id = v_worker_id
    and b.status = 'completed'::public.booking_status;

  select count(*) into v_completed_occurrences
  from public.booking_schedule_occurrences o
  where o.worker_id = v_worker_id
    and o.status = 'completed';

  select coalesce(sum(e.net_amount),0) into v_total_earnings
  from public.worker_earnings e
  where e.worker_id = v_worker_id;

  select coalesce(avg(r.rating),0), count(*)
  into v_average_rating, v_total_reviews
  from public.reviews r
  where r.worker_id = v_worker_id
    and r.moderation_status = 'published';

  select count(*) into v_offer_total
  from public.booking_worker_offers o
  where o.worker_id = v_worker_id
    and o.status in ('accepted','declined','expired');

  select count(*) into v_offer_accepted
  from public.booking_worker_offers o
  where o.worker_id = v_worker_id and o.status = 'accepted';

  select count(*) into v_offer_declined
  from public.booking_worker_offers o
  where o.worker_id = v_worker_id and o.status = 'declined';

  select count(*) into v_offer_expired
  from public.booking_worker_offers o
  where o.worker_id = v_worker_id and o.status = 'expired';

  if v_offer_total > 0 then
    v_acceptance_rate := round(
      (v_offer_accepted::numeric / v_offer_total::numeric) * 100,
      2
    );
  end if;

  return jsonb_build_object(
    'completed_jobs', v_completed_jobs,
    'completed_occurrences', v_completed_occurrences,
    'total_net_earnings', round(v_total_earnings,2),
    'average_rating', round(v_average_rating,2),
    'review_count', v_total_reviews,
    'offer_decided_count', v_offer_total,
    'accepted_offer_count', v_offer_accepted,
    'declined_offer_count', v_offer_declined,
    'expired_offer_count', v_offer_expired,
    'acceptance_rate_percent', v_acceptance_rate
  );
end;
$$;


ALTER FUNCTION "public"."worker_get_performance_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_get_verification_summary"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_application_status text;
  v_is_verified boolean;
  v_document_count integer := 0;
  v_approved_count integer := 0;
  v_pending_count integer := 0;
  v_rejected_count integer := 0;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  select wp.is_verified into v_is_verified
  from public.worker_profiles wp
  where wp.id = v_worker_id;

  if not found then
    raise exception 'Worker profile not found';
  end if;

  select wa.status::text into v_application_status
  from public.worker_applications wa
  where wa.worker_id = v_worker_id
  order by wa.created_at desc
  limit 1;

  select
    count(*) filter (where d.document_type in (
      'passport_photo','aadhaar','pan',
      'address_proof','police_verification','bank_account'
    )),
    count(*) filter (where d.status = 'approved'),
    count(*) filter (where d.status = 'pending'),
    count(*) filter (where d.status = 'rejected')
  into
    v_document_count, v_approved_count, v_pending_count, v_rejected_count
  from public.worker_documents d
  where d.worker_id = v_worker_id;

  return jsonb_build_object(
    'worker_verified', coalesce(v_is_verified,false),
    'application_status', v_application_status,
    'document_count', v_document_count,
    'approved_document_count', v_approved_count,
    'pending_document_count', v_pending_count,
    'rejected_document_count', v_rejected_count
  );
end;
$$;


ALTER FUNCTION "public"."worker_get_verification_summary"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_has_active_assignment"("p_worker_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.worker_id = p_worker_id
        AND b.status IN (
          'assigned'::public.booking_status,
          'on_the_way'::public.booking_status,
          'arrived'::public.booking_status,
          'in_progress'::public.booking_status
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.booking_schedule_occurrences o
      WHERE o.worker_id = p_worker_id
        AND o.status IN ('assigned', 'on_the_way', 'arrived', 'in_progress')
    );
$$;


ALTER FUNCTION "public"."worker_has_active_assignment"("p_worker_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_list_booking_change_requests"("p_booking_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50) RETURNS SETOF "public"."worker_booking_change_requests"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select r
  from public.worker_booking_change_requests r
  where r.worker_id = (select auth.uid())
    and (
      p_booking_id is null
      or r.booking_id = p_booking_id
    )
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;


ALTER FUNCTION "public"."worker_list_booking_change_requests"("p_booking_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_list_booking_incidents"("p_booking_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 50) RETURNS SETOF "public"."worker_booking_incidents"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select i
  from public.worker_booking_incidents i
  where i.worker_id = (select auth.uid())
    and (
      p_booking_id is null
      or i.booking_id = p_booking_id
    )
  order by i.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;


ALTER FUNCTION "public"."worker_list_booking_incidents"("p_booking_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_list_payout_accounts"() RETURNS SETOF "public"."worker_payout_accounts"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select a
  from public.worker_payout_accounts a
  where a.worker_id = (select auth.uid())
  order by a.is_default desc, a.created_at desc;
$$;


ALTER FUNCTION "public"."worker_list_payout_accounts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_list_payouts"("p_limit" integer DEFAULT 50) RETURNS SETOF "public"."worker_payouts"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select p
  from public.worker_payouts p
  where p.worker_id = (select auth.uid())
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;


ALTER FUNCTION "public"."worker_list_payouts"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_list_reviews"("p_limit" integer DEFAULT 50) RETURNS TABLE("id" "uuid", "booking_id" "uuid", "occurrence_id" "uuid", "rating" integer, "comment" "text", "created_at" timestamp with time zone)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select
    r.id,
    r.booking_id,
    r.occurrence_id,
    r.rating,
    r.comment,
    r.created_at
  from public.reviews r
  where r.worker_id = (select auth.uid())
    and r.moderation_status = 'published'
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;


ALTER FUNCTION "public"."worker_list_reviews"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_occurrence_action"("p_occurrence_id" "uuid", "p_action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_occ public.booking_schedule_occurrences%rowtype;
  v_action text := lower(trim(p_action));
  v_result jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('success',false,'error','Authentication required');
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.worker_profiles wp on wp.id=p.id
    where p.id=auth.uid()
      and p.role='worker'::public.user_role
      and p.is_active=true
      and wp.is_verified=true
      and wp.worker_status <> 'suspended'::public.worker_status
  ) then
    return jsonb_build_object('success',false,'error','Worker account is not active and verified');
  end if;

  if v_action='cancel' then
    return jsonb_build_object(
      'success',false,
      'error','Workers cannot cancel booking occurrences. Request admin replacement or reassignment instead.'
    );
  end if;

  if v_action in ('start','complete') then
    return jsonb_build_object(
      'success',false,
      'error','This action requires OTP verification'
    );
  end if;

  if v_action not in ('on_the_way','arrived') then
    return jsonb_build_object('success',false,'error','Invalid occurrence action');
  end if;

  select *
  into v_occ
  from public.booking_schedule_occurrences
  where id=p_occurrence_id
    and worker_id=auth.uid()
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','Occurrence not found or worker is not assigned');
  end if;

  if v_action='on_the_way' then
    if v_occ.status<>'assigned' then
      return jsonb_build_object('success',false,'error','Occurrence must be assigned before travelling');
    end if;

    if v_occ.scheduled_start>now() then
      return jsonb_build_object(
        'success',false,
        'error','This shift has not started yet. You can start the journey at the scheduled start time.'
      );
    end if;

    v_result:=public.transition_booking_occurrence_state(
      v_occ.id,
      'on_the_way'
    );
  else
    if v_occ.status<>'on_the_way' then
      return jsonb_build_object(
        'success',false,
        'error','Occurrence must be on the way before marking arrival'
      );
    end if;

    v_result:=public.transition_booking_occurrence_state(
      v_occ.id,
      'arrived'
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'occurrence_id',v_occ.id,
    'action',v_action,
    'old_status',v_result->>'old_status',
    'status',v_result->>'status'
  );
end;
$$;


ALTER FUNCTION "public"."worker_occurrence_action"("p_occurrence_id" "uuid", "p_action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_presence_heartbeat"("p_latitude" double precision, "p_longitude" double precision) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_status public.worker_status;
  v_is_verified boolean;
  v_expires timestamptz;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  if p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid coordinates';
  end if;

  select worker_status, is_verified
  into v_status, v_is_verified
  from public.worker_profiles
  where id = v_worker_id
  for update;

  if not found then
    raise exception 'Worker profile not found';
  end if;

  if coalesce(v_is_verified, false) is not true then
    raise exception 'Worker account must be verified before sending a presence heartbeat';
  end if;

  if v_status <> 'available'::public.worker_status then
    raise exception 'Worker is not available';
  end if;

  v_expires := now() + interval '3 minutes';

  insert into public.worker_presence(
    worker_id, is_available, last_seen_at, expires_at, updated_at
  )
  values(v_worker_id, true, now(), v_expires, now())
  on conflict(worker_id) do update
    set is_available = true,
        last_seen_at = now(),
        expires_at = excluded.expires_at,
        updated_at = now();

  insert into public.worker_locations(
    worker_id, latitude, longitude, location, recorded_at
  )
  values(
    v_worker_id,
    p_latitude,
    p_longitude,
    public.st_setsrid(
      public.st_makepoint(p_longitude, p_latitude),
      4326
    )::public.geography,
    now()
  );

  perform set_config('app.worker_profile_internal_mutation', 'location', true);

  update public.worker_profiles
  set current_location =
        public.st_setsrid(
          public.st_makepoint(p_longitude, p_latitude),
          4326
        )::public.geography,
      updated_at = now()
  where id = v_worker_id;

  return jsonb_build_object(
    'success', true,
    'worker_id', v_worker_id,
    'expires_at', v_expires
  );
end;
$$;


ALTER FUNCTION "public"."worker_presence_heartbeat"("p_latitude" double precision, "p_longitude" double precision) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_report_booking_incident"("p_booking_id" "uuid", "p_incident_type" "text", "p_description" "text", "p_occurrence_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."worker_booking_incidents"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_occurrence public.booking_schedule_occurrences%rowtype;
  v_incident public.worker_booking_incidents%rowtype;
  v_type text := lower(btrim(coalesce(p_incident_type, '')));
  v_description text := btrim(coalesce(p_description, ''));
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if v_type not in (
    'customer_unavailable',
    'wrong_address',
    'unsafe_location',
    'access_problem',
    'extra_work_requested',
    'customer_behaviour',
    'worker_emergency',
    'other'
  ) then
    raise exception 'Invalid incident type';
  end if;

  if length(v_description) < 1 or length(v_description) > 2000 then
    raise exception 'Incident description must be between 1 and 2000 characters';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if p_occurrence_id is not null then
    select * into v_occurrence
    from public.booking_schedule_occurrences
    where id = p_occurrence_id
      and booking_id = p_booking_id
    for update;

    if not found then
      raise exception 'Booking occurrence not found';
    end if;

    if v_occurrence.worker_id <> v_worker_id then
      raise exception 'Worker is not assigned to this occurrence';
    end if;

    if v_occurrence.status not in (
      'scheduled','assigned','on_the_way','arrived','in_progress'
    ) then
      raise exception 'Incident cannot be reported for this occurrence at its current status';
    end if;
  else
    if v_booking.worker_id <> v_worker_id then
      raise exception 'Worker is not assigned to this booking';
    end if;

    if v_booking.status not in (
      'assigned','on_the_way','arrived','in_progress'
    ) then
      raise exception 'Incident cannot be reported for this booking at its current status';
    end if;
  end if;

  insert into public.worker_booking_incidents(
    worker_id, booking_id, occurrence_id, incident_type, description
  )
  values(
    v_worker_id, p_booking_id, p_occurrence_id, v_type, v_description
  )
  returning * into v_incident;

  return v_incident;
end;
$$;


ALTER FUNCTION "public"."worker_report_booking_incident"("p_booking_id" "uuid", "p_incident_type" "text", "p_description" "text", "p_occurrence_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_request_payout"("p_amount" numeric, "p_idempotency_key" "text", "p_payout_account_id" "uuid" DEFAULT NULL::"uuid", "p_mode" "text" DEFAULT NULL::"text") RETURNS "public"."worker_payouts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_account_id uuid;
  v_enabled boolean := false;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  select coalesce(
    (select (value->>'value')::boolean
     from public.platform_settings
     where key = 'worker_payouts.enabled'
       and is_active = true
     order by updated_at desc
     limit 1),
    false
  )
  into v_enabled;

  if not v_enabled then
    raise exception 'Worker payouts are not currently enabled';
  end if;

  if p_payout_account_id is not null then
    v_account_id := p_payout_account_id;
  else
    select a.id
    into v_account_id
    from public.worker_payout_accounts a
    where a.worker_id = v_worker_id
      and a.status = 'verified'
    order by a.is_default desc, a.created_at desc
    limit 1;
  end if;

  if v_account_id is null then
    raise exception 'A verified payout account is required';
  end if;

  return public.create_worker_payout_internal(
    v_worker_id,
    v_account_id,
    p_amount,
    p_idempotency_key,
    p_mode
  );
end;
$$;


ALTER FUNCTION "public"."worker_request_payout"("p_amount" numeric, "p_idempotency_key" "text", "p_payout_account_id" "uuid", "p_mode" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_respond_to_offer"("p_offer_id" "uuid", "p_response" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_worker_id uuid := auth.uid();
  v_worker public.worker_profiles%rowtype;
  v_offer public.booking_worker_offers%rowtype;
  v_booking public.bookings%rowtype;
  v_response text := lower(trim(p_response));
  v_result jsonb;
  v_pending_offers integer;
  v_address public.geography;
  v_worker_location public.geography;
  v_offer_booking_id uuid;
  v_offer_occurrence_id uuid;
  v_occurrence public.booking_schedule_occurrences%rowtype;
  v_effective_start timestamptz;
  v_effective_end timestamptz;

begin
  if v_worker_id is null then
    return jsonb_build_object('success',false,'error','Authentication required');
  end if;

  if v_response not in ('accept','decline') then
    return jsonb_build_object('success',false,'error','Invalid offer response');
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.worker_profiles wp on wp.id=p.id
    where p.id=v_worker_id
      and p.role='worker'::public.user_role
      and p.is_active=true
      and wp.is_verified=true
      and wp.worker_status <> 'suspended'::public.worker_status
  ) then
    return jsonb_build_object('success',false,'error','Worker account is not active and verified');
  end if;

  /*
   * Resolve the booking id without locking the offer.
   * The booking row is the primary lock.
   */
  select booking_id, occurrence_id
  into v_offer_booking_id, v_offer_occurrence_id
  from public.booking_worker_offers
  where id=p_offer_id
    and worker_id=v_worker_id;

  if v_offer_booking_id is null then
    return jsonb_build_object('success',false,'error','Offer not found');
  end if;

  select *
  into v_booking
  from public.bookings
  where id=v_offer_booking_id
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','Booking no longer exists');
  end if;

  IF v_offer_occurrence_id IS NOT NULL THEN
    SELECT * INTO v_occurrence
    FROM public.booking_schedule_occurrences
    WHERE id = v_offer_occurrence_id
      AND booking_id = v_offer_booking_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'Recurring occurrence no longer exists');
    END IF;
    v_effective_start := v_occurrence.scheduled_start;
    v_effective_end := v_occurrence.scheduled_end;
  ELSE
    v_effective_start := NULL;
    v_effective_end := NULL;
  END IF;

  PERFORM 1 FROM public.worker_profiles WHERE id = v_worker_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker profile not found');
  END IF;

  select *
  into v_offer
  from public.booking_worker_offers
  where id=p_offer_id
    and worker_id=v_worker_id
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','Offer not found');
  end if;

  if v_offer.status <> 'pending' then
    return jsonb_build_object('success',false,'error','Offer is no longer available');
  end if;

  if v_offer.expires_at <= now() then
    update public.booking_worker_offers
    set status='expired',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object('success',false,'error','Offer has expired','status','expired');
  end if;

  IF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type
     AND v_offer_occurrence_id IS NULL THEN
    UPDATE public.booking_worker_offers
    SET status='cancelled', responded_at=now(), updated_at=now()
    WHERE id=v_offer.id AND status='pending';
    RETURN jsonb_build_object('success',false,'error','Recurring offers must target one occurrence');
  END IF;

  IF v_booking.fulfillment_type = 'scheduled'::public.booking_fulfillment_type
     AND v_offer_occurrence_id IS NOT NULL THEN
    UPDATE public.booking_worker_offers
    SET status='cancelled', responded_at=now(), updated_at=now()
    WHERE id=v_offer.id AND status='pending';
    RETURN jsonb_build_object('success',false,'error','Scheduled booking offer has an invalid occurrence');
  END IF;

  IF v_booking.fulfillment_type NOT IN (
    'instant'::public.booking_fulfillment_type,
    'scheduled'::public.booking_fulfillment_type,
    'recurring'::public.booking_fulfillment_type
  ) THEN
    UPDATE public.booking_worker_offers
    SET status='cancelled', responded_at=now(), updated_at=now()
    WHERE id=v_offer.id AND status='pending';
    RETURN jsonb_build_object('success',false,'error','Unsupported booking fulfillment type for worker offers');
  END IF;

  IF v_offer_occurrence_id IS NOT NULL THEN
    IF v_occurrence.status <> 'scheduled' OR v_occurrence.worker_id IS NOT NULL
       OR v_occurrence.scheduled_start <= now() + interval '30 minutes' THEN
      UPDATE public.booking_worker_offers
      SET status='expired', responded_at=now(), updated_at=now()
      WHERE id=v_offer.id AND status='pending';
      RETURN jsonb_build_object('success',false,'error','Occurrence is no longer in its worker-assignment window');
    END IF;
    v_effective_start := v_occurrence.scheduled_start;
    v_effective_end := v_occurrence.scheduled_end;
  ELSIF v_booking.fulfillment_type = 'scheduled'::public.booking_fulfillment_type THEN
    IF v_booking.scheduled_start <= now() + interval '30 minutes' THEN
      UPDATE public.booking_worker_offers
      SET status='expired', responded_at=now(), updated_at=now()
      WHERE id=v_offer.id AND status='pending';
      RETURN jsonb_build_object('success',false,'error','Booking is no longer in its worker-assignment window');
    END IF;
    v_effective_start := v_booking.scheduled_start;
    v_effective_end := v_booking.scheduled_end;
  ELSE
    v_effective_start := v_booking.scheduled_start;
    v_effective_end := v_booking.scheduled_end;
  END IF;

  if v_booking.status not in (
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  )
  or v_booking.worker_id is not null then
    update public.booking_worker_offers
    set status='cancelled',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object(
      'success',false,
      'error','Booking is no longer available'
    );
  end if;

  select *
  into v_worker
  from public.worker_profiles
  where id=v_worker_id
  for update;

  if v_worker.is_verified is not true
     or v_worker.worker_status='suspended'::public.worker_status then
    update public.booking_worker_offers
    set status='cancelled',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object(
      'success',false,
      'error','Worker account is no longer active and verified'
    );
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id=v_worker_id
      and p.role='worker'::public.user_role
      and p.is_active=true
  ) then
    update public.booking_worker_offers
    set status='cancelled',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object(
      'success',false,
      'error','Worker account is inactive'
    );
  end if;

  if v_response='decline' then
    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    select count(*)
    into v_pending_offers
    from public.booking_worker_offers
    where booking_id=v_booking.id
      and status='pending';

    if v_pending_offers=0
       and v_booking.worker_id is null
       and v_booking.status in (
         'paid'::public.booking_status,
         'searching_worker'::public.booking_status
       ) then
      begin
        perform public.dispatch_booking_worker_offers_internal(v_booking.id);
      exception when others then
        null;
      end;
    end if;

    return jsonb_build_object(
      'success',true,
      'action','decline',
      'offer_id',v_offer.id,
      'booking_id',v_booking.id,
      'status','declined'
    );
  end if;

  if not exists (
    select 1
    from public.worker_services ws
    where ws.worker_id=v_worker_id
      and ws.service_id=v_booking.service_id
  ) then
    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object('success',false,'error','You no longer provide this service');
  end if;

  if v_worker.worker_status<>'available'::public.worker_status then
    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object('success',false,'error','You are no longer available for new work');
  end if;

  if public.worker_has_active_assignment(v_worker_id) then
    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';
    return jsonb_build_object(
      'success',false,
      'error','You already have an assigned unfinished booking'
    );
  end if;

  if not exists (
    select 1
    from public.worker_presence pr
    where pr.worker_id=v_worker_id
      and pr.is_available=true
      and pr.expires_at>now()
  ) then
    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object('success',false,'error','Worker presence is no longer active');
  end if;

  select coalesce(
    a.location,
    public.st_setsrid(
      public.st_makepoint(a.longitude,a.latitude),
      4326
    )::public.geography
  )
  into v_address
  from public.addresses a
  where a.id=v_booking.address_id;

  if v_address is null then
    update public.booking_worker_offers
    set status='cancelled',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object('success',false,'error','Booking location is missing');
  end if;

  select wl.location
  into v_worker_location
  from public.worker_locations wl
  where wl.worker_id=v_worker_id
    and wl.location is not null
    and wl.recorded_at>=now()-interval '10 minutes'
  order by wl.recorded_at desc
  limit 1;

  if v_worker_location is null then
    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object('success',false,'error','Your current location is unavailable or stale');
  end if;

  if v_worker.service_radius_km is null
     or v_worker.service_radius_km<=0
     or not public.st_dwithin(
       v_worker_location,
       v_address,
       least(v_worker.service_radius_km,10)*1000
     )
     or not public.st_dwithin(v_worker_location,v_address,10000) then

    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object('success',false,'error','You are no longer within the service area for this booking');
  end if;

  if exists (
    select 1
    from public.bookings ob
    where ob.worker_id=v_worker_id
      and ob.id<>v_booking.id
      and ob.status in (
        'assigned'::public.booking_status,
        'on_the_way'::public.booking_status,
        'arrived'::public.booking_status,
        'in_progress'::public.booking_status
      )
      and ob.scheduled_start<v_effective_end
      and ob.scheduled_end>v_effective_start
  ) then

    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object('success',false,'error','You already have another booking during this time');
  end if;

  if not public.worker_covers_booking_interval(
    v_booking.service_id,
    v_worker_id,
    v_effective_start,
    v_effective_end
  ) then
    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object(
      'success',false,
      'error','Your worker schedule no longer covers this booking'
    );
  end if;

  if v_offer_occurrence_id is not null then
    UPDATE public.booking_schedule_occurrences
    SET worker_id = v_worker_id,
        status = 'assigned',
        worker_accepted_at = now(),
        updated_at = now()
    WHERE id = v_offer_occurrence_id
      AND booking_id = v_booking.id
      AND worker_id IS NULL
      AND status = 'scheduled';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Recurring occurrence is no longer available';
    END IF;

    v_result := jsonb_build_object('status', 'assigned');
  ELSE
    v_result:=public.transition_booking_state(
      v_booking.id,
      'assigned'::public.booking_status,
      v_worker_id,
      true,
      false
    );

    update public.bookings
    set worker_accepted_at=now(), updated_at=now()
    where id=v_booking.id;
  END IF;

  update public.booking_worker_offers
  set status='accepted',responded_at=now(),updated_at=now()
  where id=v_offer.id and status='pending';

  if not found then
    raise exception 'Offer is no longer available';
  end if;

  update public.booking_worker_offers
  set status='cancelled',responded_at=now(),updated_at=now()
  where id <> v_offer.id
    and status='pending'
    and (
      worker_id = v_worker_id
      OR (
        booking_id = v_booking.id
        AND occurrence_id IS NOT DISTINCT FROM v_offer_occurrence_id
      )
    );

  perform set_config(
    'app.worker_profile_internal_mutation',
    'presence',
    true
  );

  update public.worker_profiles
  set worker_status='busy'::public.worker_status,
      updated_at=now()
  where id=v_worker_id;

  update public.worker_presence
  set is_available=false,
      expires_at=now(),
      updated_at=now()
  where worker_id=v_worker_id;

  return jsonb_build_object(
    'success',true,
    'action','accept',
    'offer_id',v_offer.id,
    'booking_id',v_booking.id,
    'worker_id',v_worker_id,
    'status',v_result->>'status'
  );
end;
$$;


ALTER FUNCTION "public"."worker_respond_to_offer"("p_offer_id" "uuid", "p_response" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_set_default_payout_account"("p_payout_account_id" "uuid") RETURNS "public"."worker_payout_accounts"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_account public.worker_payout_accounts%rowtype;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id
    and worker_id = v_worker_id
    and status = 'verified'
  for update;

  if not found then
    raise exception 'Verified worker payout account not found';
  end if;

  update public.worker_payout_accounts
  set is_default = false,
      updated_at = now()
  where worker_id = v_worker_id
    and is_default = true
    and id <> p_payout_account_id;

  update public.worker_payout_accounts
  set is_default = true,
      updated_at = now()
  where id = p_payout_account_id;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id;

  return v_account;
end;
$$;


ALTER FUNCTION "public"."worker_set_default_payout_account"("p_payout_account_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_set_presence"("p_available" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_status public.worker_status;
  v_is_verified boolean;
  v_expires timestamptz;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  select worker_status, is_verified
  into v_status, v_is_verified
  from public.worker_profiles
  where id = v_worker_id
  for update;

  if not found then
    raise exception 'Worker profile not found';
  end if;

  if v_status = 'suspended'::public.worker_status then
    raise exception 'Worker account is suspended';
  end if;

  if p_available then
    if coalesce(v_is_verified, false) is not true then
      raise exception 'Worker account must be verified before going online';
    end if;
    if v_status = 'busy'::public.worker_status then
      raise exception 'Worker is busy';
    end if;

    if public.worker_has_active_assignment(v_worker_id) then
      raise exception 'Worker has an assigned unfinished booking';
    end if;

    v_expires := now() + interval '3 minutes';

    insert into public.worker_presence(
      worker_id, is_available, last_seen_at, expires_at, updated_at
    )
    values(v_worker_id, true, now(), v_expires, now())
    on conflict(worker_id) do update
      set is_available = true,
          last_seen_at = now(),
          expires_at = excluded.expires_at,
          updated_at = now();

    perform set_config('app.worker_profile_internal_mutation', 'presence', true);

    update public.worker_profiles
    set worker_status = 'available'::public.worker_status,
        updated_at = now()
    where id = v_worker_id;
  else
    update public.worker_presence
    set is_available = false,
        expires_at = now(),
        was_available_before_busy = false,
        updated_at = now()
    where worker_id = v_worker_id;

    insert into public.worker_presence(
      worker_id, is_available, last_seen_at, expires_at, updated_at
    )
    values(v_worker_id, false, now(), now(), now())
    on conflict(worker_id) do nothing;

    perform set_config('app.worker_profile_internal_mutation', 'presence', true);

    update public.worker_profiles
    set worker_status = 'offline'::public.worker_status,
        updated_at = now()
    where id = v_worker_id
      and worker_status <> 'busy'::public.worker_status;

    v_expires := now();
  end if;

  return jsonb_build_object(
    'success', true,
    'worker_id', v_worker_id,
    'is_available', p_available,
    'expires_at', v_expires
  );
end;
$$;


ALTER FUNCTION "public"."worker_set_presence"("p_available" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_update_location"("p_latitude" double precision, "p_longitude" double precision, "p_booking_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_worker_status public.worker_status;
  v_location geography;
  v_recorded_at timestamptz := now();
  v_presence_expires_at timestamptz;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'Latitude and longitude are required';
  end if;

  if p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid coordinates';
  end if;

  select wp.worker_status
  into v_worker_status
  from public.profiles p
  join public.worker_profiles wp
    on wp.id = p.id
  where p.id = v_worker_id
    and p.role = 'worker'::public.user_role
    and p.is_active = true
    and wp.is_verified = true
    and wp.worker_status <> 'suspended'::public.worker_status
  for update;

  if not found then
    raise exception 'Worker is not eligible to publish location';
  end if;

  if p_booking_id is null
     and v_worker_status not in (
       'available'::public.worker_status,
       'busy'::public.worker_status
     ) then
    raise exception 'Worker must be online or busy to publish generic location';
  end if;

  v_location :=
    st_setsrid(
      st_makepoint(
        p_longitude,
        p_latitude
      ),
      4326
    )::geography;

  if p_booking_id is not null
     and not exists (
       select 1
       from public.bookings b
       where b.id = p_booking_id
         and b.worker_id = v_worker_id
         and b.status in (
           'assigned'::public.booking_status,
           'on_the_way'::public.booking_status,
           'arrived'::public.booking_status,
           'in_progress'::public.booking_status
         )
     ) then
    raise exception 'Booking is not assigned to this worker';
  end if;

  /*
   * One background GPS update should create one generic
   * worker_locations record.
   *
   * For an available worker this same operation also
   * renews the online presence lease, so a second
   * worker_presence_heartbeat RPC is not required.
   */
  insert into public.worker_locations(
    worker_id,
    booking_id,
    latitude,
    longitude,
    location,
    recorded_at
  )
  values(
    v_worker_id,
    p_booking_id,
    p_latitude,
    p_longitude,
    v_location,
    v_recorded_at
  );

  if p_booking_id is null
     and v_worker_status = 'available'::public.worker_status then

    v_presence_expires_at :=
      now() + interval '3 minutes';

    insert into public.worker_presence(
      worker_id,
      is_available,
      last_seen_at,
      expires_at,
      updated_at
    )
    values(
      v_worker_id,
      true,
      now(),
      v_presence_expires_at,
      now()
    )
    on conflict(worker_id) do update
      set
        is_available = true,
        last_seen_at = excluded.last_seen_at,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at;
  end if;

  /*
   * Copy generic location into currently active parent
   * bookings.
   */
  if p_booking_id is null then

    insert into public.worker_locations(
      worker_id,
      booking_id,
      latitude,
      longitude,
      location,
      recorded_at
    )
    select
      v_worker_id,
      b.id,
      p_latitude,
      p_longitude,
      v_location,
      v_recorded_at
    from public.bookings b
    where b.worker_id = v_worker_id
      and b.status in (
        'on_the_way'::public.booking_status,
        'arrived'::public.booking_status,
        'in_progress'::public.booking_status
      );

    /*
     * Recurring bookings use occurrence-level status,
     * while worker_locations remains booking-scoped.
     */
    insert into public.worker_locations(
      worker_id,
      booking_id,
      latitude,
      longitude,
      location,
      recorded_at
    )
    select
      v_worker_id,
      o.booking_id,
      p_latitude,
      p_longitude,
      v_location,
      v_recorded_at
    from public.booking_schedule_occurrences o
    where o.worker_id = v_worker_id
      and o.status in (
        'on_the_way',
        'arrived',
        'in_progress'
      );

  end if;

  perform set_config(
    'app.worker_profile_internal_mutation',
    'location',
    true
  );

  update public.worker_profiles
  set
    current_location = v_location,
    updated_at = v_recorded_at
  where id = v_worker_id;

  return jsonb_build_object(
    'success', true,
    'recorded_at', v_recorded_at,
    'latitude', p_latitude,
    'longitude', p_longitude
  );
end;
$$;


ALTER FUNCTION "public"."worker_update_location"("p_latitude" double precision, "p_longitude" double precision, "p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."worker_withdraw_booking_change_request"("p_request_id" "uuid") RETURNS "public"."worker_booking_change_requests"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_worker_id uuid := (select auth.uid());
  v_request public.worker_booking_change_requests%rowtype;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_request
  from public.worker_booking_change_requests
  where id = p_request_id
    and worker_id = v_worker_id
  for update;

  if not found then
    raise exception 'Worker booking change request not found';
  end if;

  if v_request.status <> 'open' then
    raise exception 'Only open change requests can be withdrawn';
  end if;

  update public.worker_booking_change_requests
  set status='withdrawn', updated_at=now()
  where id=v_request.id
  returning * into v_request;

  return v_request;
end;
$$;


ALTER FUNCTION "public"."worker_withdraw_booking_change_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."write_admin_audit"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid" DEFAULT NULL::"uuid", "p_before" "jsonb" DEFAULT NULL::"jsonb", "p_after" "jsonb" DEFAULT NULL::"jsonb", "p_metadata" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_id uuid;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;
  insert into public.admin_audit_logs(admin_id, action, entity_type, entity_id, before_data, after_data, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_before, p_after, coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;


ALTER FUNCTION "public"."write_admin_audit"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_before" "jsonb", "p_after" "jsonb", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."addresses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "label" "text",
    "address_line" "text" NOT NULL,
    "latitude" double precision NOT NULL,
    "longitude" double precision NOT NULL,
    "location" "public"."geography"(Point,4326) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "addresses_latitude_range_chk" CHECK ((("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision))),
    CONSTRAINT "addresses_longitude_range_chk" CHECK ((("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision)))
);


ALTER TABLE "public"."addresses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "before_data" "jsonb",
    "after_data" "jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "admin_audit_logs_action_nonempty" CHECK (("btrim"("action") <> ''::"text")),
    CONSTRAINT "admin_audit_logs_created_at_present" CHECK (("created_at" IS NOT NULL)),
    CONSTRAINT "admin_audit_logs_entity_type_nonempty" CHECK (("btrim"("entity_type") <> ''::"text"))
);

ALTER TABLE ONLY "public"."admin_audit_logs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_otps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "otp_type" "public"."otp_type" NOT NULL,
    "otp_hash" "text" NOT NULL,
    "status" "public"."otp_status" DEFAULT 'pending'::"public"."otp_status" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    "verified_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "occurrence_id" "uuid"
);


ALTER TABLE "public"."booking_otps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_schedule_occurrences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "worker_id" "uuid",
    "occurrence_index" integer NOT NULL,
    "occurrence_date" "date" NOT NULL,
    "scheduled_start" timestamp with time zone NOT NULL,
    "scheduled_end" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "base_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "discount_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "platform_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "pricing_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "journey_started_at" timestamp with time zone,
    "arrived_at" timestamp with time zone,
    "started_at" timestamp with time zone,
    "start_otp_verified_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "end_otp_verified_at" timestamp with time zone,
    "original_occurrence_date" "date",
    "last_modified_at" timestamp with time zone,
    "last_modified_by" "uuid",
    "cancelled_at" timestamp with time zone,
    "worker_accepted_at" timestamp with time zone,
    CONSTRAINT "booking_occurrences_index_positive" CHECK (("occurrence_index" >= 1)),
    CONSTRAINT "booking_occurrences_minimum_duration" CHECK (("scheduled_end" >= ("scheduled_start" + '01:00:00'::interval))),
    CONSTRAINT "booking_occurrences_time_order" CHECK (("scheduled_end" > "scheduled_start")),
    CONSTRAINT "booking_schedule_occurrences_amounts_nonnegative" CHECK ((("base_amount" >= (0)::numeric) AND ("discount_amount" >= (0)::numeric) AND ("platform_fee" >= (0)::numeric) AND ("tax_amount" >= (0)::numeric) AND ("total_amount" >= (0)::numeric))),
    CONSTRAINT "booking_schedule_occurrences_index_check" CHECK (("occurrence_index" > 0)),
    CONSTRAINT "booking_schedule_occurrences_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'assigned'::"text", 'on_the_way'::"text", 'arrived'::"text", 'in_progress'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "booking_schedule_occurrences_time_check" CHECK (("scheduled_start" < "scheduled_end")),
    CONSTRAINT "booking_schedule_occurrences_timestamps_order" CHECK (((("journey_started_at" IS NULL) OR ("journey_started_at" <= COALESCE("arrived_at", "journey_started_at"))) AND (("arrived_at" IS NULL) OR ("arrived_at" <= COALESCE("started_at", "arrived_at"))) AND (("started_at" IS NULL) OR ("started_at" <= COALESCE("completed_at", "started_at"))))),
    CONSTRAINT "booking_schedule_occurrences_total_reconcile" CHECK (("total_amount" = "round"((("base_amount" + "platform_fee") + "tax_amount"), 2)))
);


ALTER TABLE "public"."booking_schedule_occurrences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_status_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "old_status" "public"."booking_status",
    "new_status" "public"."booking_status" NOT NULL,
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."booking_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."booking_worker_offers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "status" "public"."booking_worker_offer_status" DEFAULT 'pending'::"public"."booking_worker_offer_status" NOT NULL,
    "offered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "responded_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "occurrence_id" "uuid",
    CONSTRAINT "booking_worker_offers_expiry_check" CHECK (("expires_at" > "offered_at")),
    CONSTRAINT "booking_worker_offers_response_check" CHECK (((("status" = 'pending'::"public"."booking_worker_offer_status") AND ("responded_at" IS NULL)) OR (("status" <> 'pending'::"public"."booking_worker_offer_status") AND ("responded_at" IS NOT NULL))))
);

ALTER TABLE ONLY "public"."booking_worker_offers" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_worker_offers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cancellation_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "hours_before_start" numeric(10,2) NOT NULL,
    "refund_percentage" numeric(5,2) NOT NULL,
    "cancellation_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_to" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cancellation_policies_effective_check" CHECK ((("effective_to" IS NULL) OR ("effective_to" > "effective_from"))),
    CONSTRAINT "cancellation_policies_fee_check" CHECK (("cancellation_fee" >= (0)::numeric)),
    CONSTRAINT "cancellation_policies_hours_check" CHECK (("hours_before_start" >= (0)::numeric)),
    CONSTRAINT "cancellation_policies_name_check" CHECK (("btrim"("name") <> ''::"text")),
    CONSTRAINT "cancellation_policies_refund_check" CHECK ((("refund_percentage" >= (0)::numeric) AND ("refund_percentage" <= (100)::numeric)))
);


ALTER TABLE "public"."cancellation_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_message_at" timestamp with time zone,
    "occurrence_id" "uuid",
    CONSTRAINT "conversations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_favourite_services" (
    "customer_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_favourite_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_promotions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "cta_text" "text",
    "service_id" "uuid",
    "image_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "home_promotions_valid_window" CHECK ((("ends_at" IS NULL) OR ("starts_at" IS NULL) OR ("ends_at" > "starts_at")))
);


ALTER TABLE "public"."home_promotions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "cta_text" "text",
    "service_id" "uuid",
    "image_url" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."home_updates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."idempotency_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" character varying(255) NOT NULL,
    "idempotency_key" character varying(255) NOT NULL,
    "request_hash" character varying(64) NOT NULL,
    "status" "public"."idempotency_status" DEFAULT 'in_progress'::"public"."idempotency_status" NOT NULL,
    "response_body" "jsonb",
    "response_status_code" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."idempotency_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "invoice_number" "text" NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "base_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "platform_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "pricing_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_amounts_chk" CHECK ((("base_amount" >= (0)::numeric) AND ("platform_fee" >= (0)::numeric) AND ("tax_amount" >= (0)::numeric) AND ("total_amount" >= (0)::numeric))),
    CONSTRAINT "invoices_status_chk" CHECK (("status" = ANY (ARRAY['issued'::"text", 'void'::"text"]))),
    CONSTRAINT "invoices_total_chk" CHECK (("total_amount" = "round"((("base_amount" + "platform_fee") + "tax_amount"), 2)))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."message_read_receipts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."message_read_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "sender_role" "text" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "messages_body_check" CHECK ((("length"(TRIM(BOTH FROM "body")) >= 1) AND ("length"(TRIM(BOTH FROM "body")) <= 4000))),
    CONSTRAINT "messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'system'::"text"]))),
    CONSTRAINT "messages_sender_role_check" CHECK (("sender_role" = ANY (ARRAY['customer'::"text", 'worker'::"text", 'system'::"text"])))
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_refunds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "reason" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider_refund_id" "text",
    "failure_reason" "text",
    "requested_by" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "occurrence_id" "uuid",
    "refund_request_id" "uuid",
    CONSTRAINT "payment_refunds_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "payment_refunds_occurrence_booking_check" CHECK ((("occurrence_id" IS NULL) OR ("booking_id" IS NOT NULL))),
    CONSTRAINT "payment_refunds_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'succeeded'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."payment_refunds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" DEFAULT 'razorpay'::"text" NOT NULL,
    "event_id" "text" NOT NULL,
    "event_name" "text" NOT NULL,
    "signature_verified" boolean DEFAULT false NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'received'::"text" NOT NULL,
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "payment_webhook_events_signature_check" CHECK (("signature_verified" = true)),
    CONSTRAINT "payment_webhook_events_status_check" CHECK (("status" = ANY (ARRAY['received'::"text", 'processed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."payment_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "provider" "text" DEFAULT 'razorpay'::"text" NOT NULL,
    "provider_order_id" "text",
    "provider_payment_id" "text",
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_settings" (
    "key" "text" NOT NULL,
    "value" "jsonb" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_settings_key_check" CHECK (("length"(TRIM(BOTH FROM "key")) > 0))
);


ALTER TABLE "public"."platform_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text",
    "phone" "text",
    "email" "text",
    "role" "public"."user_role" DEFAULT 'customer'::"public"."user_role" NOT NULL,
    "avatar_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "company_name" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotion_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "promotion_id" "uuid" NOT NULL,
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(12,2) NOT NULL,
    "discount_currency" "text",
    "minimum_hours" numeric(12,2) DEFAULT 0 NOT NULL,
    "maximum_discount_amount" numeric(12,2),
    "priority" integer DEFAULT 0 NOT NULL,
    "stackable_with_duration_discount" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "promotion_rules_currency_check" CHECK ((("discount_type" = 'percent'::"text") OR ("discount_currency" IS NOT NULL))),
    CONSTRAINT "promotion_rules_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text"]))),
    CONSTRAINT "promotion_rules_discount_value_check" CHECK (("discount_value" > (0)::numeric)),
    CONSTRAINT "promotion_rules_max_discount_type_check" CHECK ((("discount_type" = 'percent'::"text") OR ("maximum_discount_amount" IS NULL))),
    CONSTRAINT "promotion_rules_maximum_discount_amount_check" CHECK ((("maximum_discount_amount" IS NULL) OR ("maximum_discount_amount" > (0)::numeric))),
    CONSTRAINT "promotion_rules_minimum_hours_check" CHECK (("minimum_hours" >= (0)::numeric))
);


ALTER TABLE "public"."promotion_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."razorpay_webhook_events" (
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "order_id" "text",
    "payment_id" "text",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payload" "jsonb" NOT NULL
);


ALTER TABLE "public"."razorpay_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refund_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "payment_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" "text" DEFAULT 'INR'::"text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "reason" "text",
    "provider_refund_id" "text",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "refund_requests_amount_chk" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "refund_requests_status_chk" CHECK (("status" = ANY (ARRAY['requested'::"text", 'processing'::"text", 'succeeded'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."refund_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "moderation_status" "text" DEFAULT 'published'::"text" NOT NULL,
    "moderated_at" timestamp with time zone,
    "moderated_by" "uuid",
    "moderation_reason" "text",
    "occurrence_id" "uuid",
    CONSTRAINT "reviews_moderation_status_check" CHECK (("moderation_status" = ANY (ARRAY['published'::"text", 'hidden'::"text", 'flagged'::"text"]))),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_booking_schedule_policies" (
    "service_id" "uuid" NOT NULL,
    "timezone" "text" NOT NULL,
    "working_weekdays" smallint[] NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_booking_schedule_policies_timezone_check" CHECK (("length"(TRIM(BOTH FROM "timezone")) > 0)),
    CONSTRAINT "service_booking_schedule_policies_weekdays_check" CHECK (((("cardinality"("working_weekdays") >= 1) AND ("cardinality"("working_weekdays") <= 7)) AND ("working_weekdays" <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint])))
);


ALTER TABLE "public"."service_booking_schedule_policies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "description" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."service_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_discount_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "min_hours" numeric(12,2) NOT NULL,
    "max_hours" numeric(12,2),
    "discount_percent" numeric(5,2) NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_to" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_discount_tiers_check" CHECK ((("max_hours" IS NULL) OR ("max_hours" > "min_hours"))),
    CONSTRAINT "service_discount_tiers_discount_percent_check" CHECK ((("discount_percent" >= (0)::numeric) AND ("discount_percent" <= (100)::numeric))),
    CONSTRAINT "service_discount_tiers_effective_check" CHECK ((("effective_to" IS NULL) OR ("effective_to" > "effective_from"))),
    CONSTRAINT "service_discount_tiers_min_hours_check" CHECK (("min_hours" >= (0)::numeric)),
    CONSTRAINT "service_discount_tiers_name_check" CHECK (("length"(TRIM(BOTH FROM "name")) > 0))
);


ALTER TABLE "public"."service_discount_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_hourly_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "currency" "text" NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_to" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_hourly_prices_currency_check" CHECK (("length"(TRIM(BOTH FROM "currency")) > 0)),
    CONSTRAINT "service_hourly_prices_effective_check" CHECK ((("effective_to" IS NULL) OR ("effective_to" > "effective_from"))),
    CONSTRAINT "service_hourly_prices_price_check" CHECK (("price" > (0)::numeric))
);


ALTER TABLE "public"."service_hourly_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_recurring_discount_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "min_calendar_days" numeric(12,2) NOT NULL,
    "max_calendar_days" numeric(12,2),
    "discount_percent" numeric(5,2) NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_to" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_recurring_discount_tiers_effective_check" CHECK ((("effective_to" IS NULL) OR ("effective_to" > "effective_from"))),
    CONSTRAINT "service_recurring_discount_tiers_max_check" CHECK ((("max_calendar_days" IS NULL) OR ("max_calendar_days" > "min_calendar_days"))),
    CONSTRAINT "service_recurring_discount_tiers_min_check" CHECK (("min_calendar_days" > (0)::numeric)),
    CONSTRAINT "service_recurring_discount_tiers_percent_check" CHECK ((("discount_percent" >= (0)::numeric) AND ("discount_percent" <= (100)::numeric)))
);


ALTER TABLE "public"."service_recurring_discount_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_variant_discount_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_variant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "min_hours" numeric(12,2) NOT NULL,
    "max_hours" numeric(12,2),
    "discount_percent" numeric(5,2) NOT NULL,
    "priority" integer DEFAULT 0 NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_to" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_variant_discount_tiers_check" CHECK ((("max_hours" IS NULL) OR ("max_hours" > "min_hours"))),
    CONSTRAINT "service_variant_discount_tiers_discount_percent_check" CHECK ((("discount_percent" >= (0)::numeric) AND ("discount_percent" <= (100)::numeric))),
    CONSTRAINT "service_variant_discount_tiers_effective_check" CHECK ((("effective_to" IS NULL) OR ("effective_to" > "effective_from"))),
    CONSTRAINT "service_variant_discount_tiers_min_hours_check" CHECK (("min_hours" >= (0)::numeric)),
    CONSTRAINT "service_variant_discount_tiers_name_check" CHECK (("length"(TRIM(BOTH FROM "name")) > 0))
);


ALTER TABLE "public"."service_variant_discount_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_variant_hourly_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_variant_id" "uuid" NOT NULL,
    "price" numeric(12,2) NOT NULL,
    "currency" "text" NOT NULL,
    "effective_from" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effective_to" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_variant_hourly_prices_currency_check" CHECK (("length"(TRIM(BOTH FROM "currency")) > 0)),
    CONSTRAINT "service_variant_hourly_prices_effective_check" CHECK ((("effective_to" IS NULL) OR ("effective_to" > "effective_from"))),
    CONSTRAINT "service_variant_hourly_prices_price_check" CHECK (("price" > (0)::numeric))
);


ALTER TABLE "public"."service_variant_hourly_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_variant_scheduling_rules" (
    "service_variant_id" "uuid" NOT NULL,
    "scheduling_mode" "text" NOT NULL,
    "working_days" integer,
    "daily_duration_minutes" integer,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "service_variant_scheduling_rules_continuous_fields_check" CHECK ((("scheduling_mode" <> 'continuous'::"text") OR (("working_days" IS NULL) AND ("daily_duration_minutes" IS NULL)))),
    CONSTRAINT "service_variant_scheduling_rules_daily_duration_check" CHECK ((("daily_duration_minutes" IS NULL) OR ("daily_duration_minutes" > 0))),
    CONSTRAINT "service_variant_scheduling_rules_mode_check" CHECK (("scheduling_mode" = ANY (ARRAY['continuous'::"text", 'working_days'::"text"]))),
    CONSTRAINT "service_variant_scheduling_rules_working_days_check" CHECK ((("working_days" IS NULL) OR ("working_days" > 0))),
    CONSTRAINT "service_variant_scheduling_rules_working_days_fields_check" CHECK ((("scheduling_mode" <> 'working_days'::"text") OR ("working_days" IS NOT NULL)))
);


ALTER TABLE "public"."service_variant_scheduling_rules" OWNER TO "postgres";


COMMENT ON TABLE "public"."service_variant_scheduling_rules" IS 'Database-configured scheduling semantics for service variants. Does not alter the existing service catalogue.';



COMMENT ON COLUMN "public"."service_variant_scheduling_rules"."scheduling_mode" IS 'continuous = one continuous booking interval; working_days = staffing occurs across worker working schedule windows.';



COMMENT ON COLUMN "public"."service_variant_scheduling_rules"."working_days" IS 'Number of worker working days required by the service variant when using working_days scheduling.';



COMMENT ON COLUMN "public"."service_variant_scheduling_rules"."daily_duration_minutes" IS 'Optional daily staffing duration for working_days scheduling. NULL means the worker schedule window determines the daily duration.';



CREATE TABLE IF NOT EXISTS "public"."worker_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "available_from" timestamp with time zone NOT NULL,
    "available_until" timestamp with time zone NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_availability_time_valid" CHECK (("available_from" < "available_until"))
);


ALTER TABLE "public"."worker_availability" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_earnings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "gross_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "platform_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "net_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_earnings_amounts_check" CHECK ((("gross_amount" >= (0)::numeric) AND ("platform_fee" >= (0)::numeric) AND ("net_amount" >= (0)::numeric) AND ("net_amount" = ("gross_amount" - "platform_fee"))))
);


ALTER TABLE "public"."worker_earnings" OWNER TO "postgres";


ALTER TABLE "public"."worker_locations" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."worker_locations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."worker_payout_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "payout_id" "uuid" NOT NULL,
    "earning_id" "uuid" NOT NULL,
    "amount" numeric NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_payout_items_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."worker_payout_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_payout_webhook_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "provider_payout_id" "text",
    "provider_status" "text",
    "amount" numeric,
    "currency" "text",
    "fund_account_id" "text",
    "utr" "text",
    "status_details" "jsonb",
    "received_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    "processing_error" "text"
);


ALTER TABLE "public"."worker_payout_webhook_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_presence" (
    "worker_id" "uuid" NOT NULL,
    "is_available" boolean DEFAULT false NOT NULL,
    "last_seen_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "was_available_before_busy" boolean DEFAULT false NOT NULL,
    CONSTRAINT "worker_presence_expiry_check" CHECK ((("expires_at" IS NULL) OR ("last_seen_at" IS NULL) OR ("expires_at" >= "last_seen_at")))
);


ALTER TABLE "public"."worker_presence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_profiles" (
    "id" "uuid" NOT NULL,
    "worker_status" "public"."worker_status" DEFAULT 'offline'::"public"."worker_status" NOT NULL,
    "service_radius_km" numeric(6,2) DEFAULT 10 NOT NULL,
    "current_location" "public"."geography"(Point,4326),
    "is_verified" boolean DEFAULT false NOT NULL,
    "rating" numeric(3,2) DEFAULT 0 NOT NULL,
    "total_completed_jobs" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_featured" boolean DEFAULT false NOT NULL,
    CONSTRAINT "worker_profiles_rating_check" CHECK ((("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric))),
    CONSTRAINT "worker_profiles_service_radius_km_check" CHECK ((("service_radius_km" > (0)::numeric) AND ("service_radius_km" <= (10)::numeric))),
    CONSTRAINT "worker_profiles_total_completed_jobs_check" CHECK (("total_completed_jobs" >= 0))
);


ALTER TABLE "public"."worker_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_push_deliveries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "notification_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "push_token_id" "uuid",
    "token_hash" "text" NOT NULL,
    "expo_ticket_id" "text",
    "ticket_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "ticket_error" "text",
    "receipt_status" "text",
    "receipt_error" "text",
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "receipt_checked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_push_deliveries_receipt_status_check" CHECK (("receipt_status" = ANY (ARRAY['pending'::"text", 'ok'::"text", 'error'::"text", 'expired'::"text", 'not_applicable'::"text"]))),
    CONSTRAINT "worker_push_deliveries_ticket_status_check" CHECK (("ticket_status" = ANY (ARRAY['pending'::"text", 'ok'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."worker_push_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_push_tokens" (
    "worker_id" "uuid" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "device_type" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."worker_push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_schedule_exceptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "exception_date" "date" NOT NULL,
    "exception_type" "text" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "reason" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_schedule_exceptions_reason_check" CHECK ((("reason" IS NULL) OR ("length"(TRIM(BOTH FROM "reason")) > 0))),
    CONSTRAINT "worker_schedule_exceptions_time_pair_check" CHECK (((("start_time" IS NULL) AND ("end_time" IS NULL)) OR (("start_time" IS NOT NULL) AND ("end_time" IS NOT NULL) AND ("start_time" < "end_time")))),
    CONSTRAINT "worker_schedule_exceptions_type_check" CHECK (("exception_type" = ANY (ARRAY['unavailable'::"text", 'available'::"text"])))
);


ALTER TABLE "public"."worker_schedule_exceptions" OWNER TO "postgres";


COMMENT ON TABLE "public"."worker_schedule_exceptions" IS 'Date-specific overrides to a worker weekly schedule. Exceptions can block an entire date or define an additional available window.';



COMMENT ON COLUMN "public"."worker_schedule_exceptions"."exception_type" IS 'available adds an availability window; unavailable removes availability for the entire date or specified time window.';



COMMENT ON COLUMN "public"."worker_schedule_exceptions"."start_time" IS 'Optional local start time. NULL together with end_time means the exception applies to the entire date.';



COMMENT ON COLUMN "public"."worker_schedule_exceptions"."end_time" IS 'Optional local end time. NULL together with start_time means the exception is invalid.';



CREATE TABLE IF NOT EXISTS "public"."worker_schedule_settings" (
    "worker_id" "uuid" NOT NULL,
    "timezone" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "slot_interval_minutes" integer,
    CONSTRAINT "worker_schedule_settings_slot_interval_check" CHECK ((("slot_interval_minutes" IS NULL) OR ("slot_interval_minutes" > 0))),
    CONSTRAINT "worker_schedule_settings_timezone_not_blank" CHECK (("length"(TRIM(BOTH FROM "timezone")) > 0))
);


ALTER TABLE "public"."worker_schedule_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."worker_schedule_settings" IS 'Per-worker scheduling configuration. Stores the IANA timezone used to interpret recurring schedule times.';



COMMENT ON COLUMN "public"."worker_schedule_settings"."timezone" IS 'IANA timezone identifier used for the worker schedule, for example a valid application-selected timezone.';



CREATE TABLE IF NOT EXISTS "public"."worker_services" (
    "worker_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."worker_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."worker_weekly_schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "worker_id" "uuid" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "worker_weekly_schedules_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "worker_weekly_schedules_time_order_check" CHECK (("start_time" < "end_time"))
);


ALTER TABLE "public"."worker_weekly_schedules" OWNER TO "postgres";


COMMENT ON TABLE "public"."worker_weekly_schedules" IS 'Recurring weekly working windows for workers. One worker may have multiple non-overlapping windows per day.';



COMMENT ON COLUMN "public"."worker_weekly_schedules"."day_of_week" IS 'Weekday number where 0=Sunday and 6=Saturday.';



COMMENT ON COLUMN "public"."worker_weekly_schedules"."start_time" IS 'Local schedule start time interpreted using the worker schedule timezone.';



COMMENT ON COLUMN "public"."worker_weekly_schedules"."end_time" IS 'Local schedule end time interpreted using the worker schedule timezone.';



ALTER TABLE ONLY "public"."account_deletion_requests"
    ADD CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_schedule_occurrences"
    ADD CONSTRAINT "booking_occurrences_worker_time_no_overlap" EXCLUDE USING "gist" ("worker_id" WITH =, "tstzrange"("scheduled_start", "scheduled_end", '[)'::"text") WITH &&) WHERE ((("worker_id" IS NOT NULL) AND ("status" = ANY (ARRAY['scheduled'::"text", 'in_progress'::"text"]))));



ALTER TABLE ONLY "public"."booking_schedule_occurrences"
    ADD CONSTRAINT "booking_occurrences_worker_time_no_overlap_active" EXCLUDE USING "gist" ("worker_id" WITH =, "tstzrange"("scheduled_start", "scheduled_end", '[)'::"text") WITH &&) WHERE ((("worker_id" IS NOT NULL) AND ("status" = ANY (ARRAY['scheduled'::"text", 'assigned'::"text", 'on_the_way'::"text", 'arrived'::"text", 'in_progress'::"text"]))));



ALTER TABLE ONLY "public"."booking_otps"
    ADD CONSTRAINT "booking_otps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_schedule_occurrences"
    ADD CONSTRAINT "booking_schedule_occurrences_booking_date_unique" UNIQUE ("booking_id", "occurrence_date");



ALTER TABLE ONLY "public"."booking_schedule_occurrences"
    ADD CONSTRAINT "booking_schedule_occurrences_booking_index_unique" UNIQUE ("booking_id", "occurrence_index");



ALTER TABLE ONLY "public"."booking_schedule_occurrences"
    ADD CONSTRAINT "booking_schedule_occurrences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_status_history"
    ADD CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."booking_worker_offers"
    ADD CONSTRAINT "booking_worker_offers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cancellation_policies"
    ADD CONSTRAINT "cancellation_policies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_favourite_services"
    ADD CONSTRAINT "customer_favourite_services_pkey" PRIMARY KEY ("customer_id", "service_id");



ALTER TABLE ONLY "public"."home_promotions"
    ADD CONSTRAINT "home_promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_updates"
    ADD CONSTRAINT "home_updates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."idempotency_keys"
    ADD CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_message_id_user_id_key" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_webhook_events"
    ADD CONSTRAINT "payment_webhook_events_provider_event_key" UNIQUE ("provider", "event_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."platform_settings"
    ADD CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotion_rules"
    ADD CONSTRAINT "promotion_rules_one_rule_per_promotion" UNIQUE ("promotion_id");



ALTER TABLE ONLY "public"."promotion_rules"
    ADD CONSTRAINT "promotion_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."razorpay_webhook_events"
    ADD CONSTRAINT "razorpay_webhook_events_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_payment_id_key" UNIQUE ("payment_id");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_provider_refund_id_key" UNIQUE ("provider_refund_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_area_groups"
    ADD CONSTRAINT "service_area_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_areas"
    ADD CONSTRAINT "service_areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_availability_requests"
    ADD CONSTRAINT "service_availability_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_booking_schedule_policies"
    ADD CONSTRAINT "service_booking_schedule_policies_pkey" PRIMARY KEY ("service_id");



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_categories"
    ADD CONSTRAINT "service_categories_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."service_discount_tiers"
    ADD CONSTRAINT "service_discount_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_hourly_prices"
    ADD CONSTRAINT "service_hourly_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_recurring_discount_tiers"
    ADD CONSTRAINT "service_recurring_discount_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_variant_discount_tiers"
    ADD CONSTRAINT "service_variant_discount_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_variant_hourly_prices"
    ADD CONSTRAINT "service_variant_hourly_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_variant_prices"
    ADD CONSTRAINT "service_variant_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_variant_scheduling_rules"
    ADD CONSTRAINT "service_variant_scheduling_rules_pkey" PRIMARY KEY ("service_variant_id");



ALTER TABLE ONLY "public"."service_variants"
    ADD CONSTRAINT "service_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."idempotency_keys"
    ADD CONSTRAINT "uq_idempotency_key" UNIQUE ("user_id", "action", "idempotency_key");



ALTER TABLE ONLY "public"."worker_applications"
    ADD CONSTRAINT "worker_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_applications"
    ADD CONSTRAINT "worker_applications_worker_id_key" UNIQUE ("worker_id");



ALTER TABLE ONLY "public"."worker_availability"
    ADD CONSTRAINT "worker_availability_no_overlap" EXCLUDE USING "gist" ("worker_id" WITH =, "tstzrange"("available_from", "available_until", '[)'::"text") WITH &&) WHERE (("is_available" = true));



ALTER TABLE ONLY "public"."worker_availability"
    ADD CONSTRAINT "worker_availability_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_booking_change_requests"
    ADD CONSTRAINT "worker_booking_change_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_booking_incidents"
    ADD CONSTRAINT "worker_booking_incidents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_documents"
    ADD CONSTRAINT "worker_documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_earnings"
    ADD CONSTRAINT "worker_earnings_booking_id_key" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."worker_earnings"
    ADD CONSTRAINT "worker_earnings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_locations"
    ADD CONSTRAINT "worker_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_onboarding_profiles"
    ADD CONSTRAINT "worker_onboarding_profiles_pkey" PRIMARY KEY ("worker_id");



ALTER TABLE ONLY "public"."worker_payout_accounts"
    ADD CONSTRAINT "worker_payout_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_payout_items"
    ADD CONSTRAINT "worker_payout_items_payout_id_earning_id_key" UNIQUE ("payout_id", "earning_id");



ALTER TABLE ONLY "public"."worker_payout_items"
    ADD CONSTRAINT "worker_payout_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_payout_webhook_events"
    ADD CONSTRAINT "worker_payout_webhook_events_event_id_key" UNIQUE ("event_id");



ALTER TABLE ONLY "public"."worker_payout_webhook_events"
    ADD CONSTRAINT "worker_payout_webhook_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_payouts"
    ADD CONSTRAINT "worker_payouts_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."worker_payouts"
    ADD CONSTRAINT "worker_payouts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_presence"
    ADD CONSTRAINT "worker_presence_pkey" PRIMARY KEY ("worker_id");



ALTER TABLE ONLY "public"."worker_profiles"
    ADD CONSTRAINT "worker_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_push_deliveries"
    ADD CONSTRAINT "worker_push_deliveries_notification_id_push_token_id_key" UNIQUE ("notification_id", "push_token_id");



ALTER TABLE ONLY "public"."worker_push_deliveries"
    ADD CONSTRAINT "worker_push_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_push_tokens"
    ADD CONSTRAINT "worker_push_tokens_expo_push_token_key" UNIQUE ("expo_push_token");



ALTER TABLE ONLY "public"."worker_push_tokens"
    ADD CONSTRAINT "worker_push_tokens_pkey" PRIMARY KEY ("worker_id");



ALTER TABLE ONLY "public"."worker_schedule_exceptions"
    ADD CONSTRAINT "worker_schedule_exceptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."worker_schedule_settings"
    ADD CONSTRAINT "worker_schedule_settings_pkey" PRIMARY KEY ("worker_id");



ALTER TABLE ONLY "public"."worker_services"
    ADD CONSTRAINT "worker_services_pkey" PRIMARY KEY ("worker_id", "service_id");



ALTER TABLE ONLY "public"."worker_weekly_schedules"
    ADD CONSTRAINT "worker_weekly_schedules_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "account_deletion_one_auth_retry_per_user" ON "public"."account_deletion_requests" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE UNIQUE INDEX "account_deletion_requests_one_active_per_user" ON "public"."account_deletion_requests" USING "btree" ("user_id") WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "account_deletion_requests_reviewed_by_idx" ON "public"."account_deletion_requests" USING "btree" ("reviewed_by");



CREATE INDEX "account_deletion_requests_status_idx" ON "public"."account_deletion_requests" USING "btree" ("status");



CREATE INDEX "account_deletion_requests_user_id_idx" ON "public"."account_deletion_requests" USING "btree" ("user_id");



CREATE INDEX "addresses_user_id_idx" ON "public"."addresses" USING "btree" ("user_id");



CREATE INDEX "admin_audit_logs_admin_created_idx" ON "public"."admin_audit_logs" USING "btree" ("admin_id", "created_at" DESC);



CREATE INDEX "admin_audit_logs_entity_idx" ON "public"."admin_audit_logs" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "booking_otps_booking_id_idx" ON "public"."booking_otps" USING "btree" ("booking_id");



CREATE INDEX "booking_schedule_occurrences_booking_idx" ON "public"."booking_schedule_occurrences" USING "btree" ("booking_id");



CREATE INDEX "booking_schedule_occurrences_date_idx" ON "public"."booking_schedule_occurrences" USING "btree" ("occurrence_date");



CREATE INDEX "booking_schedule_occurrences_last_modified_by_idx" ON "public"."booking_schedule_occurrences" USING "btree" ("last_modified_by");



CREATE INDEX "booking_schedule_occurrences_worker_time_idx" ON "public"."booking_schedule_occurrences" USING "btree" ("worker_id", "scheduled_start", "scheduled_end");



CREATE INDEX "booking_status_history_booking_id_idx" ON "public"."booking_status_history" USING "btree" ("booking_id");



CREATE INDEX "booking_status_history_changed_by_idx" ON "public"."booking_status_history" USING "btree" ("changed_by");



CREATE INDEX "booking_worker_offers_booking_idx" ON "public"."booking_worker_offers" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "booking_worker_offers_expiry_idx" ON "public"."booking_worker_offers" USING "btree" ("expires_at") WHERE ("status" = 'pending'::"public"."booking_worker_offer_status");



CREATE INDEX "booking_worker_offers_occurrence_idx" ON "public"."booking_worker_offers" USING "btree" ("occurrence_id", "status", "expires_at") WHERE ("occurrence_id" IS NOT NULL);



CREATE UNIQUE INDEX "booking_worker_offers_one_pending_per_worker" ON "public"."booking_worker_offers" USING "btree" ("booking_id", "worker_id", COALESCE("occurrence_id", '00000000-0000-0000-0000-000000000000'::"uuid")) WHERE ("status" = 'pending'::"public"."booking_worker_offer_status");



CREATE INDEX "booking_worker_offers_worker_idx" ON "public"."booking_worker_offers" USING "btree" ("worker_id", "status", "created_at" DESC);



CREATE INDEX "bookings_address_id_idx" ON "public"."bookings" USING "btree" ("address_id");



CREATE INDEX "bookings_applied_promotion_idx" ON "public"."bookings" USING "btree" ("applied_promotion_id") WHERE ("applied_promotion_id" IS NOT NULL);



CREATE INDEX "bookings_fulfillment_status_schedule_idx" ON "public"."bookings" USING "btree" ("fulfillment_type", "status", "scheduled_start");



CREATE INDEX "bookings_journey_started_by_idx" ON "public"."bookings" USING "btree" ("journey_started_by");



CREATE INDEX "bookings_service_id_idx" ON "public"."bookings" USING "btree" ("service_id");



CREATE INDEX "bookings_service_variant_id_idx" ON "public"."bookings" USING "btree" ("service_variant_id");



CREATE INDEX "bookings_started_by_idx" ON "public"."bookings" USING "btree" ("started_by");



CREATE INDEX "bookings_status_schedule_idx" ON "public"."bookings" USING "btree" ("status", "scheduled_start");



CREATE INDEX "bookings_worker_active_schedule_idx" ON "public"."bookings" USING "btree" ("worker_id", "scheduled_start", "scheduled_end") WHERE ("worker_id" IS NOT NULL);



CREATE INDEX "bookings_worker_id_status_scheduled_idx" ON "public"."bookings" USING "btree" ("worker_id", "status", "scheduled_start", "scheduled_end");



CREATE INDEX "cancellation_policies_lookup_idx" ON "public"."cancellation_policies" USING "btree" ("is_active", "effective_from", "hours_before_start" DESC, "priority" DESC);



CREATE UNIQUE INDEX "conversations_booking_occurrence_uidx" ON "public"."conversations" USING "btree" ("booking_id", COALESCE("occurrence_id", '00000000-0000-0000-0000-000000000000'::"uuid"));



CREATE INDEX "conversations_customer_id_idx" ON "public"."conversations" USING "btree" ("customer_id");



CREATE INDEX "conversations_occurrence_id_idx" ON "public"."conversations" USING "btree" ("occurrence_id");



CREATE INDEX "conversations_worker_id_idx" ON "public"."conversations" USING "btree" ("worker_id");



CREATE INDEX "customer_favourite_services_service_id_idx" ON "public"."customer_favourite_services" USING "btree" ("service_id");



CREATE INDEX "home_promotions_active_window_idx" ON "public"."home_promotions" USING "btree" ("is_active", "sort_order", "starts_at", "ends_at");



CREATE INDEX "home_promotions_service_id_idx" ON "public"."home_promotions" USING "btree" ("service_id");



CREATE INDEX "home_updates_active_schedule_idx" ON "public"."home_updates" USING "btree" ("is_active", "starts_at", "ends_at", "sort_order");



CREATE INDEX "home_updates_service_id_idx" ON "public"."home_updates" USING "btree" ("service_id");



CREATE INDEX "idx_booking_occurrences_booking_status" ON "public"."booking_schedule_occurrences" USING "btree" ("booking_id", "status", "scheduled_start");



CREATE INDEX "idx_booking_otps_occurrence_type" ON "public"."booking_otps" USING "btree" ("occurrence_id", "otp_type", "status", "created_at" DESC);



CREATE UNIQUE INDEX "idx_booking_otps_one_pending_per_booking_type" ON "public"."booking_otps" USING "btree" ("booking_id", "otp_type") WHERE (("occurrence_id" IS NULL) AND ("status" = 'pending'::"public"."otp_status"));



CREATE UNIQUE INDEX "idx_booking_otps_one_pending_per_occurrence_type" ON "public"."booking_otps" USING "btree" ("occurrence_id", "otp_type") WHERE (("occurrence_id" IS NOT NULL) AND ("status" = 'pending'::"public"."otp_status"));



CREATE INDEX "idx_booking_schedule_occurrences_booking_date" ON "public"."booking_schedule_occurrences" USING "btree" ("booking_id", "occurrence_date");



CREATE INDEX "idx_booking_status_history_booking_created" ON "public"."booking_status_history" USING "btree" ("booking_id", "created_at", "id");



CREATE INDEX "idx_bookings_completed_at" ON "public"."bookings" USING "btree" ("completed_at") WHERE ("completed_at" IS NOT NULL);



CREATE INDEX "idx_bookings_customer" ON "public"."bookings" USING "btree" ("customer_id");



CREATE INDEX "idx_bookings_journey_started_at" ON "public"."bookings" USING "btree" ("journey_started_at") WHERE ("journey_started_at" IS NOT NULL);



CREATE INDEX "idx_bookings_scheduled_start" ON "public"."bookings" USING "btree" ("scheduled_start");



CREATE INDEX "idx_bookings_status" ON "public"."bookings" USING "btree" ("status");



CREATE INDEX "idx_bookings_worker" ON "public"."bookings" USING "btree" ("worker_id");



CREATE INDEX "idx_bookings_worker_schedule" ON "public"."bookings" USING "btree" ("worker_id", "scheduled_start", "scheduled_end");



CREATE INDEX "idx_idempotency_keys_created_at" ON "public"."idempotency_keys" USING "btree" ("created_at");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_push_tokens_user" ON "public"."push_tokens" USING "btree" ("user_id");



CREATE INDEX "idx_service_areas_group" ON "public"."service_areas" USING "btree" ("group_id");



CREATE INDEX "idx_service_areas_service_active" ON "public"."service_areas" USING "btree" ("service_id", "is_active");



CREATE INDEX "idx_service_availability_requests_pending_service" ON "public"."service_availability_requests" USING "btree" ("service_id", "status", "created_at");



CREATE INDEX "idx_service_booking_schedule_policies_active" ON "public"."service_booking_schedule_policies" USING "btree" ("is_active");



CREATE INDEX "idx_service_discount_tiers_lookup" ON "public"."service_discount_tiers" USING "btree" ("service_id", "is_active", "min_hours" DESC);



CREATE INDEX "idx_service_hourly_prices_lookup" ON "public"."service_hourly_prices" USING "btree" ("service_id", "is_active", "effective_from" DESC);



CREATE INDEX "idx_service_variant_discount_tiers_lookup" ON "public"."service_variant_discount_tiers" USING "btree" ("service_variant_id", "is_active", "min_hours" DESC);



CREATE INDEX "idx_service_variant_hourly_prices_lookup" ON "public"."service_variant_hourly_prices" USING "btree" ("service_variant_id", "is_active", "effective_from" DESC);



CREATE INDEX "idx_service_variant_prices_variant" ON "public"."service_variant_prices" USING "btree" ("service_variant_id", "is_active", "effective_from" DESC);



CREATE INDEX "idx_service_variants_active" ON "public"."service_variants" USING "btree" ("service_id", "is_active", "sort_order");



CREATE INDEX "idx_service_variants_service_id" ON "public"."service_variants" USING "btree" ("service_id");



CREATE INDEX "idx_worker_booking_change_requests_booking_created" ON "public"."worker_booking_change_requests" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "idx_worker_booking_change_requests_occurrence" ON "public"."worker_booking_change_requests" USING "btree" ("occurrence_id");



CREATE INDEX "idx_worker_booking_change_requests_open" ON "public"."worker_booking_change_requests" USING "btree" ("status", "created_at" DESC) WHERE ("status" = 'open'::"text");



CREATE INDEX "idx_worker_booking_change_requests_reviewed_by" ON "public"."worker_booking_change_requests" USING "btree" ("reviewed_by");



CREATE INDEX "idx_worker_booking_change_requests_worker_created" ON "public"."worker_booking_change_requests" USING "btree" ("worker_id", "created_at" DESC);



CREATE INDEX "idx_worker_booking_incidents_booking_created" ON "public"."worker_booking_incidents" USING "btree" ("booking_id", "created_at" DESC);



CREATE INDEX "idx_worker_booking_incidents_occurrence" ON "public"."worker_booking_incidents" USING "btree" ("occurrence_id");



CREATE INDEX "idx_worker_booking_incidents_open" ON "public"."worker_booking_incidents" USING "btree" ("status", "created_at" DESC) WHERE ("status" = ANY (ARRAY['open'::"text", 'in_review'::"text"]));



CREATE INDEX "idx_worker_booking_incidents_worker_created" ON "public"."worker_booking_incidents" USING "btree" ("worker_id", "created_at" DESC);



CREATE INDEX "idx_worker_locations_booking" ON "public"."worker_locations" USING "btree" ("booking_id");



CREATE INDEX "idx_worker_locations_location" ON "public"."worker_locations" USING "gist" ("location");



CREATE INDEX "idx_worker_locations_worker" ON "public"."worker_locations" USING "btree" ("worker_id");



CREATE INDEX "idx_worker_onboarding_profiles_step" ON "public"."worker_onboarding_profiles" USING "btree" ("onboarding_step");



CREATE INDEX "idx_worker_payout_accounts_worker_status" ON "public"."worker_payout_accounts" USING "btree" ("worker_id", "status", "created_at" DESC);



CREATE INDEX "idx_worker_payout_items_earning" ON "public"."worker_payout_items" USING "btree" ("earning_id");



CREATE INDEX "idx_worker_payout_items_payout" ON "public"."worker_payout_items" USING "btree" ("payout_id");



CREATE INDEX "idx_worker_payout_webhook_events_payout" ON "public"."worker_payout_webhook_events" USING "btree" ("provider_payout_id", "received_at" DESC);



CREATE INDEX "idx_worker_payout_webhook_events_unprocessed" ON "public"."worker_payout_webhook_events" USING "btree" ("received_at" DESC) WHERE ("processed_at" IS NULL);



CREATE INDEX "idx_worker_payouts_payout_account" ON "public"."worker_payouts" USING "btree" ("payout_account_id");



CREATE INDEX "idx_worker_payouts_status_created" ON "public"."worker_payouts" USING "btree" ("status", "created_at");



CREATE INDEX "idx_worker_payouts_worker_created" ON "public"."worker_payouts" USING "btree" ("worker_id", "created_at" DESC);



CREATE INDEX "idx_worker_profiles_location" ON "public"."worker_profiles" USING "gist" ("current_location");



CREATE INDEX "idx_worker_push_deliveries_receipt_queue" ON "public"."worker_push_deliveries" USING "btree" ("sent_at") WHERE (("expo_ticket_id" IS NOT NULL) AND ("receipt_status" = 'pending'::"text"));



CREATE INDEX "idx_worker_services_service" ON "public"."worker_services" USING "btree" ("service_id");



CREATE INDEX "invoices_booking_idx" ON "public"."invoices" USING "btree" ("booking_id");



CREATE INDEX "invoices_issued_at_idx" ON "public"."invoices" USING "btree" ("issued_at" DESC);



CREATE INDEX "message_read_receipts_user_message_idx" ON "public"."message_read_receipts" USING "btree" ("user_id", "message_id");



CREATE INDEX "messages_conversation_created_idx" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "notifications_booking_id_idx" ON "public"."notifications" USING "btree" ("booking_id");



CREATE INDEX "notifications_booking_worker_offer_idx" ON "public"."notifications" USING "btree" ("booking_worker_offer_id") WHERE ("booking_worker_offer_id" IS NOT NULL);



CREATE INDEX "payment_refunds_booking_idx" ON "public"."payment_refunds" USING "btree" ("booking_id");



CREATE UNIQUE INDEX "payment_refunds_occurrence_unique" ON "public"."payment_refunds" USING "btree" ("occurrence_id") WHERE ("occurrence_id" IS NOT NULL);



CREATE INDEX "payment_refunds_payment_idx" ON "public"."payment_refunds" USING "btree" ("payment_id");



CREATE INDEX "payment_refunds_payment_status_idx" ON "public"."payment_refunds" USING "btree" ("payment_id", "status", "created_at");



CREATE UNIQUE INDEX "payment_refunds_provider_refund_id_key" ON "public"."payment_refunds" USING "btree" ("provider_refund_id") WHERE ("provider_refund_id" IS NOT NULL);



CREATE UNIQUE INDEX "payment_refunds_refund_request_id_uidx" ON "public"."payment_refunds" USING "btree" ("refund_request_id") WHERE ("refund_request_id" IS NOT NULL);



CREATE INDEX "payment_refunds_requested_by_idx" ON "public"."payment_refunds" USING "btree" ("requested_by");



CREATE INDEX "payment_refunds_status_idx" ON "public"."payment_refunds" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "payment_webhook_events_status_idx" ON "public"."payment_webhook_events" USING "btree" ("status", "received_at");



CREATE UNIQUE INDEX "payments_provider_order_id_uidx" ON "public"."payments" USING "btree" ("provider_order_id") WHERE ("provider_order_id" IS NOT NULL);



CREATE UNIQUE INDEX "payments_provider_payment_id_uidx" ON "public"."payments" USING "btree" ("provider_payment_id") WHERE ("provider_payment_id" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_normalized_phone_unique_idx" ON "public"."profiles" USING "btree" ("public"."normalize_account_phone"("phone")) WHERE (("phone" IS NOT NULL) AND ("btrim"("phone") <> ''::"text"));



CREATE INDEX "promotion_rules_active_idx" ON "public"."promotion_rules" USING "btree" ("is_active", "priority" DESC, "created_at" DESC);



CREATE INDEX "razorpay_webhook_events_order_id_idx" ON "public"."razorpay_webhook_events" USING "btree" ("order_id");



CREATE INDEX "razorpay_webhook_events_payment_id_idx" ON "public"."razorpay_webhook_events" USING "btree" ("payment_id");



CREATE INDEX "refund_requests_payment_id_idx" ON "public"."refund_requests" USING "btree" ("payment_id");



CREATE INDEX "refund_requests_status_idx" ON "public"."refund_requests" USING "btree" ("status");



CREATE UNIQUE INDEX "reviews_booking_id_one_off_unique" ON "public"."reviews" USING "btree" ("booking_id") WHERE ("occurrence_id" IS NULL);



CREATE INDEX "reviews_customer_id_idx" ON "public"."reviews" USING "btree" ("customer_id");



CREATE INDEX "reviews_moderated_by_idx" ON "public"."reviews" USING "btree" ("moderated_by");



CREATE INDEX "reviews_moderation_status_idx" ON "public"."reviews" USING "btree" ("moderation_status", "created_at" DESC);



CREATE UNIQUE INDEX "reviews_occurrence_id_unique" ON "public"."reviews" USING "btree" ("occurrence_id") WHERE ("occurrence_id" IS NOT NULL);



CREATE INDEX "reviews_worker_id_idx" ON "public"."reviews" USING "btree" ("worker_id");



CREATE UNIQUE INDEX "service_area_groups_normalized_name_key" ON "public"."service_area_groups" USING "btree" ("lower"("btrim"("name")), "lower"("btrim"("city")), "lower"("btrim"("state")));



CREATE UNIQUE INDEX "service_areas_group_service_key" ON "public"."service_areas" USING "btree" ("group_id", "service_id") WHERE (("group_id" IS NOT NULL) AND ("service_id" IS NOT NULL));



CREATE UNIQUE INDEX "service_areas_legacy_name_city_state_service_key" ON "public"."service_areas" USING "btree" ("name", "city", "state", "service_id") WHERE (("group_id" IS NULL) AND ("service_id" IS NOT NULL));



CREATE INDEX "service_availability_requests_customer_idx" ON "public"."service_availability_requests" USING "btree" ("customer_id");



CREATE UNIQUE INDEX "service_availability_requests_pending_unique" ON "public"."service_availability_requests" USING "btree" ("customer_id", "service_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "service_availability_requests_service_status_idx" ON "public"."service_availability_requests" USING "btree" ("service_id", "status");



CREATE UNIQUE INDEX "service_categories_name_lower_unique" ON "public"."service_categories" USING "btree" ("lower"("name"));



CREATE INDEX "service_recurring_discount_tiers_lookup_idx" ON "public"."service_recurring_discount_tiers" USING "btree" ("service_id", "is_active", "min_calendar_days");



CREATE INDEX "service_variant_scheduling_rules_active_idx" ON "public"."service_variant_scheduling_rules" USING "btree" ("is_active", "scheduling_mode");



CREATE INDEX "services_category_id_idx" ON "public"."services" USING "btree" ("category_id");



CREATE INDEX "support_tickets_booking_id_idx" ON "public"."support_tickets" USING "btree" ("booking_id") WHERE ("booking_id" IS NOT NULL);



CREATE INDEX "support_tickets_payment_id_idx" ON "public"."support_tickets" USING "btree" ("payment_id") WHERE ("payment_id" IS NOT NULL);



CREATE INDEX "support_tickets_payment_refund_id_idx" ON "public"."support_tickets" USING "btree" ("payment_refund_id") WHERE ("payment_refund_id" IS NOT NULL);



CREATE INDEX "support_tickets_refund_request_id_idx" ON "public"."support_tickets" USING "btree" ("refund_request_id") WHERE ("refund_request_id" IS NOT NULL);



CREATE INDEX "support_tickets_user_id_idx" ON "public"."support_tickets" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "support_tickets_worker_id_idx" ON "public"."support_tickets" USING "btree" ("worker_id") WHERE ("worker_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_bookings_one_active_per_customer" ON "public"."bookings" USING "btree" ("customer_id") WHERE ("status" = ANY (ARRAY['pending_payment'::"public"."booking_status", 'paid'::"public"."booking_status", 'searching_worker'::"public"."booking_status", 'assigned'::"public"."booking_status", 'on_the_way'::"public"."booking_status", 'arrived'::"public"."booking_status", 'in_progress'::"public"."booking_status"]));



CREATE INDEX "worker_applications_reviewed_by_idx" ON "public"."worker_applications" USING "btree" ("reviewed_by");



CREATE INDEX "worker_applications_status_idx" ON "public"."worker_applications" USING "btree" ("status");



CREATE INDEX "worker_availability_worker_id_idx" ON "public"."worker_availability" USING "btree" ("worker_id");



CREATE UNIQUE INDEX "worker_booking_change_requests_open_unique" ON "public"."worker_booking_change_requests" USING "btree" ("worker_id", "booking_id", COALESCE("occurrence_id", '00000000-0000-0000-0000-000000000000'::"uuid")) WHERE ("status" = 'open'::"text");



CREATE INDEX "worker_booking_incidents_resolved_by_idx" ON "public"."worker_booking_incidents" USING "btree" ("resolved_by");



CREATE INDEX "worker_documents_application_id_idx" ON "public"."worker_documents" USING "btree" ("application_id");



CREATE UNIQUE INDEX "worker_documents_application_type_key" ON "public"."worker_documents" USING "btree" ("application_id", "document_type");



CREATE INDEX "worker_documents_reviewed_by_idx" ON "public"."worker_documents" USING "btree" ("reviewed_by");



CREATE INDEX "worker_documents_type_status_idx" ON "public"."worker_documents" USING "btree" ("document_type", "status");



CREATE INDEX "worker_documents_worker_id_idx" ON "public"."worker_documents" USING "btree" ("worker_id");



CREATE INDEX "worker_earnings_worker_id_idx" ON "public"."worker_earnings" USING "btree" ("worker_id");



CREATE UNIQUE INDEX "worker_payout_accounts_default_worker_key" ON "public"."worker_payout_accounts" USING "btree" ("worker_id") WHERE (("is_default" = true) AND ("status" <> 'disabled'::"text"));



CREATE UNIQUE INDEX "worker_payout_accounts_provider_fund_account_key" ON "public"."worker_payout_accounts" USING "btree" ("provider", "provider_fund_account_id") WHERE ("provider_fund_account_id" IS NOT NULL);



CREATE UNIQUE INDEX "worker_payouts_provider_payout_key" ON "public"."worker_payouts" USING "btree" ("provider", "provider_payout_id") WHERE ("provider_payout_id" IS NOT NULL);



CREATE INDEX "worker_presence_available_idx" ON "public"."worker_presence" USING "btree" ("is_available", "expires_at") WHERE ("is_available" = true);



CREATE INDEX "worker_profiles_featured_idx" ON "public"."worker_profiles" USING "btree" ("is_featured");



CREATE INDEX "worker_profiles_status_idx" ON "public"."worker_profiles" USING "btree" ("worker_status");



CREATE INDEX "worker_profiles_verified_idx" ON "public"."worker_profiles" USING "btree" ("is_verified");



CREATE INDEX "worker_push_deliveries_push_token_id_idx" ON "public"."worker_push_deliveries" USING "btree" ("push_token_id") WHERE ("push_token_id" IS NOT NULL);



CREATE UNIQUE INDEX "worker_push_deliveries_ticket_id_key" ON "public"."worker_push_deliveries" USING "btree" ("expo_ticket_id") WHERE ("expo_ticket_id" IS NOT NULL);



CREATE INDEX "worker_push_deliveries_user_id_idx" ON "public"."worker_push_deliveries" USING "btree" ("user_id");



CREATE INDEX "worker_schedule_exceptions_worker_date_idx" ON "public"."worker_schedule_exceptions" USING "btree" ("worker_id", "exception_date", "is_active");



CREATE UNIQUE INDEX "worker_weekly_schedules_unique_window_idx" ON "public"."worker_weekly_schedules" USING "btree" ("worker_id", "day_of_week", "start_time", "end_time");



CREATE INDEX "worker_weekly_schedules_worker_day_idx" ON "public"."worker_weekly_schedules" USING "btree" ("worker_id", "day_of_week", "is_active");



CREATE OR REPLACE TRIGGER "addresses_sync_geospatial_location" BEFORE INSERT OR UPDATE OF "latitude", "longitude", "location" ON "public"."addresses" FOR EACH ROW EXECUTE FUNCTION "public"."sync_address_location_from_coordinates"();



CREATE OR REPLACE TRIGGER "booking_occurrences_assignment_consistency" BEFORE INSERT OR UPDATE OF "booking_id", "worker_id", "status" ON "public"."booking_schedule_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."validate_occurrence_assignment_consistency"();



CREATE OR REPLACE TRIGGER "booking_occurrences_parent_schedule_integrity" BEFORE INSERT OR UPDATE OF "booking_id", "occurrence_index", "occurrence_date", "scheduled_start", "scheduled_end" ON "public"."booking_schedule_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."validate_occurrence_matches_parent_schedule"();



CREATE OR REPLACE TRIGGER "booking_occurrences_validate_lifecycle" BEFORE INSERT OR UPDATE ON "public"."booking_schedule_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."validate_booking_occurrence_lifecycle"();



CREATE OR REPLACE TRIGGER "booking_occurrences_worker_consistency" BEFORE INSERT OR UPDATE OF "worker_id", "booking_id" ON "public"."booking_schedule_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."validate_occurrence_worker_matches_booking"();



CREATE OR REPLACE TRIGGER "booking_schedule_occurrences_capture_cancelled_at" BEFORE INSERT OR UPDATE OF "status" ON "public"."booking_schedule_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."capture_booking_schedule_occurrence_cancelled_at"();



CREATE OR REPLACE TRIGGER "booking_schedule_occurrences_updated_at" BEFORE UPDATE ON "public"."booking_schedule_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."set_booking_schedule_occurrence_updated_at"();



CREATE OR REPLACE TRIGGER "booking_status_notifications" AFTER INSERT ON "public"."booking_status_history" FOR EACH ROW EXECUTE FUNCTION "public"."create_booking_status_notifications"();



CREATE OR REPLACE TRIGGER "booking_worker_offers_updated_at" BEFORE UPDATE ON "public"."booking_worker_offers" FOR EACH ROW EXECUTE FUNCTION "public"."set_booking_worker_offer_updated_at"();



CREATE OR REPLACE TRIGGER "bookings_sync_cancelled_occurrences" AFTER UPDATE OF "status" ON "public"."bookings" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."sync_cancelled_booking_occurrences"();



CREATE OR REPLACE TRIGGER "bookings_sync_occurrence_worker" AFTER UPDATE OF "worker_id" ON "public"."bookings" FOR EACH ROW WHEN (("old"."worker_id" IS DISTINCT FROM "new"."worker_id")) EXECUTE FUNCTION "public"."sync_booking_occurrence_worker"();



CREATE OR REPLACE TRIGGER "bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "guard_customer_deletion_approval" BEFORE UPDATE OF "status" ON "public"."account_deletion_requests" FOR EACH ROW EXECUTE FUNCTION "public"."guard_customer_deletion_approval"();



CREATE OR REPLACE TRIGGER "home_promotions_set_updated_at" BEFORE UPDATE ON "public"."home_promotions" FOR EACH ROW EXECUTE FUNCTION "public"."set_home_promotions_updated_at"();



CREATE OR REPLACE TRIGGER "payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "platform_settings_updated_at" BEFORE UPDATE ON "public"."platform_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_platform_setting_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_enforce_customer_phone_identity" BEFORE INSERT OR UPDATE OF "phone" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_customer_profile_phone_identity"();



CREATE OR REPLACE TRIGGER "profiles_prevent_worker_role_demotion" BEFORE UPDATE OF "role" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_worker_role_demotion_with_profile"();



CREATE OR REPLACE TRIGGER "profiles_require_customer_company_name" BEFORE INSERT OR UPDATE OF "role", "company_name" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."validate_customer_company_name"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "protect_profile_privileged_fields" BEFORE INSERT OR UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_privileged_fields"();



CREATE OR REPLACE TRIGGER "protect_worker_profile_operational_fields" BEFORE UPDATE ON "public"."worker_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_worker_profile_operational_fields"();



CREATE OR REPLACE TRIGGER "protect_worker_trust_fields" BEFORE UPDATE ON "public"."worker_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_worker_trust_fields"();



CREATE OR REPLACE TRIGGER "push_tokens_updated_at" BEFORE UPDATE ON "public"."push_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "service_area_groups_sync_rows" AFTER UPDATE OF "name", "city", "state", "center_latitude", "center_longitude", "radius_km", "is_active" ON "public"."service_area_groups" FOR EACH ROW EXECUTE FUNCTION "public"."sync_service_area_group_rows"();



CREATE OR REPLACE TRIGGER "service_areas_validate_radius" BEFORE INSERT OR UPDATE OF "radius_km", "center_latitude", "center_longitude" ON "public"."service_areas" FOR EACH ROW EXECUTE FUNCTION "public"."validate_service_area_radius"();



CREATE OR REPLACE TRIGGER "service_availability_requests_updated_at" BEFORE UPDATE ON "public"."service_availability_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_service_availability_request_updated_at"();



CREATE OR REPLACE TRIGGER "service_hourly_prices_validate_period" BEFORE INSERT OR UPDATE ON "public"."service_hourly_prices" FOR EACH ROW EXECUTE FUNCTION "public"."validate_hourly_price_period"();



CREATE OR REPLACE TRIGGER "service_variant_prices_validate_period" BEFORE INSERT OR UPDATE ON "public"."service_variant_prices" FOR EACH ROW EXECUTE FUNCTION "public"."validate_variant_price_period"();



CREATE OR REPLACE TRIGGER "service_variant_scheduling_rules_updated_at" BEFORE UPDATE ON "public"."service_variant_scheduling_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_worker_schedule_updated_at"();



CREATE OR REPLACE TRIGGER "service_variants_set_updated_at" BEFORE UPDATE ON "public"."service_variants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_payment_webhook_event_updated_at" BEFORE UPDATE ON "public"."payment_webhook_events" FOR EACH ROW EXECUTE FUNCTION "public"."set_payment_webhook_event_updated_at"();



CREATE OR REPLACE TRIGGER "sync_booking_pricing_totals" BEFORE INSERT OR UPDATE OF "pricing_snapshot" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."sync_booking_pricing_totals_from_snapshot"();



CREATE OR REPLACE TRIGGER "sync_booking_promotion_columns_trigger" BEFORE INSERT OR UPDATE OF "pricing_snapshot", "discount_amount", "applied_promotion_id" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "private"."sync_booking_promotion_columns"();



CREATE OR REPLACE TRIGGER "sync_occurrence_promotion_columns_trigger" BEFORE INSERT OR UPDATE OF "pricing_snapshot", "discount_amount" ON "public"."booking_schedule_occurrences" FOR EACH ROW EXECUTE FUNCTION "private"."sync_occurrence_promotion_columns"();



CREATE OR REPLACE TRIGGER "trg_auto_dispatch_waiting_bookings" AFTER INSERT OR UPDATE OF "is_available", "expires_at" ON "public"."worker_presence" FOR EACH ROW WHEN (("new"."is_available" = true)) EXECUTE FUNCTION "public"."trigger_auto_dispatch_waiting_bookings_for_worker"();



CREATE OR REPLACE TRIGGER "trg_auto_dispatch_waiting_bookings_on_worker_location" AFTER INSERT ON "public"."worker_locations" FOR EACH ROW WHEN (("new"."booking_id" IS NULL)) EXECUTE FUNCTION "public"."trigger_auto_dispatch_on_worker_location"();



CREATE OR REPLACE TRIGGER "trg_enforce_booking_service_area" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_booking_service_area"();



CREATE OR REPLACE TRIGGER "trg_idempotency_keys_updated_at" BEFORE UPDATE ON "public"."idempotency_keys" FOR EACH ROW EXECUTE FUNCTION "public"."update_idempotency_keys_updated_at"();



CREATE OR REPLACE TRIGGER "trg_notify_worker_of_booking_offer" AFTER INSERT ON "public"."booking_worker_offers" FOR EACH ROW WHEN (("new"."status" = 'pending'::"public"."booking_worker_offer_status")) EXECUTE FUNCTION "public"."notify_worker_of_booking_offer"();



CREATE OR REPLACE TRIGGER "trg_prevent_admin_audit_delete" BEFORE DELETE ON "public"."admin_audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_admin_audit_mutation"();



CREATE OR REPLACE TRIGGER "trg_prevent_admin_audit_update" BEFORE UPDATE ON "public"."admin_audit_logs" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_admin_audit_mutation"();



CREATE OR REPLACE TRIGGER "trg_protect_worker_earnings_immutability" BEFORE DELETE OR UPDATE ON "public"."worker_earnings" FOR EACH ROW EXECUTE FUNCTION "public"."protect_worker_earnings_immutability"();



CREATE OR REPLACE TRIGGER "trg_set_support_ticket_updated_at" BEFORE UPDATE ON "public"."support_tickets" FOR EACH ROW EXECUTE FUNCTION "public"."set_support_ticket_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_worker_application_operational_state" AFTER UPDATE OF "status" ON "public"."worker_applications" FOR EACH ROW WHEN (("old"."status" IS DISTINCT FROM "new"."status")) EXECUTE FUNCTION "public"."sync_worker_application_operational_state"();



CREATE OR REPLACE TRIGGER "trg_validate_booking_operating_hours" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_booking_operating_hours"();



CREATE OR REPLACE TRIGGER "trg_validate_booking_service_variant_consistency" BEFORE INSERT OR UPDATE OF "service_id", "service_variant_id" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_booking_service_variant_consistency"();



CREATE OR REPLACE TRIGGER "trg_validate_booking_worker_state" BEFORE INSERT OR UPDATE OF "status", "worker_id" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_booking_worker_state"();



CREATE OR REPLACE TRIGGER "trg_validate_near_term_booking_occurrence_worker" BEFORE INSERT ON "public"."booking_schedule_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."validate_near_term_booking_occurrence_worker"();



CREATE OR REPLACE TRIGGER "trg_validate_payment_amount_against_booking" BEFORE INSERT OR UPDATE OF "booking_id", "amount" ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."validate_payment_amount_against_booking"();



CREATE OR REPLACE TRIGGER "trg_validate_recurring_booking_horizon" BEFORE INSERT OR UPDATE OF "fulfillment_type", "schedule_start_date", "schedule_end_date" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_recurring_booking_horizon"();



CREATE OR REPLACE TRIGGER "trg_validate_service_booking_schedule_policy" BEFORE INSERT OR UPDATE ON "public"."service_booking_schedule_policies" FOR EACH ROW EXECUTE FUNCTION "public"."validate_service_booking_schedule_policy"();



CREATE OR REPLACE TRIGGER "trg_validate_worker_document_integrity" BEFORE INSERT OR UPDATE ON "public"."worker_documents" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_document_integrity"();



CREATE OR REPLACE TRIGGER "trg_validate_worker_earnings_integrity" BEFORE INSERT OR UPDATE ON "public"."worker_earnings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_earnings_integrity"();



CREATE OR REPLACE TRIGGER "validate_near_term_scheduled_booking" BEFORE INSERT ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_near_term_scheduled_booking"();



CREATE OR REPLACE TRIGGER "validate_worker_service_owner" BEFORE INSERT OR UPDATE OF "worker_id" ON "public"."worker_services" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_service_owner"();



CREATE OR REPLACE TRIGGER "worker-notification-push" AFTER INSERT ON "public"."notifications" FOR EACH ROW EXECUTE FUNCTION "public"."tempstaff_worker_notification_push"();



CREATE OR REPLACE TRIGGER "worker_availability_validate_operational_config" BEFORE INSERT OR UPDATE ON "public"."worker_availability" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_operational_configuration"();



CREATE OR REPLACE TRIGGER "worker_booking_change_requests_set_updated_at" BEFORE UPDATE ON "public"."worker_booking_change_requests" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "worker_booking_incidents_set_updated_at" BEFORE UPDATE ON "public"."worker_booking_incidents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "worker_locations_sync_geometry" BEFORE INSERT OR UPDATE ON "public"."worker_locations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_worker_location_geometry"();



CREATE OR REPLACE TRIGGER "worker_payout_accounts_set_updated_at" BEFORE UPDATE ON "public"."worker_payout_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "worker_payouts_set_updated_at" BEFORE UPDATE ON "public"."worker_payouts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "worker_profiles_require_worker_role" BEFORE INSERT OR UPDATE ON "public"."worker_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_profile_owner_role"();



CREATE OR REPLACE TRIGGER "worker_profiles_updated_at" BEFORE UPDATE ON "public"."worker_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "worker_schedule_exceptions_operating_window" BEFORE INSERT OR UPDATE OF "start_time", "end_time", "exception_type" ON "public"."worker_schedule_exceptions" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_schedule_operating_window"();



CREATE OR REPLACE TRIGGER "worker_schedule_exceptions_updated_at" BEFORE UPDATE ON "public"."worker_schedule_exceptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_worker_schedule_updated_at"();



CREATE OR REPLACE TRIGGER "worker_schedule_exceptions_validate_operational_config" BEFORE INSERT OR UPDATE ON "public"."worker_schedule_exceptions" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_operational_configuration"();



CREATE OR REPLACE TRIGGER "worker_schedule_settings_updated_at" BEFORE UPDATE ON "public"."worker_schedule_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_worker_schedule_updated_at"();



CREATE OR REPLACE TRIGGER "worker_schedule_settings_validate_integrity" BEFORE INSERT OR UPDATE OF "worker_id", "timezone" ON "public"."worker_schedule_settings" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_schedule_settings_integrity"();



CREATE OR REPLACE TRIGGER "worker_services_validate_operational_config" BEFORE INSERT OR UPDATE ON "public"."worker_services" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_operational_configuration"();



CREATE OR REPLACE TRIGGER "worker_weekly_schedules_no_overlap" BEFORE INSERT OR UPDATE OF "worker_id", "day_of_week", "start_time", "end_time", "is_active" ON "public"."worker_weekly_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_weekly_schedule_overlap"();



CREATE OR REPLACE TRIGGER "worker_weekly_schedules_operating_window" BEFORE INSERT OR UPDATE OF "start_time", "end_time" ON "public"."worker_weekly_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_schedule_operating_window"();



CREATE OR REPLACE TRIGGER "worker_weekly_schedules_updated_at" BEFORE UPDATE ON "public"."worker_weekly_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_worker_schedule_updated_at"();



CREATE OR REPLACE TRIGGER "worker_weekly_schedules_validate_operational_config" BEFORE INSERT OR UPDATE ON "public"."worker_weekly_schedules" FOR EACH ROW EXECUTE FUNCTION "public"."validate_worker_operational_configuration"();



CREATE OR REPLACE TRIGGER "zz_reconcile_worker_assignment_on_bookings" AFTER INSERT OR DELETE OR UPDATE OF "worker_id", "status" ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."reconcile_worker_assignment_presence_from_booking"();



CREATE OR REPLACE TRIGGER "zz_reconcile_worker_assignment_on_occurrences" AFTER INSERT OR DELETE OR UPDATE OF "worker_id", "status" ON "public"."booking_schedule_occurrences" FOR EACH ROW EXECUTE FUNCTION "public"."reconcile_worker_assignment_presence_from_occurrence"();



ALTER TABLE ONLY "public"."account_deletion_requests"
    ADD CONSTRAINT "account_deletion_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."account_deletion_requests"
    ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."addresses"
    ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_audit_logs"
    ADD CONSTRAINT "admin_audit_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."booking_schedule_occurrences"
    ADD CONSTRAINT "booking_occurrences_last_modified_by_fkey" FOREIGN KEY ("last_modified_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_otps"
    ADD CONSTRAINT "booking_otps_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_otps"
    ADD CONSTRAINT "booking_otps_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "public"."booking_schedule_occurrences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_schedule_occurrences"
    ADD CONSTRAINT "booking_schedule_occurrences_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_schedule_occurrences"
    ADD CONSTRAINT "booking_schedule_occurrences_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."booking_status_history"
    ADD CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_status_history"
    ADD CONSTRAINT "booking_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."booking_worker_offers"
    ADD CONSTRAINT "booking_worker_offers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_worker_offers"
    ADD CONSTRAINT "booking_worker_offers_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "public"."booking_schedule_occurrences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."booking_worker_offers"
    ADD CONSTRAINT "booking_worker_offers_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_applied_promotion_id_fkey" FOREIGN KEY ("applied_promotion_id") REFERENCES "public"."home_promotions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_journey_started_by_fkey" FOREIGN KEY ("journey_started_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_service_variant_id_fkey" FOREIGN KEY ("service_variant_id") REFERENCES "public"."service_variants"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "public"."booking_schedule_occurrences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_favourite_services"
    ADD CONSTRAINT "customer_favourite_services_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_favourite_services"
    ADD CONSTRAINT "customer_favourite_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."home_promotions"
    ADD CONSTRAINT "home_promotions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."home_updates"
    ADD CONSTRAINT "home_updates_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."message_read_receipts"
    ADD CONSTRAINT "message_read_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_booking_worker_offer_id_fkey" FOREIGN KEY ("booking_worker_offer_id") REFERENCES "public"."booking_worker_offers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "public"."booking_schedule_occurrences"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_refund_request_id_fkey" FOREIGN KEY ("refund_request_id") REFERENCES "public"."refund_requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_refunds"
    ADD CONSTRAINT "payment_refunds_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promotion_rules"
    ADD CONSTRAINT "promotion_rules_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "public"."home_promotions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_tokens"
    ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."refund_requests"
    ADD CONSTRAINT "refund_requests_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_moderated_by_fkey" FOREIGN KEY ("moderated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "public"."booking_schedule_occurrences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id");



ALTER TABLE ONLY "public"."service_areas"
    ADD CONSTRAINT "service_areas_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."service_area_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_areas"
    ADD CONSTRAINT "service_areas_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_availability_requests"
    ADD CONSTRAINT "service_availability_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_availability_requests"
    ADD CONSTRAINT "service_availability_requests_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_booking_schedule_policies"
    ADD CONSTRAINT "service_booking_schedule_policies_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_discount_tiers"
    ADD CONSTRAINT "service_discount_tiers_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_hourly_prices"
    ADD CONSTRAINT "service_hourly_prices_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_recurring_discount_tiers"
    ADD CONSTRAINT "service_recurring_discount_tiers_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_variant_discount_tiers"
    ADD CONSTRAINT "service_variant_discount_tiers_service_variant_id_fkey" FOREIGN KEY ("service_variant_id") REFERENCES "public"."service_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_variant_hourly_prices"
    ADD CONSTRAINT "service_variant_hourly_prices_service_variant_id_fkey" FOREIGN KEY ("service_variant_id") REFERENCES "public"."service_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_variant_prices"
    ADD CONSTRAINT "service_variant_prices_service_variant_id_fkey" FOREIGN KEY ("service_variant_id") REFERENCES "public"."service_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_variant_scheduling_rules"
    ADD CONSTRAINT "service_variant_scheduling_rules_service_variant_id_fkey" FOREIGN KEY ("service_variant_id") REFERENCES "public"."service_variants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_variants"
    ADD CONSTRAINT "service_variants_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_payment_refund_id_fkey" FOREIGN KEY ("payment_refund_id") REFERENCES "public"."payment_refunds"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_refund_request_id_fkey" FOREIGN KEY ("refund_request_id") REFERENCES "public"."refund_requests"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."support_tickets"
    ADD CONSTRAINT "support_tickets_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."worker_applications"
    ADD CONSTRAINT "worker_applications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."worker_applications"
    ADD CONSTRAINT "worker_applications_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_availability"
    ADD CONSTRAINT "worker_availability_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_booking_change_requests"
    ADD CONSTRAINT "worker_booking_change_requests_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_booking_change_requests"
    ADD CONSTRAINT "worker_booking_change_requests_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "public"."booking_schedule_occurrences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_booking_change_requests"
    ADD CONSTRAINT "worker_booking_change_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."worker_booking_change_requests"
    ADD CONSTRAINT "worker_booking_change_requests_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_booking_incidents"
    ADD CONSTRAINT "worker_booking_incidents_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_booking_incidents"
    ADD CONSTRAINT "worker_booking_incidents_occurrence_id_fkey" FOREIGN KEY ("occurrence_id") REFERENCES "public"."booking_schedule_occurrences"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_booking_incidents"
    ADD CONSTRAINT "worker_booking_incidents_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_documents"
    ADD CONSTRAINT "worker_documents_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."worker_applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_documents"
    ADD CONSTRAINT "worker_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."worker_documents"
    ADD CONSTRAINT "worker_documents_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_earnings"
    ADD CONSTRAINT "worker_earnings_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id");



ALTER TABLE ONLY "public"."worker_earnings"
    ADD CONSTRAINT "worker_earnings_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id");



ALTER TABLE ONLY "public"."worker_locations"
    ADD CONSTRAINT "worker_locations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_locations"
    ADD CONSTRAINT "worker_locations_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_onboarding_profiles"
    ADD CONSTRAINT "worker_onboarding_profiles_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_payout_accounts"
    ADD CONSTRAINT "worker_payout_accounts_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_payout_items"
    ADD CONSTRAINT "worker_payout_items_earning_id_fkey" FOREIGN KEY ("earning_id") REFERENCES "public"."worker_earnings"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."worker_payout_items"
    ADD CONSTRAINT "worker_payout_items_payout_id_fkey" FOREIGN KEY ("payout_id") REFERENCES "public"."worker_payouts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_payouts"
    ADD CONSTRAINT "worker_payouts_payout_account_id_fkey" FOREIGN KEY ("payout_account_id") REFERENCES "public"."worker_payout_accounts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."worker_payouts"
    ADD CONSTRAINT "worker_payouts_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_presence"
    ADD CONSTRAINT "worker_presence_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_profiles"
    ADD CONSTRAINT "worker_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_push_deliveries"
    ADD CONSTRAINT "worker_push_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_push_deliveries"
    ADD CONSTRAINT "worker_push_deliveries_push_token_id_fkey" FOREIGN KEY ("push_token_id") REFERENCES "public"."push_tokens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."worker_push_deliveries"
    ADD CONSTRAINT "worker_push_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_push_tokens"
    ADD CONSTRAINT "worker_push_tokens_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_schedule_exceptions"
    ADD CONSTRAINT "worker_schedule_exceptions_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_schedule_settings"
    ADD CONSTRAINT "worker_schedule_settings_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_services"
    ADD CONSTRAINT "worker_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_services"
    ADD CONSTRAINT "worker_services_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."worker_weekly_schedules"
    ADD CONSTRAINT "worker_weekly_schedules_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "public"."worker_profiles"("id") ON DELETE CASCADE;



ALTER TABLE "public"."account_deletion_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "account_deletion_requests_insert_own" ON "public"."account_deletion_requests" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "user_id") AND ("status" = 'pending'::"text") AND ("reviewed_at" IS NULL) AND ("reviewed_by" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'customer'::"public"."user_role") AND ("p"."is_active" = true))))));



CREATE POLICY "account_deletion_requests_select_own" ON "public"."account_deletion_requests" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."addresses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "addresses_delete_own" ON "public"."addresses" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "addresses_insert_own" ON "public"."addresses" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "addresses_select_own" ON "public"."addresses" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "addresses_update_own" ON "public"."addresses" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."admin_audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_audit_logs_admin_select" ON "public"."admin_audit_logs" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "booking_occurrences_select_scoped" ON "public"."booking_schedule_occurrences" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "booking_schedule_occurrences"."booking_id") AND ("b"."customer_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."booking_otps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_schedule_occurrences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."booking_status_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_status_history_select_scoped" ON "public"."booking_status_history" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "booking_status_history"."booking_id") AND (("b"."customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("b"."worker_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



ALTER TABLE "public"."booking_worker_offers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "booking_worker_offers_worker_select" ON "public"."booking_worker_offers" FOR SELECT TO "authenticated" USING (("worker_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_select_authenticated" ON "public"."bookings" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."cancellation_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cancellation_policies_admin_delete" ON "public"."cancellation_policies" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "cancellation_policies_admin_insert" ON "public"."cancellation_policies" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "cancellation_policies_admin_select" ON "public"."cancellation_policies" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "cancellation_policies_admin_update" ON "public"."cancellation_policies" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "conversations_insert_participant" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_access_booking_communication"("booking_id", "occurrence_id") AND (EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     LEFT JOIN "public"."booking_schedule_occurrences" "o" ON ((("o"."id" = "conversations"."occurrence_id") AND ("o"."booking_id" = "b"."id"))))
  WHERE (("b"."id" = "conversations"."booking_id") AND ("b"."customer_id" = "conversations"."customer_id") AND ((("conversations"."occurrence_id" IS NULL) AND ("b"."worker_id" = "conversations"."worker_id")) OR (("conversations"."occurrence_id" IS NOT NULL) AND ("o"."worker_id" = "conversations"."worker_id"))) AND (("conversations"."customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("conversations"."worker_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "conversations_select_participant" ON "public"."conversations" FOR SELECT TO "authenticated" USING (("public"."can_access_booking_communication"("booking_id", "occurrence_id") AND (("customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "conversations_update_participant" ON "public"."conversations" FOR UPDATE TO "authenticated" USING (("public"."can_access_booking_communication"("booking_id", "occurrence_id") AND (("customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK (("public"."can_access_booking_communication"("booking_id", "occurrence_id") AND (("customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."customer_favourite_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_create_own_reviews" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK ((("customer_id" = ( SELECT "auth"."uid"() AS "uid")) AND ((EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "reviews"."booking_id") AND ("b"."customer_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("b"."fulfillment_type" <> 'recurring'::"public"."booking_fulfillment_type") AND ("b"."status" = 'completed'::"public"."booking_status") AND ("b"."worker_id" = "reviews"."worker_id") AND ("reviews"."occurrence_id" IS NULL)))) OR (EXISTS ( SELECT 1
   FROM ("public"."bookings" "b"
     JOIN "public"."booking_schedule_occurrences" "o" ON (("o"."booking_id" = "b"."id")))
  WHERE (("b"."id" = "reviews"."booking_id") AND ("b"."customer_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("b"."fulfillment_type" = 'recurring'::"public"."booking_fulfillment_type") AND ("o"."id" = "reviews"."occurrence_id") AND ("o"."status" = 'completed'::"text") AND ("o"."worker_id" IS NOT NULL) AND ("o"."worker_id" = "reviews"."worker_id")))))));



CREATE POLICY "customers_delete_own_favourite_services" ON "public"."customer_favourite_services" FOR DELETE TO "authenticated" USING (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "customers_insert_own_favourite_services" ON "public"."customer_favourite_services" FOR INSERT TO "authenticated" WITH CHECK (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "customers_select_own_favourite_services" ON "public"."customer_favourite_services" FOR SELECT TO "authenticated" USING (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."home_promotions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_promotions_admin_delete" ON "public"."home_promotions" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "home_promotions_admin_insert" ON "public"."home_promotions" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "home_promotions_admin_update" ON "public"."home_promotions" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "home_promotions_select_authenticated" ON "public"."home_promotions" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (("is_active" = true) AND (("starts_at" IS NULL) OR ("starts_at" <= "now"())) AND (("ends_at" IS NULL) OR ("ends_at" > "now"())))));



ALTER TABLE "public"."home_updates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "home_updates_admin_delete" ON "public"."home_updates" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "home_updates_admin_insert" ON "public"."home_updates" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "home_updates_admin_update" ON "public"."home_updates" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "home_updates_select_authenticated" ON "public"."home_updates" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (("is_active" = true) AND (("starts_at" IS NULL) OR ("starts_at" <= "now"())) AND (("ends_at" IS NULL) OR ("ends_at" > "now"())))));



ALTER TABLE "public"."idempotency_keys" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "invoices_select_owner_or_admin" ON "public"."invoices" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "invoices"."booking_id") AND ("b"."customer_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."message_read_receipts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "message_read_receipts_insert_self" ON "public"."message_read_receipts" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."conversations" "c" ON (("c"."id" = "m"."conversation_id")))
  WHERE (("m"."id" = "message_read_receipts"."message_id") AND "public"."can_access_booking_communication"("c"."booking_id", "c"."occurrence_id") AND (("c"."customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("c"."worker_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "message_read_receipts_select_participant" ON "public"."message_read_receipts" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM ("public"."messages" "m"
     JOIN "public"."conversations" "c" ON (("c"."id" = "m"."conversation_id")))
  WHERE (("m"."id" = "message_read_receipts"."message_id") AND "public"."can_access_booking_communication"("c"."booking_id", "c"."occurrence_id"))))));



CREATE POLICY "message_read_receipts_update_self" ON "public"."message_read_receipts" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_insert_participant" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sender_role" = ANY (ARRAY['customer'::"text", 'worker'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND "public"."can_access_booking_communication"("c"."booking_id", "c"."occurrence_id") AND ((("messages"."sender_role" = 'customer'::"text") AND ("c"."customer_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("messages"."sender_role" = 'worker'::"text") AND ("c"."worker_id" = ( SELECT "auth"."uid"() AS "uid")))))))));



CREATE POLICY "messages_select_participant" ON "public"."messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND "public"."can_access_booking_communication"("c"."booking_id", "c"."occurrence_id") AND (("c"."customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("c"."worker_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "messages_update_sender" ON "public"."messages" FOR UPDATE TO "authenticated" USING ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND "public"."can_access_booking_communication"("c"."booking_id", "c"."occurrence_id")))))) WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("sender_role" = ANY (ARRAY['customer'::"text", 'worker'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."id" = "messages"."conversation_id") AND "public"."can_access_booking_communication"("c"."booking_id", "c"."occurrence_id") AND ((("messages"."sender_role" = 'customer'::"text") AND ("c"."customer_id" = ( SELECT "auth"."uid"() AS "uid"))) OR (("messages"."sender_role" = 'worker'::"text") AND ("c"."worker_id" = ( SELECT "auth"."uid"() AS "uid")))))))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."payment_refunds" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payment_refunds_admin_insert" ON "public"."payment_refunds" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "payment_refunds_admin_select" ON "public"."payment_refunds" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "payment_refunds_admin_update" ON "public"."payment_refunds" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."payment_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_select" ON "public"."payments" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "payments"."booking_id") AND (("b"."customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("b"."worker_id" = ( SELECT "auth"."uid"() AS "uid"))))))));



ALTER TABLE "public"."platform_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "platform_settings_admin_select" ON "public"."platform_settings" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'admin'::"public"."user_role") AND ("p"."is_active" = true)))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_own" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "id") AND ("role" = 'customer'::"public"."user_role") AND ("is_active" = true)));



CREATE POLICY "profiles_select_own_or_admin" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "profiles_update_authenticated" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR "private"."profile_security_fields_unchanged"("id", "role", "is_active")));



ALTER TABLE "public"."promotion_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promotion_rules_admin_delete" ON "public"."promotion_rules" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "promotion_rules_admin_insert" ON "public"."promotion_rules" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "promotion_rules_admin_select" ON "public"."promotion_rules" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "promotion_rules_admin_update" ON "public"."promotion_rules" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "push_tokens_insert_own_active_user" ON "public"."push_tokens" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "push_tokens"."user_id") AND ("p"."is_active" = true))))));



CREATE POLICY "push_tokens_select_own_active_user" ON "public"."push_tokens" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "push_tokens"."user_id") AND ("p"."is_active" = true))))));



CREATE POLICY "push_tokens_update_own_active_user" ON "public"."push_tokens" FOR UPDATE TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "push_tokens"."user_id") AND ("p"."is_active" = true)))))) WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "push_tokens"."user_id") AND ("p"."is_active" = true))))));



ALTER TABLE "public"."razorpay_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refund_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "refund_requests_select_owner_admin" ON "public"."refund_requests" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "refund_requests"."booking_id") AND ("b"."customer_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_select_customer_or_worker" ON "public"."reviews" FOR SELECT TO "authenticated" USING (((( SELECT "auth"."uid"() AS "uid") = "customer_id") OR (( SELECT "auth"."uid"() AS "uid") = "worker_id")));



ALTER TABLE "public"."service_area_groups" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_area_groups_admin_delete" ON "public"."service_area_groups" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_area_groups_admin_insert" ON "public"."service_area_groups" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_area_groups_admin_select" ON "public"."service_area_groups" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_area_groups_admin_update" ON "public"."service_area_groups" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."service_areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_areas_admin_delete" ON "public"."service_areas" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_areas_admin_insert" ON "public"."service_areas" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_areas_admin_update" ON "public"."service_areas" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_areas_public_active_select" ON "public"."service_areas" FOR SELECT TO "authenticated" USING (("is_active" = true));



ALTER TABLE "public"."service_availability_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_availability_requests_select_own" ON "public"."service_availability_requests" FOR SELECT TO "authenticated" USING (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."service_booking_schedule_policies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_booking_schedule_policies_admin_delete" ON "public"."service_booking_schedule_policies" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_booking_schedule_policies_admin_insert" ON "public"."service_booking_schedule_policies" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_booking_schedule_policies_admin_select" ON "public"."service_booking_schedule_policies" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_booking_schedule_policies_admin_update" ON "public"."service_booking_schedule_policies" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."service_categories" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_categories_admin_delete" ON "public"."service_categories" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "service_categories_admin_insert" ON "public"."service_categories" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "service_categories_admin_update" ON "public"."service_categories" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "service_categories_authenticated_select" ON "public"."service_categories" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "service_categories_public_active_select" ON "public"."service_categories" FOR SELECT TO "anon" USING (("is_active" = true));



ALTER TABLE "public"."service_discount_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_discount_tiers_admin_delete" ON "public"."service_discount_tiers" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_discount_tiers_admin_insert" ON "public"."service_discount_tiers" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_discount_tiers_admin_select" ON "public"."service_discount_tiers" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_discount_tiers_admin_update" ON "public"."service_discount_tiers" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."service_hourly_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_hourly_prices_admin_delete" ON "public"."service_hourly_prices" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_hourly_prices_admin_insert" ON "public"."service_hourly_prices" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_hourly_prices_admin_select" ON "public"."service_hourly_prices" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_hourly_prices_admin_update" ON "public"."service_hourly_prices" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."service_recurring_discount_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_recurring_discount_tiers_admin_delete" ON "public"."service_recurring_discount_tiers" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_recurring_discount_tiers_admin_insert" ON "public"."service_recurring_discount_tiers" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_recurring_discount_tiers_admin_select" ON "public"."service_recurring_discount_tiers" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_recurring_discount_tiers_admin_update" ON "public"."service_recurring_discount_tiers" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."service_variant_discount_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_variant_discount_tiers_admin_delete" ON "public"."service_variant_discount_tiers" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_variant_discount_tiers_admin_insert" ON "public"."service_variant_discount_tiers" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_variant_discount_tiers_admin_select" ON "public"."service_variant_discount_tiers" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_variant_discount_tiers_admin_update" ON "public"."service_variant_discount_tiers" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."service_variant_hourly_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_variant_hourly_prices_admin_delete" ON "public"."service_variant_hourly_prices" FOR DELETE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_variant_hourly_prices_admin_insert" ON "public"."service_variant_hourly_prices" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_variant_hourly_prices_admin_select" ON "public"."service_variant_hourly_prices" FOR SELECT TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin"));



CREATE POLICY "service_variant_hourly_prices_admin_update" ON "public"."service_variant_hourly_prices" FOR UPDATE TO "authenticated" USING (( SELECT "public"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "public"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."service_variant_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_variant_prices_admin_delete" ON "public"."service_variant_prices" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "service_variant_prices_admin_insert" ON "public"."service_variant_prices" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "service_variant_prices_admin_update" ON "public"."service_variant_prices" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "service_variant_prices_authenticated_select" ON "public"."service_variant_prices" FOR SELECT TO "authenticated" USING (((("is_active" = true) AND ("effective_from" <= "now"()) AND (("effective_to" IS NULL) OR ("effective_to" > "now"())) AND (EXISTS ( SELECT 1
   FROM ("public"."service_variants" "sv"
     JOIN "public"."services" "s" ON (("s"."id" = "sv"."service_id")))
  WHERE (("sv"."id" = "service_variant_prices"."service_variant_id") AND ("sv"."is_active" = true) AND ("s"."is_active" = true))))) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "service_variant_prices_public_select" ON "public"."service_variant_prices" FOR SELECT TO "anon" USING ((("is_active" = true) AND ("effective_from" <= "now"()) AND (("effective_to" IS NULL) OR ("effective_to" > "now"())) AND (EXISTS ( SELECT 1
   FROM ("public"."service_variants" "sv"
     JOIN "public"."services" "s" ON (("s"."id" = "sv"."service_id")))
  WHERE (("sv"."id" = "service_variant_prices"."service_variant_id") AND ("sv"."is_active" = true) AND ("s"."is_active" = true))))));



ALTER TABLE "public"."service_variant_scheduling_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_variant_scheduling_rules_admin_delete" ON "public"."service_variant_scheduling_rules" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "service_variant_scheduling_rules_admin_insert" ON "public"."service_variant_scheduling_rules" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "service_variant_scheduling_rules_admin_select" ON "public"."service_variant_scheduling_rules" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "service_variant_scheduling_rules_admin_update" ON "public"."service_variant_scheduling_rules" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."service_variants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_variants_admin_delete" ON "public"."service_variants" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "service_variants_admin_insert" ON "public"."service_variants" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "service_variants_admin_update" ON "public"."service_variants" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "service_variants_authenticated_select" ON "public"."service_variants" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "service_variants_public_select" ON "public"."service_variants" FOR SELECT TO "anon" USING (("is_active" = true));



ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "services_admin_delete" ON "public"."services" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "services_admin_insert" ON "public"."services" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "services_admin_update" ON "public"."services" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "services_authenticated_select" ON "public"."services" FOR SELECT TO "authenticated" USING ((("is_active" = true) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "services_public_select" ON "public"."services" FOR SELECT TO "anon" USING (("is_active" = true));



ALTER TABLE "public"."support_tickets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "support_tickets_select_owner_or_admin" ON "public"."support_tickets" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."worker_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_applications_select" ON "public"."worker_applications" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."worker_availability" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_availability_select_owner_or_admin" ON "public"."worker_availability" FOR SELECT TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."worker_booking_change_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_booking_change_requests_select_own_or_admin" ON "public"."worker_booking_change_requests" FOR SELECT TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."worker_booking_incidents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_booking_incidents_select_own_or_admin" ON "public"."worker_booking_incidents" FOR SELECT TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."worker_documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_documents_insert" ON "public"."worker_documents" FOR INSERT TO "authenticated" WITH CHECK ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."worker_applications" "a"
  WHERE (("a"."id" = "worker_documents"."application_id") AND ("a"."worker_id" = ( SELECT "auth"."uid"() AS "uid"))))) AND ("file_path" ~~ ((( SELECT "auth"."uid"() AS "uid"))::"text" || '/%'::"text")) AND ("status" = 'pending'::"public"."worker_document_status")));



CREATE POLICY "worker_documents_select" ON "public"."worker_documents" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "worker_documents_update" ON "public"."worker_documents" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR (("worker_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("file_path" ~~ ((( SELECT "auth"."uid"() AS "uid"))::"text" || '/%'::"text")) AND ("status" = 'pending'::"public"."worker_document_status"))));



ALTER TABLE "public"."worker_earnings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_earnings_select_authenticated" ON "public"."worker_earnings" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."worker_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_locations_insert_own_active_booking" ON "public"."worker_locations" FOR INSERT TO "authenticated" WITH CHECK ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "worker_locations"."booking_id") AND ("b"."worker_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("b"."status" = ANY (ARRAY['on_the_way'::"public"."booking_status", 'arrived'::"public"."booking_status", 'in_progress'::"public"."booking_status"]))))) AND (("latitude" >= ('-90'::integer)::double precision) AND ("latitude" <= (90)::double precision)) AND (("longitude" >= ('-180'::integer)::double precision) AND ("longitude" <= (180)::double precision))));



CREATE POLICY "worker_locations_select_scoped" ON "public"."worker_locations" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."id" = "worker_locations"."booking_id") AND ("b"."customer_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("b"."worker_id" = "worker_locations"."worker_id") AND ("b"."status" = ANY (ARRAY['assigned'::"public"."booking_status", 'on_the_way'::"public"."booking_status", 'arrived'::"public"."booking_status", 'in_progress'::"public"."booking_status"])))))));



ALTER TABLE "public"."worker_onboarding_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_onboarding_profiles_select" ON "public"."worker_onboarding_profiles" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."worker_payout_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_payout_accounts_select_own_or_admin" ON "public"."worker_payout_accounts" FOR SELECT TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."worker_payout_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_payout_items_select_own_or_admin" ON "public"."worker_payout_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."worker_payouts" "p"
  WHERE (("p"."id" = "worker_payout_items"."payout_id") AND (("p"."worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin"))))));



ALTER TABLE "public"."worker_payout_webhook_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."worker_payouts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_payouts_select_own_or_admin" ON "public"."worker_payouts" FOR SELECT TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."worker_presence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_presence_select_own_or_admin" ON "public"."worker_presence" FOR SELECT TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."worker_profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_profiles_select_own_or_admin" ON "public"."worker_profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "worker_profiles_update_authenticated" ON "public"."worker_profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR ("id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."worker_push_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."worker_push_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_push_tokens_delete_own_active_worker" ON "public"."worker_push_tokens" FOR DELETE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "worker_push_tokens"."worker_id") AND ("p"."role" = 'worker'::"public"."user_role") AND ("p"."is_active" = true)))) AND ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "worker_push_tokens_insert_own_active_worker" ON "public"."worker_push_tokens" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "worker_push_tokens"."worker_id") AND ("p"."role" = 'worker'::"public"."user_role") AND ("p"."is_active" = true)))) AND ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "worker_push_tokens_select_own_active_worker" ON "public"."worker_push_tokens" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "worker_push_tokens"."worker_id") AND ("p"."role" = 'worker'::"public"."user_role") AND ("p"."is_active" = true)))) AND ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "worker_push_tokens_update_own_active_worker" ON "public"."worker_push_tokens" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "worker_push_tokens"."worker_id") AND ("p"."role" = 'worker'::"public"."user_role") AND ("p"."is_active" = true)))) AND ("worker_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "worker_push_tokens"."worker_id") AND ("p"."role" = 'worker'::"public"."user_role") AND ("p"."is_active" = true)))) AND ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."worker_schedule_exceptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_schedule_exceptions_delete_own" ON "public"."worker_schedule_exceptions" FOR DELETE TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "worker_schedule_exceptions_insert_own" ON "public"."worker_schedule_exceptions" FOR INSERT TO "authenticated" WITH CHECK ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "worker_schedule_exceptions_select_own" ON "public"."worker_schedule_exceptions" FOR SELECT TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "worker_schedule_exceptions_update_own" ON "public"."worker_schedule_exceptions" FOR UPDATE TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin"))) WITH CHECK ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."worker_schedule_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_schedule_settings_delete_own" ON "public"."worker_schedule_settings" FOR DELETE TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "worker_schedule_settings_insert_own" ON "public"."worker_schedule_settings" FOR INSERT TO "authenticated" WITH CHECK ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "worker_schedule_settings_select_own" ON "public"."worker_schedule_settings" FOR SELECT TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "worker_schedule_settings_update_own" ON "public"."worker_schedule_settings" FOR UPDATE TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin"))) WITH CHECK ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."worker_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_services_delete" ON "public"."worker_services" FOR DELETE TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "worker_services_insert" ON "public"."worker_services" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "worker_services_select" ON "public"."worker_services" FOR SELECT TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."worker_profiles" "wp"
  WHERE (("wp"."id" = "worker_services"."worker_id") AND ("wp"."is_verified" = true) AND ("wp"."worker_status" = ANY (ARRAY['available'::"public"."worker_status", 'busy'::"public"."worker_status"])))))));



CREATE POLICY "worker_services_update" ON "public"."worker_services" FOR UPDATE TO "authenticated" USING ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "public"."is_admin"() AS "is_admin") OR ("worker_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."worker_weekly_schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "worker_weekly_schedules_delete_own" ON "public"."worker_weekly_schedules" FOR DELETE TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "worker_weekly_schedules_insert_own" ON "public"."worker_weekly_schedules" FOR INSERT TO "authenticated" WITH CHECK ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "worker_weekly_schedules_select_own" ON "public"."worker_weekly_schedules" FOR SELECT TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "worker_weekly_schedules_update_own" ON "public"."worker_weekly_schedules" FOR UPDATE TO "authenticated" USING ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin"))) WITH CHECK ((("worker_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."is_admin"() AS "is_admin")));



CREATE POLICY "workers can create own worker profile" ON "public"."worker_profiles" FOR INSERT TO "authenticated" WITH CHECK (((( SELECT "auth"."uid"() AS "uid") = "id") AND (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."role" = 'worker'::"public"."user_role") AND ("p"."is_active" = true)))) AND ("is_verified" = false) AND ("worker_status" = 'offline'::"public"."worker_status")));



GRANT USAGE ON SCHEMA "private" TO "authenticated";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."calculate_automatic_promotion_discount"("p_service_id" "uuid", "p_total_working_hours" numeric, "p_gross_amount" numeric, "p_currency" "text", "p_service_discount_amount" numeric) FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."expire_past_active_customer_bookings"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."expire_past_unpaid_customer_bookings"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."get_customer_booking_refunds"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."get_customer_booking_refunds"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."profile_security_fields_unchanged"("p_user_id" "uuid", "p_role" "public"."user_role", "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."profile_security_fields_unchanged"("p_user_id" "uuid", "p_role" "public"."user_role", "p_is_active" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "private"."sync_booking_promotion_columns"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."sync_occurrence_promotion_columns"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."admin_assign_booking_worker"("p_booking_id" "uuid", "p_worker_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_assign_booking_worker"("p_booking_id" "uuid", "p_worker_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_assign_booking_worker"("p_booking_id" "uuid", "p_worker_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_cancel_booking"("p_booking_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_cancel_booking"("p_booking_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_cancel_booking"("p_booking_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_cancel_booking_occurrence"("p_occurrence_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_cancel_booking_occurrence"("p_occurrence_id" "uuid", "p_reason" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_cancel_booking_occurrence"("p_occurrence_id" "uuid", "p_reason" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."notifications" TO "service_role";
GRANT SELECT ON TABLE "public"."notifications" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_notification_type" "text", "p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_notification_type" "text", "p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_notification_type" "text", "p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_is_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_image_url" "text", "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_image_url" "text", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_image_url" "text", "p_is_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_image_url" "text", "p_is_active" boolean, "p_category_id" "uuid", "p_display_order" integer, "p_is_featured" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_image_url" "text", "p_is_active" boolean, "p_category_id" "uuid", "p_display_order" integer, "p_is_featured" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_service"("p_name" "text", "p_description" "text", "p_hourly_price" numeric, "p_currency" "text", "p_image_url" "text", "p_is_active" boolean, "p_category_id" "uuid", "p_display_order" integer, "p_is_featured" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."worker_payouts" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_create_worker_payout"("p_worker_id" "uuid", "p_payout_account_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_worker_payout"("p_worker_id" "uuid", "p_payout_account_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_worker_payout"("p_worker_id" "uuid", "p_payout_account_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_mode" "text") TO "service_role";



GRANT ALL ON TABLE "public"."worker_booking_change_requests" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_execute_worker_booking_change_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_execute_worker_booking_change_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_execute_worker_booking_change_request"("p_request_id" "uuid", "p_decision" "text", "p_admin_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_get_booking_detail"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_booking_detail"("p_booking_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_get_booking_detail"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_get_live_map_data"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_get_live_map_data"() TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_get_live_map_data"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_list_account_deletion_requests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_account_deletion_requests"() TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_list_account_deletion_requests"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_list_invoices"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_invoices"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_invoices"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_payment_refunds"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_payment_refunds"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_payment_refunds"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_payment_webhook_events"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_payment_webhook_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_payment_webhook_events"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_payments"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_payments"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_payments"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_razorpay_webhook_events"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_razorpay_webhook_events"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_razorpay_webhook_events"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_refund_requests"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_refund_requests"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_refund_requests"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_service_areas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_service_areas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_service_areas"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_list_service_areas_v3"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_list_service_areas_v3"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_list_service_areas_v3"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_moderate_review"("p_review_id" "uuid", "p_moderation_status" "text", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_moderate_review"("p_review_id" "uuid", "p_moderation_status" "text", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_moderate_review"("p_review_id" "uuid", "p_moderation_status" "text", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_remove_worker"("p_worker_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_remove_worker"("p_worker_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_remove_worker"("p_worker_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_review_account_deletion"("p_request_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_account_deletion"("p_request_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_account_deletion"("p_request_id" "uuid", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_review_worker_application"("p_application_id" "uuid", "p_status" "public"."worker_application_status", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_worker_application"("p_application_id" "uuid", "p_status" "public"."worker_application_status", "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_worker_application"("p_application_id" "uuid", "p_status" "public"."worker_application_status", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_review_worker_booking_change_request"("p_request_id" "uuid", "p_status" "text", "p_admin_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_worker_booking_change_request"("p_request_id" "uuid", "p_status" "text", "p_admin_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_worker_booking_change_request"("p_request_id" "uuid", "p_status" "text", "p_admin_notes" "text") TO "service_role";



GRANT ALL ON TABLE "public"."worker_booking_incidents" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_review_worker_booking_incident"("p_incident_id" "uuid", "p_status" "text", "p_admin_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_worker_booking_incident"("p_incident_id" "uuid", "p_status" "text", "p_admin_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_worker_booking_incident"("p_incident_id" "uuid", "p_status" "text", "p_admin_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_review_worker_document"("p_document_id" "uuid", "p_status" "public"."worker_document_status", "p_rejection_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_worker_document"("p_document_id" "uuid", "p_status" "public"."worker_document_status", "p_rejection_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_worker_document"("p_document_id" "uuid", "p_status" "public"."worker_document_status", "p_rejection_reason" "text") TO "service_role";



GRANT ALL ON TABLE "public"."worker_payout_accounts" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_review_worker_payout_account"("p_payout_account_id" "uuid", "p_status" "text", "p_rejection_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_review_worker_payout_account"("p_payout_account_id" "uuid", "p_status" "text", "p_rejection_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_review_worker_payout_account"("p_payout_account_id" "uuid", "p_status" "text", "p_rejection_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_customer_active"("p_customer_id" "uuid", "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_customer_active"("p_customer_id" "uuid", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_customer_active"("p_customer_id" "uuid", "p_is_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_service_active"("p_service_id" "uuid", "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_service_active"("p_service_id" "uuid", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_service_active"("p_service_id" "uuid", "p_is_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_set_worker_status"("p_worker_id" "uuid", "p_status" "public"."worker_status") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_set_worker_status"("p_worker_id" "uuid", "p_status" "public"."worker_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_set_worker_status"("p_worker_id" "uuid", "p_status" "public"."worker_status") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_current_hourly_service_price"("p_service_id" "uuid", "p_price" numeric, "p_currency" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_current_hourly_service_price"("p_service_id" "uuid", "p_price" numeric, "p_currency" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_current_hourly_service_price"("p_service_id" "uuid", "p_price" numeric, "p_currency" "text") TO "service_role";



GRANT ALL ON TABLE "public"."service_availability_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."service_availability_requests" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_update_service_availability_request"("p_request_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_service_availability_request"("p_request_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_service_availability_request"("p_request_id" "uuid", "p_status" "text") TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_service_catalog"("p_service_id" "uuid", "p_name" "text", "p_description" "text", "p_image_url" "text", "p_is_active" boolean, "p_category_id" "uuid", "p_display_order" integer, "p_is_featured" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_service_catalog"("p_service_id" "uuid", "p_name" "text", "p_description" "text", "p_image_url" "text", "p_is_active" boolean, "p_category_id" "uuid", "p_display_order" integer, "p_is_featured" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_service_catalog"("p_service_id" "uuid", "p_name" "text", "p_description" "text", "p_image_url" "text", "p_is_active" boolean, "p_category_id" "uuid", "p_display_order" integer, "p_is_featured" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."support_tickets" TO "service_role";
GRANT SELECT ON TABLE "public"."support_tickets" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_update_support_ticket"("p_ticket_id" "uuid", "p_status" "text", "p_admin_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_support_ticket"("p_ticket_id" "uuid", "p_status" "text", "p_admin_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_support_ticket"("p_ticket_id" "uuid", "p_status" "text", "p_admin_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_worker"("p_worker_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_worker_status" "public"."worker_status", "p_is_verified" boolean, "p_service_radius_km" numeric, "p_is_featured" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_worker"("p_worker_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_worker_status" "public"."worker_status", "p_is_verified" boolean, "p_service_radius_km" numeric, "p_is_featured" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_worker"("p_worker_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_worker_status" "public"."worker_status", "p_is_verified" boolean, "p_service_radius_km" numeric, "p_is_featured" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_worker"("p_worker_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_worker_status" "public"."worker_status", "p_is_verified" boolean, "p_service_radius_km" numeric, "p_is_featured" boolean, "p_service_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_worker"("p_worker_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_worker_status" "public"."worker_status", "p_is_verified" boolean, "p_service_radius_km" numeric, "p_is_featured" boolean, "p_service_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_worker"("p_worker_id" "uuid", "p_full_name" "text", "p_phone" "text", "p_worker_status" "public"."worker_status", "p_is_verified" boolean, "p_service_radius_km" numeric, "p_is_featured" boolean, "p_service_ids" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_upsert_service"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_upsert_service"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_service"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_is_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_upsert_service"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_is_active" boolean, "p_image_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_upsert_service"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_is_active" boolean, "p_image_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_service"("p_id" "uuid", "p_name" "text", "p_description" "text", "p_is_active" boolean, "p_image_url" "text") TO "service_role";



GRANT ALL ON TABLE "public"."service_areas" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."service_areas" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_upsert_service_area"("p_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_upsert_service_area"("p_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_service_area"("p_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_upsert_service_area_v2"("p_id" "uuid", "p_service_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_upsert_service_area_v2"("p_id" "uuid", "p_service_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_service_area_v2"("p_id" "uuid", "p_service_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean) TO "service_role";



GRANT ALL ON TABLE "public"."service_area_groups" TO "anon";
GRANT ALL ON TABLE "public"."service_area_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."service_area_groups" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_upsert_service_area_v3"("p_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean, "p_service_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_upsert_service_area_v3"("p_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean, "p_service_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_service_area_v3"("p_id" "uuid", "p_name" "text", "p_city" "text", "p_state" "text", "p_center_latitude" double precision, "p_center_longitude" double precision, "p_radius_km" numeric, "p_is_active" boolean, "p_service_ids" "uuid"[]) TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."service_variant_prices" TO "anon";
GRANT ALL ON TABLE "public"."service_variant_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."service_variant_prices" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_upsert_service_price"("p_id" "uuid", "p_service_variant_id" "uuid", "p_price" numeric, "p_currency" "text", "p_effective_from" timestamp with time zone, "p_effective_to" timestamp with time zone, "p_is_active" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_upsert_service_price"("p_id" "uuid", "p_service_variant_id" "uuid", "p_price" numeric, "p_currency" "text", "p_effective_from" timestamp with time zone, "p_effective_to" timestamp with time zone, "p_is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_service_price"("p_id" "uuid", "p_service_variant_id" "uuid", "p_price" numeric, "p_currency" "text", "p_effective_from" timestamp with time zone, "p_effective_to" timestamp with time zone, "p_is_active" boolean) TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."service_variants" TO "anon";
GRANT ALL ON TABLE "public"."service_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."service_variants" TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_upsert_service_variant"("p_id" "uuid", "p_service_id" "uuid", "p_name" "text", "p_description" "text", "p_billing_type" "text", "p_duration_value" integer, "p_duration_unit" "text", "p_min_quantity" integer, "p_max_quantity" integer, "p_is_active" boolean, "p_sort_order" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_upsert_service_variant"("p_id" "uuid", "p_service_id" "uuid", "p_name" "text", "p_description" "text", "p_billing_type" "text", "p_duration_value" integer, "p_duration_unit" "text", "p_min_quantity" integer, "p_max_quantity" integer, "p_is_active" boolean, "p_sort_order" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_service_variant"("p_id" "uuid", "p_service_id" "uuid", "p_name" "text", "p_description" "text", "p_billing_type" "text", "p_duration_value" integer, "p_duration_unit" "text", "p_min_quantity" integer, "p_max_quantity" integer, "p_is_active" boolean, "p_sort_order" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_worker_payout_provider_update"("p_payout_id" "uuid", "p_provider_payout_id" "text", "p_provider_status" "text", "p_amount_paise" bigint, "p_currency" "text", "p_fund_account_id" "text", "p_utr" "text", "p_fees_paise" bigint, "p_tax_paise" bigint, "p_status_details" "jsonb", "p_failure_reason" "text", "p_created_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_worker_payout_provider_update"("p_payout_id" "uuid", "p_provider_payout_id" "text", "p_provider_status" "text", "p_amount_paise" bigint, "p_currency" "text", "p_fund_account_id" "text", "p_utr" "text", "p_fees_paise" bigint, "p_tax_paise" bigint, "p_status_details" "jsonb", "p_failure_reason" "text", "p_created_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."assign_paid_booking_worker"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_paid_booking_worker"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."auto_assign_waiting_scheduled_bookings_for_worker"("p_worker_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_assign_waiting_scheduled_bookings_for_worker"("p_worker_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."auto_dispatch_waiting_bookings_for_worker"("p_worker_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auto_dispatch_waiting_bookings_for_worker"("p_worker_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_cancellation_refund"("p_amount" numeric, "p_scheduled_start" timestamp with time zone, "p_reference_time" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_cancellation_refund"("p_amount" numeric, "p_scheduled_start" timestamp with time zone, "p_reference_time" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_customer_booking_schedule"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_customer_booking_schedule"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_customer_booking_schedule"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_multi_occurrence_booking_price"("p_service_variant_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_booking_type" "public"."booking_fulfillment_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_multi_occurrence_booking_price"("p_service_variant_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_booking_type" "public"."booking_fulfillment_type") TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_multi_occurrence_booking_price"("p_service_variant_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_booking_type" "public"."booking_fulfillment_type") TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_platform_charges"("p_subtotal" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_platform_charges"("p_subtotal" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_platform_charges"("p_subtotal" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."calculate_recurring_occurrence_price"("p_service_variant_id" "uuid", "p_occurrence_hours" numeric, "p_commitment_days" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_recurring_occurrence_price"("p_service_variant_id" "uuid", "p_occurrence_hours" numeric, "p_commitment_days" numeric) TO "service_role";
GRANT ALL ON FUNCTION "public"."calculate_recurring_occurrence_price"("p_service_variant_id" "uuid", "p_occurrence_hours" numeric, "p_commitment_days" numeric) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."calculate_service_booking_price"("p_service_variant_id" "uuid", "p_total_working_hours" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calculate_service_booking_price"("p_service_variant_id" "uuid", "p_total_working_hours" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_service_booking_price"("p_service_variant_id" "uuid", "p_total_working_hours" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_access_booking_communication"("p_booking_id" "uuid", "p_occurrence_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_access_booking_communication"("p_booking_id" "uuid", "p_occurrence_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_access_booking_communication"("p_booking_id" "uuid", "p_occurrence_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_customer_booking"("p_booking_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_customer_booking"("p_booking_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_customer_booking"("p_booking_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_customer_booking_occurrence"("p_occurrence_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_customer_booking_occurrence"("p_occurrence_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_customer_booking_occurrence"("p_occurrence_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_customer_booking_series"("p_booking_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_customer_booking_series"("p_booking_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_customer_booking_series"("p_booking_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_service_availability_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_service_availability_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_service_availability_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."capture_booking_schedule_occurrence_cancelled_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_account_phone"("p_phone" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_account_phone"("p_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_customer_instant_worker_availability"("p_service_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_customer_instant_worker_availability"("p_service_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_customer_instant_worker_availability"("p_service_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_service_availability"("p_customer_latitude" double precision, "p_customer_longitude" double precision, "p_service_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_service_availability"("p_customer_latitude" double precision, "p_customer_longitude" double precision, "p_service_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_service_availability"("p_customer_latitude" double precision, "p_customer_longitude" double precision, "p_service_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_payment_refund"("p_refund_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_payment_refund"("p_refund_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_customer_account_deletion"("p_request_id" "uuid", "p_auth_user_id" "uuid", "p_profile_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_customer_account_deletion"("p_request_id" "uuid", "p_auth_user_id" "uuid", "p_profile_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."complete_customer_account_deletion"("p_request_id" "uuid", "p_auth_user_id" "uuid", "p_profile_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."complete_test_payment"("p_booking_id" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."create_booking_status_notifications"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_booking_status_notifications"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_customer_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_fulfillment_type" "public"."booking_fulfillment_type", "p_scheduled_start" timestamp with time zone, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_customer_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_fulfillment_type" "public"."booking_fulfillment_type", "p_scheduled_start" timestamp with time zone, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_customer_hourly_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_booking_type" "public"."booking_fulfillment_type", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_customer_hourly_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_booking_type" "public"."booking_fulfillment_type", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_customer_hourly_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_booking_type" "public"."booking_fulfillment_type", "p_scheduled_start" timestamp with time zone, "p_scheduled_end" timestamp with time zone, "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_customer_multi_occurrence_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text", "p_booking_type" "public"."booking_fulfillment_type") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_customer_multi_occurrence_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text", "p_booking_type" "public"."booking_fulfillment_type") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_customer_recurring_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_customer_recurring_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_customer_recurring_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_customer_review"("p_booking_id" "uuid", "p_worker_id" "uuid", "p_rating" integer, "p_comment" "text", "p_occurrence_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_customer_review"("p_booking_id" "uuid", "p_worker_id" "uuid", "p_rating" integer, "p_comment" "text", "p_occurrence_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_customer_review"("p_booking_id" "uuid", "p_worker_id" "uuid", "p_rating" integer, "p_comment" "text", "p_occurrence_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_customer_scheduled_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_customer_scheduled_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_customer_scheduled_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_schedule_start_date" "date", "p_schedule_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_selected_weekdays" smallint[], "p_off_dates" "date"[], "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_customer_scheduled_range_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_off_dates" "date"[], "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_customer_scheduled_range_booking"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date", "p_daily_start_time" time without time zone, "p_daily_end_time" time without time zone, "p_off_dates" "date"[], "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_support_ticket"("p_category" "text", "p_subject" "text", "p_description" "text", "p_booking_id" "uuid", "p_payment_id" "uuid", "p_worker_id" "uuid", "p_refund_request_id" "uuid", "p_payment_refund_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_support_ticket"("p_category" "text", "p_subject" "text", "p_description" "text", "p_booking_id" "uuid", "p_payment_id" "uuid", "p_worker_id" "uuid", "p_refund_request_id" "uuid", "p_payment_refund_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_support_ticket"("p_category" "text", "p_subject" "text", "p_description" "text", "p_booking_id" "uuid", "p_payment_id" "uuid", "p_worker_id" "uuid", "p_refund_request_id" "uuid", "p_payment_refund_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_worker_payout_internal"("p_worker_id" "uuid", "p_payout_account_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_worker_payout_internal"("p_worker_id" "uuid", "p_payout_account_id" "uuid", "p_amount" numeric, "p_idempotency_key" "text", "p_mode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_worker_support_ticket"("p_category" "text", "p_subject" "text", "p_description" "text", "p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_worker_support_ticket"("p_category" "text", "p_subject" "text", "p_description" "text", "p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_worker_support_ticket"("p_category" "text", "p_subject" "text", "p_description" "text", "p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_booking_action"("p_booking_id" "uuid", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_booking_action"("p_booking_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."customer_booking_action"("p_booking_id" "uuid", "p_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."customer_has_active_booking_overlap"("p_customer_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_exclude_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."customer_has_active_booking_overlap"("p_customer_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_exclude_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_booking_worker_offers"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_booking_worker_offers"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_booking_worker_offers_internal"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_booking_worker_offers_internal"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_due_scheduled_worker_offers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_due_scheduled_worker_offers"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_refund_processing_jobs"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_refund_processing_jobs"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."dispatch_scheduled_booking_offer_batch"("p_booking_id" "uuid", "p_occurrence_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."dispatch_scheduled_booking_offer_batch"("p_booking_id" "uuid", "p_occurrence_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_booking_service_area"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_booking_service_area"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_customer_profile_phone_identity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_customer_profile_phone_identity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_booking_worker_offers"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_booking_worker_offers"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_payment_refund"("p_refund_id" "uuid", "p_status" "text", "p_provider_refund_id" "text", "p_failure_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_payment_refund"("p_refund_id" "uuid", "p_status" "text", "p_provider_refund_id" "text", "p_failure_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."finalize_razorpay_payment"("p_payment_id" "uuid", "p_provider_payment_id" "text", "p_paid_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_razorpay_payment"("p_payment_id" "uuid", "p_provider_payment_id" "text", "p_paid_at" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_configured_gst_rate_percent"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_configured_gst_rate_percent"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_configured_gst_rate_percent"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_customer_booking_refunds"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_customer_booking_refunds"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_booking_refunds"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_customer_instant_availability_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_duration_hours" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_customer_instant_availability_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_duration_hours" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_instant_availability_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_duration_hours" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_customer_near_term_scheduled_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_customer_near_term_scheduled_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_near_term_scheduled_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_customer_scheduled_availability_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_duration_hours" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_customer_scheduled_availability_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_duration_hours" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_scheduled_availability_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone, "p_duration_hours" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_customer_scheduled_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_customer_scheduled_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_customer_scheduled_slots"("p_service_variant_id" "uuid", "p_address_id" "uuid", "p_start_date" "date", "p_end_date" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_eligible_workers"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_eligible_workers"("p_booking_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_eligible_workers"("p_booking_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_next_available_worker_slots"("p_service_id" "uuid", "p_address_id" "uuid", "p_duration_minutes" integer, "p_from" timestamp with time zone, "p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_next_available_worker_slots"("p_service_id" "uuid", "p_address_id" "uuid", "p_duration_minutes" integer, "p_from" timestamp with time zone, "p_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_recurring_booking_max_horizon_days"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_recurring_booking_max_horizon_days"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."guard_customer_deletion_approval"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."guard_customer_deletion_approval"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_auth_user_deleted_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_auth_user_deleted_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_worker_signup"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_worker_signup"() TO "supabase_auth_admin";
GRANT ALL ON FUNCTION "public"."handle_new_worker_signup"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_booking_within_operating_hours"("p_start" timestamp with time zone, "p_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_booking_within_operating_hours"("p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."issue_booking_invoice"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."issue_booking_invoice"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."issue_booking_invoice"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_notification_read"("p_notification_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."modify_customer_booking"("p_booking_id" "uuid", "p_scheduled_start" timestamp with time zone, "p_duration_hours" numeric, "p_address_id" "uuid", "p_notes" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."modify_customer_booking"("p_booking_id" "uuid", "p_scheduled_start" timestamp with time zone, "p_duration_hours" numeric, "p_address_id" "uuid", "p_notes" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."modify_customer_booking_occurrence"("p_occurrence_id" "uuid", "p_new_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."modify_customer_booking_occurrence"("p_occurrence_id" "uuid", "p_new_date" "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."normalize_account_phone"("p_phone" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_account_phone"("p_phone" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_worker_booking_offer"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_worker_booking_offer"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_worker_of_booking_offer"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_worker_of_booking_offer"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prepare_customer_account_deletion"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prepare_customer_account_deletion"("p_request_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."prepare_customer_account_deletion"("p_request_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."prevent_admin_audit_mutation"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_admin_audit_mutation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_admin_audit_mutation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_worker_role_demotion_with_profile"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_worker_role_demotion_with_profile"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."process_razorpay_webhook_event"("p_event_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."process_razorpay_webhook_event"("p_event_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_profile_privileged_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_profile_privileged_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_worker_earnings_immutability"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_worker_earnings_immutability"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_worker_profile_operational_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_worker_profile_operational_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_worker_trust_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_worker_trust_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_expired_worker_presence"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_expired_worker_presence"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_paid_booking"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_paid_booking"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reconcile_paid_booking"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_worker_assignment_presence"("p_worker_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_worker_assignment_presence"("p_worker_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_worker_assignment_presence_from_booking"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_worker_assignment_presence_from_booking"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."reconcile_worker_assignment_presence_from_occurrence"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reconcile_worker_assignment_presence_from_occurrence"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_razorpay_webhook_event"("p_event_id" "text", "p_event_name" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_razorpay_webhook_event"("p_event_id" "text", "p_event_name" "text", "p_payload" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."worker_locations" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."worker_locations" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."record_worker_booking_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_worker_booking_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_worker_booking_location"("p_booking_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."redact_customer_pii_jsonb"("p_value" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."redact_customer_pii_jsonb"("p_value" "jsonb") TO "service_role";



GRANT SELECT,INSERT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."push_tokens" TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_customer_push_token"("p_token" "text", "p_platform" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_customer_push_token"("p_token" "text", "p_platform" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_customer_push_token"("p_token" "text", "p_platform" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_worker_push_token"("p_token" "text", "p_platform" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_worker_push_token"("p_token" "text", "p_platform" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_worker_push_token"("p_token" "text", "p_platform" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_booking_refund"("p_booking_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_booking_refund"("p_booking_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_service_availability"("p_service_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_service_availability"("p_service_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_service_availability"("p_service_id" "uuid", "p_latitude" double precision, "p_longitude" double precision) TO "service_role";



GRANT SELECT,INSERT,TRIGGER,MAINTAIN ON TABLE "public"."account_deletion_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."account_deletion_requests" TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_worker_account_deletion"("p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_worker_account_deletion"("p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_worker_account_deletion"("p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."requeue_stale_payment_refund"("p_refund_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."requeue_stale_payment_refund"("p_refund_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reschedule_customer_booking"("p_booking_id" "uuid", "p_new_start" timestamp with time zone, "p_new_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reschedule_customer_booking"("p_booking_id" "uuid", "p_new_start" timestamp with time zone, "p_new_end" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."reschedule_customer_booking"("p_booking_id" "uuid", "p_new_start" timestamp with time zone, "p_new_end" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT SELECT,INSERT,TRIGGER,MAINTAIN,UPDATE ON TABLE "public"."worker_documents" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_documents" TO "service_role";



REVOKE ALL ON FUNCTION "public"."save_worker_document"("p_document_type" "public"."worker_document_type", "p_file_path" "text", "p_file_name" "text", "p_mime_type" "text", "p_file_size" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_worker_document"("p_document_type" "public"."worker_document_type", "p_file_path" "text", "p_file_name" "text", "p_mime_type" "text", "p_file_size" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_worker_document"("p_document_type" "public"."worker_document_type", "p_file_path" "text", "p_file_name" "text", "p_mime_type" "text", "p_file_size" bigint) TO "service_role";



GRANT ALL ON TABLE "public"."worker_onboarding_profiles" TO "service_role";
GRANT SELECT ON TABLE "public"."worker_onboarding_profiles" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_worker_onboarding"("p_date_of_birth" "date", "p_gender" "text", "p_current_address" "text", "p_permanent_address" "text", "p_city" "text", "p_state" "text", "p_pincode" "text", "p_experience_years" numeric, "p_experience_summary" "text", "p_profile_photo_path" "text", "p_service_latitude" double precision, "p_service_longitude" double precision, "p_onboarding_step" smallint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_worker_onboarding"("p_date_of_birth" "date", "p_gender" "text", "p_current_address" "text", "p_permanent_address" "text", "p_city" "text", "p_state" "text", "p_pincode" "text", "p_experience_years" numeric, "p_experience_summary" "text", "p_profile_photo_path" "text", "p_service_latitude" double precision, "p_service_longitude" double precision, "p_onboarding_step" smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_worker_onboarding"("p_date_of_birth" "date", "p_gender" "text", "p_current_address" "text", "p_permanent_address" "text", "p_city" "text", "p_state" "text", "p_pincode" "text", "p_experience_years" numeric, "p_experience_summary" "text", "p_profile_photo_path" "text", "p_service_latitude" double precision, "p_service_longitude" double precision, "p_onboarding_step" smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_booking_schedule_occurrence_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_booking_schedule_occurrence_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_booking_worker_offer_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_booking_worker_offer_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_home_promotions_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_home_promotions_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_payment_webhook_event_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_platform_setting_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_platform_setting_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_refund_request_result"("p_refund_id" "uuid", "p_status" "text", "p_provider_refund_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_refund_request_result"("p_refund_id" "uuid", "p_status" "text", "p_provider_refund_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_refund_request_result"("p_refund_id" "uuid", "p_status" "text", "p_provider_refund_id" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_service_availability_request_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_service_availability_request_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_service_availability_request_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_support_ticket_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_support_ticket_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_worker_onboarding_consent"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_worker_onboarding_consent"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_worker_onboarding_consent"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_worker_schedule_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_worker_schedule_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_worker_services"("p_service_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_worker_services"("p_service_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_worker_services"("p_service_ids" "uuid"[]) TO "service_role";



GRANT ALL ON TABLE "public"."worker_applications" TO "service_role";
GRANT SELECT ON TABLE "public"."worker_applications" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."submit_worker_application"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_worker_application"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_worker_application"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_address_location_from_coordinates"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_address_location_from_coordinates"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_booking_occurrence_worker"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_booking_occurrence_worker"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_booking_pricing_totals_from_snapshot"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_booking_pricing_totals_from_snapshot"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_cancelled_booking_occurrences"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_cancelled_booking_occurrences"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_profile_email_from_auth"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_profile_email_from_auth"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_service_area_group_rows"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_service_area_group_rows"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_worker_application_operational_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_worker_application_operational_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_worker_location_geometry"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_worker_location_geometry"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."tempstaff_worker_notification_push"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."tempstaff_worker_notification_push"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."transition_booking_occurrence_state"("p_occurrence_id" "uuid", "p_new_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transition_booking_occurrence_state"("p_occurrence_id" "uuid", "p_new_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."transition_booking_state"("p_booking_id" "uuid", "p_new_status" "public"."booking_status", "p_worker_id" "uuid", "p_set_worker" boolean, "p_clear_worker" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transition_booking_state"("p_booking_id" "uuid", "p_new_status" "public"."booking_status", "p_worker_id" "uuid", "p_set_worker" boolean, "p_clear_worker" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_auto_assign_on_worker_location"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_auto_assign_on_worker_location"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_auto_assign_waiting_scheduled_bookings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_auto_assign_waiting_scheduled_bookings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_auto_dispatch_on_worker_location"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_auto_dispatch_on_worker_location"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_auto_dispatch_waiting_bookings_for_worker"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_auto_dispatch_waiting_bookings_for_worker"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_idempotency_keys_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_idempotency_keys_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_idempotency_keys_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "service_role";
GRANT SELECT ON TABLE "public"."bookings" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."update_worker_booking_status"("p_booking_id" "uuid", "p_status" "public"."booking_status") FROM PUBLIC;



REVOKE ALL ON FUNCTION "public"."validate_booking_occurrence_lifecycle"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_booking_occurrence_lifecycle"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_booking_operating_hours"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_booking_operating_hours"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_booking_service_variant_consistency"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_booking_service_variant_consistency"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_booking_worker_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_booking_worker_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_customer_company_name"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_customer_company_name"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_hourly_price_period"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_hourly_price_period"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_near_term_booking_occurrence_worker"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_near_term_booking_occurrence_worker"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_near_term_scheduled_booking"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_near_term_scheduled_booking"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_occurrence_assignment_consistency"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_occurrence_assignment_consistency"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_occurrence_matches_parent_schedule"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_occurrence_matches_parent_schedule"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_occurrence_worker_matches_booking"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_occurrence_worker_matches_booking"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_payment_amount_against_booking"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_payment_amount_against_booking"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_recurring_booking_horizon"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_recurring_booking_horizon"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_service_area_radius"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_service_area_radius"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_service_booking_schedule_policy"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_service_booking_schedule_policy"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_variant_price_period"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_variant_price_period"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_worker_document_integrity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_worker_document_integrity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_worker_earnings_integrity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_worker_earnings_integrity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_worker_operational_configuration"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_worker_operational_configuration"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_worker_profile_owner_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_worker_profile_owner_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_worker_schedule_operating_window"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_worker_schedule_operating_window"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_worker_schedule_settings_integrity"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_worker_schedule_settings_integrity"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_worker_service_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_worker_service_owner"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_worker_weekly_schedule_overlap"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_worker_weekly_schedule_overlap"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_booking_occurrence_otp_atomic"("p_occurrence_id" "uuid", "p_otp_type" "text", "p_otp_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_booking_occurrence_otp_atomic"("p_occurrence_id" "uuid", "p_otp_type" "text", "p_otp_hash" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."verify_booking_occurrence_otp_atomic"("p_occurrence_id" "uuid", "p_otp_type" "text", "p_otp_hash" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."verify_booking_otp_atomic"("p_booking_id" "uuid", "p_otp_type" "text", "p_otp_hash" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_booking_otp_atomic"("p_booking_id" "uuid", "p_otp_type" "text", "p_otp_hash" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_booking_otp_atomic"("p_booking_id" "uuid", "p_otp_type" "text", "p_otp_hash" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_refund_processor_secret"("p_secret" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_refund_processor_secret"("p_secret" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."verify_worker_payout_processor_secret"("p_secret" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verify_worker_payout_processor_secret"("p_secret" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_booking_action"("p_booking_id" "uuid", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_booking_action"("p_booking_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_booking_action"("p_booking_id" "uuid", "p_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_can_cover_scheduled_booking"("p_booking_id" "uuid", "p_worker_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_can_cover_scheduled_booking"("p_booking_id" "uuid", "p_worker_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_covers_booking_interval"("p_service_id" "uuid", "p_worker_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_covers_booking_interval"("p_service_id" "uuid", "p_worker_id" "uuid", "p_start" timestamp with time zone, "p_end" timestamp with time zone) TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_create_booking_change_request"("p_booking_id" "uuid", "p_request_type" "text", "p_reason" "text", "p_requested_start" timestamp with time zone, "p_requested_end" timestamp with time zone, "p_occurrence_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_create_booking_change_request"("p_booking_id" "uuid", "p_request_type" "text", "p_reason" "text", "p_requested_start" timestamp with time zone, "p_requested_end" timestamp with time zone, "p_occurrence_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_create_booking_change_request"("p_booking_id" "uuid", "p_request_type" "text", "p_reason" "text", "p_requested_start" timestamp with time zone, "p_requested_end" timestamp with time zone, "p_occurrence_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_disable_payout_account"("p_payout_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_disable_payout_account"("p_payout_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_disable_payout_account"("p_payout_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_get_available_earnings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_get_available_earnings"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_get_available_earnings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_get_booking_context"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_get_booking_context"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_get_booking_context"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_get_booking_offer_details"("p_offer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_get_booking_offer_details"("p_offer_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."worker_get_booking_offer_details"("p_offer_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."worker_get_incident_summary"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_get_incident_summary"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_get_incident_summary"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_get_payout_overview"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_get_payout_overview"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_get_payout_overview"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_get_performance_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_get_performance_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_get_performance_summary"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_get_verification_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_get_verification_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_get_verification_summary"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_has_active_assignment"("p_worker_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_has_active_assignment"("p_worker_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_list_booking_change_requests"("p_booking_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_list_booking_change_requests"("p_booking_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_list_booking_change_requests"("p_booking_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_list_booking_incidents"("p_booking_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_list_booking_incidents"("p_booking_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_list_booking_incidents"("p_booking_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_list_payout_accounts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_list_payout_accounts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_list_payout_accounts"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_list_payouts"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_list_payouts"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_list_payouts"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_list_reviews"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_list_reviews"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_list_reviews"("p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_occurrence_action"("p_occurrence_id" "uuid", "p_action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_occurrence_action"("p_occurrence_id" "uuid", "p_action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_occurrence_action"("p_occurrence_id" "uuid", "p_action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_presence_heartbeat"("p_latitude" double precision, "p_longitude" double precision) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_presence_heartbeat"("p_latitude" double precision, "p_longitude" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_presence_heartbeat"("p_latitude" double precision, "p_longitude" double precision) TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_report_booking_incident"("p_booking_id" "uuid", "p_incident_type" "text", "p_description" "text", "p_occurrence_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_report_booking_incident"("p_booking_id" "uuid", "p_incident_type" "text", "p_description" "text", "p_occurrence_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_report_booking_incident"("p_booking_id" "uuid", "p_incident_type" "text", "p_description" "text", "p_occurrence_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_request_payout"("p_amount" numeric, "p_idempotency_key" "text", "p_payout_account_id" "uuid", "p_mode" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_request_payout"("p_amount" numeric, "p_idempotency_key" "text", "p_payout_account_id" "uuid", "p_mode" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_request_payout"("p_amount" numeric, "p_idempotency_key" "text", "p_payout_account_id" "uuid", "p_mode" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_respond_to_offer"("p_offer_id" "uuid", "p_response" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_respond_to_offer"("p_offer_id" "uuid", "p_response" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_respond_to_offer"("p_offer_id" "uuid", "p_response" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_set_default_payout_account"("p_payout_account_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_set_default_payout_account"("p_payout_account_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_set_default_payout_account"("p_payout_account_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_set_presence"("p_available" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_set_presence"("p_available" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_set_presence"("p_available" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_update_location"("p_latitude" double precision, "p_longitude" double precision, "p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_update_location"("p_latitude" double precision, "p_longitude" double precision, "p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_update_location"("p_latitude" double precision, "p_longitude" double precision, "p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."worker_withdraw_booking_change_request"("p_request_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."worker_withdraw_booking_change_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."worker_withdraw_booking_change_request"("p_request_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."write_admin_audit"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_before" "jsonb", "p_after" "jsonb", "p_metadata" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."write_admin_audit"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_before" "jsonb", "p_after" "jsonb", "p_metadata" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."write_admin_audit"("p_action" "text", "p_entity_type" "text", "p_entity_id" "uuid", "p_before" "jsonb", "p_after" "jsonb", "p_metadata" "jsonb") TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."addresses" TO "authenticated";
GRANT ALL ON TABLE "public"."addresses" TO "service_role";



GRANT SELECT ON TABLE "public"."admin_audit_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."booking_otps" TO "service_role";



GRANT ALL ON TABLE "public"."booking_schedule_occurrences" TO "service_role";
GRANT SELECT ON TABLE "public"."booking_schedule_occurrences" TO "authenticated";



GRANT ALL ON TABLE "public"."booking_status_history" TO "service_role";
GRANT SELECT ON TABLE "public"."booking_status_history" TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."booking_worker_offers" TO "authenticated";
GRANT ALL ON TABLE "public"."booking_worker_offers" TO "service_role";



GRANT ALL ON TABLE "public"."cancellation_policies" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."cancellation_policies" TO "authenticated";



GRANT ALL ON TABLE "public"."conversations" TO "anon";
GRANT ALL ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT ALL ON TABLE "public"."customer_favourite_services" TO "anon";
GRANT ALL ON TABLE "public"."customer_favourite_services" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_favourite_services" TO "service_role";



GRANT ALL ON TABLE "public"."home_promotions" TO "anon";
GRANT ALL ON TABLE "public"."home_promotions" TO "authenticated";
GRANT ALL ON TABLE "public"."home_promotions" TO "service_role";



GRANT ALL ON TABLE "public"."home_updates" TO "anon";
GRANT ALL ON TABLE "public"."home_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."home_updates" TO "service_role";



GRANT ALL ON TABLE "public"."idempotency_keys" TO "service_role";



GRANT ALL ON TABLE "public"."invoices" TO "service_role";
GRANT SELECT ON TABLE "public"."invoices" TO "authenticated";



GRANT ALL ON TABLE "public"."message_read_receipts" TO "anon";
GRANT ALL ON TABLE "public"."message_read_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."message_read_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."payment_refunds" TO "service_role";
GRANT SELECT ON TABLE "public"."payment_refunds" TO "authenticated";



GRANT ALL ON TABLE "public"."payment_webhook_events" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."payments" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."platform_settings" TO "service_role";
GRANT SELECT ON TABLE "public"."platform_settings" TO "authenticated";



GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."promotion_rules" TO "anon";
GRANT ALL ON TABLE "public"."promotion_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."promotion_rules" TO "service_role";



GRANT ALL ON TABLE "public"."razorpay_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."refund_requests" TO "service_role";



GRANT SELECT,INSERT,MAINTAIN ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."service_booking_schedule_policies" TO "authenticated";
GRANT ALL ON TABLE "public"."service_booking_schedule_policies" TO "service_role";



GRANT ALL ON TABLE "public"."service_categories" TO "anon";
GRANT ALL ON TABLE "public"."service_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."service_categories" TO "service_role";



GRANT ALL ON TABLE "public"."service_discount_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."service_discount_tiers" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."service_hourly_prices" TO "anon";
GRANT ALL ON TABLE "public"."service_hourly_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."service_hourly_prices" TO "service_role";



GRANT ALL ON TABLE "public"."service_recurring_discount_tiers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."service_recurring_discount_tiers" TO "authenticated";



GRANT ALL ON TABLE "public"."service_variant_discount_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."service_variant_discount_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."service_variant_hourly_prices" TO "anon";
GRANT ALL ON TABLE "public"."service_variant_hourly_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."service_variant_hourly_prices" TO "service_role";



GRANT ALL ON TABLE "public"."service_variant_scheduling_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."service_variant_scheduling_rules" TO "service_role";



GRANT ALL ON TABLE "public"."worker_availability" TO "service_role";
GRANT SELECT ON TABLE "public"."worker_availability" TO "authenticated";



GRANT ALL ON TABLE "public"."worker_earnings" TO "service_role";
GRANT SELECT ON TABLE "public"."worker_earnings" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."worker_locations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."worker_locations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."worker_locations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."worker_payout_items" TO "service_role";



GRANT ALL ON TABLE "public"."worker_payout_webhook_events" TO "service_role";



GRANT ALL ON TABLE "public"."worker_presence" TO "service_role";
GRANT SELECT ON TABLE "public"."worker_presence" TO "authenticated";



REVOKE ALL ON TABLE "public"."worker_profiles" FROM "anon";
GRANT ALL ON TABLE "public"."worker_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_profiles" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."worker_profiles" TO "authenticated";



GRANT SELECT("worker_status") ON TABLE "public"."worker_profiles" TO "authenticated";



GRANT SELECT("service_radius_km") ON TABLE "public"."worker_profiles" TO "authenticated";



GRANT SELECT("is_verified") ON TABLE "public"."worker_profiles" TO "authenticated";



GRANT SELECT("rating") ON TABLE "public"."worker_profiles" TO "authenticated";



GRANT SELECT("total_completed_jobs") ON TABLE "public"."worker_profiles" TO "authenticated";



GRANT SELECT("created_at") ON TABLE "public"."worker_profiles" TO "authenticated";



GRANT SELECT("updated_at") ON TABLE "public"."worker_profiles" TO "authenticated";



GRANT SELECT("is_featured") ON TABLE "public"."worker_profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."worker_push_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."worker_push_tokens" TO "anon";
GRANT ALL ON TABLE "public"."worker_push_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."worker_schedule_exceptions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."worker_schedule_exceptions" TO "authenticated";



GRANT ALL ON TABLE "public"."worker_schedule_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."worker_schedule_settings" TO "service_role";



GRANT ALL ON TABLE "public"."worker_services" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."worker_services" TO "authenticated";



GRANT ALL ON TABLE "public"."worker_weekly_schedules" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."worker_weekly_schedules" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
