-- Keep scheduled/recurring offers disabled until the occurrence-aware worker app
-- is deployed. The current app still queries offers by booking ID and cannot safely
-- navigate a recurring occurrence after acceptance.
INSERT INTO public.platform_settings (key, value, description, is_active, updated_at)
VALUES (
  'dispatch.scheduled_auto_offers_enabled',
  '{"value": false}'::jsonb,
  'Enable scheduled and recurring worker offers only after occurrence-aware worker app rollout.',
  true,
  now()
)
ON CONFLICT (key) DO UPDATE
SET value = '{"value": false}'::jsonb,
    description = EXCLUDED.description,
    is_active = true,
    updated_at = now();

-- Scheduled and recurring automatic worker dispatch.
--
-- Scope:
--   * preserve the existing instant-dispatch path;
--   * create scheduled/recurring offers during the T-40m..T-30m window;
--   * expire each offer no later than T-30m;
--   * let an offer claim only one recurring occurrence;
--   * make workers ineligible while any booking/occurrence is assigned and unfinished;
--   * restore worker availability after the final active assignment only if they were
--     online when the assignment began and their location is still fresh.
--
-- This migration deliberately fails closed if key live function bodies no longer
-- match the inspected definitions. Review it against the repository migration chain
-- before applying it to production.

ALTER TABLE public.booking_worker_offers
  ADD COLUMN IF NOT EXISTS occurrence_id uuid
    REFERENCES public.booking_schedule_occurrences(id) ON DELETE CASCADE;

ALTER TABLE public.booking_schedule_occurrences
  ADD COLUMN IF NOT EXISTS worker_accepted_at timestamptz;

ALTER TABLE public.worker_presence
  ADD COLUMN IF NOT EXISTS was_available_before_busy boolean NOT NULL DEFAULT false;

-- Keep notifications tied to the exact offer. A recurring series may have several
-- offers for different occurrences, and booking_id alone cannot identify which one.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS booking_worker_offer_id uuid
    REFERENCES public.booking_worker_offers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notifications_booking_worker_offer_idx
  ON public.notifications (booking_worker_offer_id)
  WHERE booking_worker_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS booking_worker_offers_occurrence_idx
  ON public.booking_worker_offers (occurrence_id, status, expires_at)
  WHERE occurrence_id IS NOT NULL;

-- One pending offer per worker, booking and occurrence. A recurring series may
-- have multiple occurrences, so booking_id + worker_id alone is not sufficient.
DROP INDEX IF EXISTS public.booking_worker_offers_one_pending_per_worker;
CREATE UNIQUE INDEX booking_worker_offers_one_pending_per_worker
  ON public.booking_worker_offers (
    booking_id,
    worker_id,
    (coalesce(occurrence_id, '00000000-0000-0000-0000-000000000000'::uuid))
  )
  WHERE status = 'pending'::public.booking_worker_offer_status;

CREATE OR REPLACE FUNCTION public.worker_has_active_assignment(
  p_worker_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.worker_has_active_assignment(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.worker_has_active_assignment(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_worker_assignment_presence(
  p_worker_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.reconcile_worker_assignment_presence(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_worker_assignment_presence(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_worker_assignment_presence_from_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_worker_assignment_presence_from_occurrence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

DROP TRIGGER IF EXISTS zz_reconcile_worker_assignment_on_bookings ON public.bookings;
CREATE TRIGGER zz_reconcile_worker_assignment_on_bookings
AFTER INSERT OR UPDATE OF worker_id, status OR DELETE
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_worker_assignment_presence_from_booking();

DROP TRIGGER IF EXISTS zz_reconcile_worker_assignment_on_occurrences ON public.booking_schedule_occurrences;
CREATE TRIGGER zz_reconcile_worker_assignment_on_occurrences
AFTER INSERT OR UPDATE OF worker_id, status OR DELETE
ON public.booking_schedule_occurrences
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_worker_assignment_presence_from_occurrence();

CREATE OR REPLACE FUNCTION public.dispatch_scheduled_booking_offer_batch(
  p_booking_id uuid,
  p_occurrence_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.dispatch_scheduled_booking_offer_batch(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_scheduled_booking_offer_batch(uuid, uuid) TO service_role;

-- Record the exact offer ID in the notification and include its appointment time.
-- The worker app and push payload can now route directly to one occurrence offer.
CREATE OR REPLACE FUNCTION public.notify_worker_of_booking_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

-- Patch the audited dispatcher rather than replacing its instant matching code.
DO $migration$
DECLARE
  v_definition text;
  v_new_definition text;
  v_start integer;
  v_end integer;
  v_candidate_old constant text := $old$      and wp.worker_status = 'available'::public.worker_status
      and wp.service_radius_km is not null$old$;
  v_candidate_new constant text := $new$      and wp.worker_status = 'available'::public.worker_status
      and NOT public.worker_has_active_assignment(wp.id)
      and wp.service_radius_km is not null$new$;
  v_decl constant text := $old$v_offer_expires_at timestamptz;
begin$old$;
  v_decl_new constant text := $new$v_offer_expires_at timestamptz;
  v_result jsonb;
  v_has_closed_unassigned_occurrence boolean := false;
begin$new$;
  v_start_marker constant text := $marker$/*
   * Scheduled and recurring are deliberately admin-only.$marker$;
  v_end_marker constant text := $marker$/*
   * Automatic offers are enabled only for Instant bookings.$marker$;
  v_old_block constant text := $old$/*
   * Scheduled and recurring are deliberately admin-only.
   * Normalize paid -> searching_worker so the admin workflow has a
   * stable waiting state, but never create a worker offer.
   */
  if v_booking.fulfillment_type in (
    'scheduled'::public.booking_fulfillment_type,
    'recurring'::public.booking_fulfillment_type
  ) then
    update public.booking_worker_offers
    set
      status = 'cancelled',
      responded_at = coalesce(responded_at, now()),
      updated_at = now()
    where booking_id = v_booking.id
      and status = 'pending';

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

      v_booking.status :=
        'searching_worker'::public.booking_status;
    end if;

    select count(*)
    into v_existing_count
    from public.booking_worker_offers
    where booking_id = v_booking.id
      and status = 'pending';

    return jsonb_build_object(
      'success', true,
      'booking_id', v_booking.id,
      'status', v_booking.status::text,
      'assigned', false,
      'worker_id', null,
      'created_offers', 0,
      'pending_offers', v_existing_count,
      'admin_assignment_required', true
    );
  end if;

  $old$;
  v_replacement constant text := $new$if v_booking.fulfillment_type = 'scheduled'::public.booking_fulfillment_type THEN
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

  $new$;
BEGIN
  SELECT pg_get_functiondef('public.dispatch_booking_worker_offers_internal(uuid)'::regprocedure)
  INTO v_definition;

  IF position(v_decl IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch dispatcher: declaration anchor not found';
  END IF;
  v_new_definition := replace(v_definition, v_decl, v_decl_new);

  IF position(v_start_marker IN v_new_definition) = 0
     OR position(v_end_marker IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch dispatcher: scheduled/recurring block anchors not found';
  END IF;

  v_start := position(v_start_marker IN v_new_definition);
  v_end := position(v_end_marker IN v_new_definition);
  IF v_end <= v_start THEN
    RAISE EXCEPTION 'Cannot patch dispatcher: block anchors are out of order';
  END IF;

  IF position(v_old_block IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch dispatcher: audited scheduled/recurring block differs';
  END IF;

  v_new_definition := left(v_new_definition, v_start - 1)
    || v_replacement || E'\n  '
    || substr(v_new_definition, v_end);

  IF position(v_candidate_old IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch instant dispatcher: candidate availability block not found';
  END IF;
  v_new_definition := replace(v_new_definition, v_candidate_old, v_candidate_new);

  EXECUTE v_new_definition;

  SELECT pg_get_functiondef('public.dispatch_booking_worker_offers_internal(uuid)'::regprocedure)
  INTO v_new_definition;
  IF position('dispatch_scheduled_booking_offer_batch' IN v_new_definition) = 0
     OR position('Automatic offers are enabled only for Instant bookings.' IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Dispatcher verification failed';
  END IF;
END;
$migration$;

-- Update the existing worker acceptance RPC so an offer can identify one recurring
-- occurrence. The existing instant transition path is retained. The worker row lock
-- serializes acceptance attempts from separate bookings.
DO $migration$
DECLARE
  v_definition text;
  v_new_definition text;
  v_decl constant text := $old$v_offer_booking_id uuid;$old$;
  v_decl_new constant text := $new$v_offer_booking_id uuid;
  v_offer_occurrence_id uuid;
  v_occurrence public.booking_schedule_occurrences%rowtype;
  v_effective_start timestamptz;
  v_effective_end timestamptz;
$new$;
  v_lookup constant text := $old$select booking_id
  into v_offer_booking_id
  from public.booking_worker_offers
  where id=p_offer_id
    and worker_id=v_worker_id;$old$;
  v_lookup_new constant text := $new$select booking_id, occurrence_id
  into v_offer_booking_id, v_offer_occurrence_id
  from public.booking_worker_offers
  where id=p_offer_id
    and worker_id=v_worker_id;$new$;
  v_offer_lock_marker constant text := $marker$  select *
  into v_offer
  from public.booking_worker_offers
  where id=p_offer_id
    and worker_id=v_worker_id
  for update;$marker$;
  v_type_start integer;
  v_type_end integer;
  v_accept_start integer;
  v_accept_end integer;
  v_status_block constant text := $old$  if v_worker.worker_status<>'available'::public.worker_status then
    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object('success',false,'error','You are no longer available for new work');
  end if;$old$;
  v_status_new constant text := $new$  if v_worker.worker_status<>'available'::public.worker_status then
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
  end if;$new$;
  v_accept_marker constant text := $marker$  v_result:=public.transition_booking_state($marker$;
  v_accepted_marker constant text := $marker$  update public.booking_worker_offers
  set status='accepted',responded_at=now(),updated_at=now()$marker$;
  v_accept_replacement constant text := $new$  if v_offer_occurrence_id is not null then
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

$new$;
  v_old_cancel constant text := $old$  update public.booking_worker_offers
  set status='cancelled',responded_at=now(),updated_at=now()
  where booking_id=v_booking.id
    and id<>v_offer.id
    and status='pending';$old$;
  v_new_cancel constant text := $new$  update public.booking_worker_offers
  set status='cancelled',responded_at=now(),updated_at=now()
  where id <> v_offer.id
    and status='pending'
    and (
      worker_id = v_worker_id
      OR (
        booking_id = v_booking.id
        AND occurrence_id IS NOT DISTINCT FROM v_offer_occurrence_id
      )
    );$new$;
BEGIN
  SELECT pg_get_functiondef('public.worker_respond_to_offer(uuid,text)'::regprocedure)
  INTO v_definition;

  IF position(v_decl IN v_definition) = 0 OR position(v_lookup IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch worker offer response: declaration/lookup anchor not found';
  END IF;

  v_new_definition := replace(v_definition, v_decl, v_decl_new);
  v_new_definition := replace(v_new_definition, v_lookup, v_lookup_new);

  -- Lock parent, then occurrence, then worker profile, then offer. The worker lock
  -- must precede the offer lock because acceptance cancels that worker's other offers;
  -- two concurrent accepts for different bookings must not deadlock on each other's
  -- offer row while holding the same worker row.
  IF position(v_offer_lock_marker IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch worker offer response: offer lock anchor not found';
  END IF;
  v_new_definition := replace(
    v_new_definition,
    v_offer_lock_marker,
    $insert$  IF v_offer_occurrence_id IS NOT NULL THEN
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

$insert$ || v_offer_lock_marker
  );

  -- Replace both the scheduled/recurring rejection and the old instant-only guard with occurrence-aware validation.
  v_type_start := position($needle$  if v_booking.fulfillment_type in (
    'scheduled'::public.booking_fulfillment_type,$needle$ IN v_new_definition);
  IF v_type_start = 0 THEN
    RAISE EXCEPTION 'Cannot patch worker offer response: scheduled/recurring rejection block not found';
  END IF;
  v_type_end := position($needle$  if v_booking.status not in (
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  )$needle$ IN substr(v_new_definition, v_type_start + 1));
  IF v_type_end = 0 THEN
    RAISE EXCEPTION 'Cannot patch worker offer response: post-fulfillment booking eligibility block not found';
  END IF;
  v_type_end := v_type_start + v_type_end;

  v_new_definition := left(v_new_definition, v_type_start - 1)
    || $replacement$  IF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type
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

$replacement$ || substr(v_new_definition, v_type_end);

  IF position(v_status_block IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch worker offer response: worker availability block not found';
  END IF;
  v_new_definition := replace(v_new_definition, v_status_block, v_status_new);

  -- The strict active-assignment rule is primary. Keep the legacy overlap guard,
  -- but compare an occurrence offer with that occurrence's interval, not the full
  -- recurring-series envelope stored on the parent booking.
  IF position('and ob.scheduled_start<v_booking.scheduled_end' IN v_new_definition) = 0
     OR position('and ob.scheduled_end>v_booking.scheduled_start' IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch worker offer response: booking-overlap anchors not found';
  END IF;
  v_new_definition := replace(
    v_new_definition,
    'and ob.scheduled_start<v_booking.scheduled_end',
    'and ob.scheduled_start<v_effective_end'
  );
  v_new_definition := replace(
    v_new_definition,
    'and ob.scheduled_end>v_booking.scheduled_start',
    'and ob.scheduled_end>v_effective_start'
  );

  -- Scheduled/recurring offers use occurrence times for schedule validation.
  v_new_definition := replace(
    v_new_definition,
    $old$  if not public.worker_covers_booking_interval(
    v_booking.service_id,
    v_worker_id,
    v_booking.scheduled_start,
    v_booking.scheduled_end
  ) then$old$,
    $new$  if not public.worker_covers_booking_interval(
    v_booking.service_id,
    v_worker_id,
    v_effective_start,
    v_effective_end
  ) then$new$
  );

  -- Keep the instant/scheduled atomic parent assignment, while a recurring offer
  -- writes the worker to one occurrence and keeps the parent series unassigned.
  v_accept_start := position(v_accept_marker IN v_new_definition);
  v_accept_end := position(v_accepted_marker IN v_new_definition);
  IF v_accept_start = 0 OR v_accept_end = 0 OR v_accept_end <= v_accept_start THEN
    RAISE EXCEPTION 'Cannot patch worker offer response: assignment block anchors not found';
  END IF;
  v_new_definition := left(v_new_definition, v_accept_start - 1)
    || v_accept_replacement
    || substr(v_new_definition, v_accept_end);

  IF position(v_old_cancel IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch worker offer response: pending-offer closure block not found';
  END IF;
  v_new_definition := replace(v_new_definition, v_old_cancel, v_new_cancel);

  EXECUTE v_new_definition;

  SELECT pg_get_functiondef('public.worker_respond_to_offer(uuid,text)'::regprocedure)
  INTO v_new_definition;
  IF position('v_offer_occurrence_id' IN v_new_definition) = 0
     OR position('worker_has_active_assignment' IN v_new_definition) = 0
     OR position('UPDATE public.booking_schedule_occurrences' IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Worker offer acceptance verification failed';
  END IF;
END;
$migration$;

-- Offer details are deliberately limited to a recipient's own offer and the fields
-- needed to render that job. For a recurring offer, start/end/amount are from the
-- selected occurrence, not the parent series aggregate.
CREATE OR REPLACE FUNCTION public.worker_get_booking_offer_details(
  p_offer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.worker_get_booking_offer_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.worker_get_booking_offer_details(uuid) TO authenticated, service_role;

-- Replace old release blocks that only counted parent bookings. The central helper
-- counts both bookings and recurring occurrences and restores presence safely.
DO $migration$
DECLARE
  v_definition text;
  v_new_definition text;
  v_old_first constant text := $old$if p_clear_worker and v_old_worker_id is not null then
      select exists (
        select 1
        from public.bookings
        where worker_id=v_old_worker_id
          and id<>v_booking.id
          and status in (
            'assigned',
            'on_the_way',
            'arrived',
            'in_progress'
          )
      )
      into v_has_active_booking;

      if not v_has_active_booking then
        update public.worker_profiles
        set worker_status='available'::public.worker_status
        where id=v_old_worker_id
          and worker_status<>'suspended'::public.worker_status;

        update public.worker_availability
        set is_available=true
        where worker_id=v_old_worker_id;

        update public.worker_presence
        set is_available=true
        where worker_id=v_old_worker_id;
      end if;
    end if;$old$;
  v_new_first constant text := $new$if p_clear_worker and v_old_worker_id is not null then
      perform public.reconcile_worker_assignment_presence(v_old_worker_id);
    end if;$new$;
  v_old_second constant text := $old$if p_clear_worker and v_old_worker_id is not null then
    select exists (
      select 1
      from public.bookings
      where worker_id=v_old_worker_id
        and id<>v_booking.id
        and status in (
          'assigned',
          'on_the_way',
          'arrived',
          'in_progress'
        )
    )
    into v_has_active_booking;

    if not v_has_active_booking then
      update public.worker_profiles
      set worker_status='available'::public.worker_status
      where id=v_old_worker_id
        and worker_status<>'suspended'::public.worker_status;

      update public.worker_availability
      set is_available=true
      where worker_id=v_old_worker_id;

      update public.worker_presence
      set is_available=true
      where worker_id=v_old_worker_id;
    end if;
  end if;$old$;
  v_new_second constant text := $new$if p_clear_worker and v_old_worker_id is not null then
    perform public.reconcile_worker_assignment_presence(v_old_worker_id);
  end if;$new$;
BEGIN
  SELECT pg_get_functiondef('public.transition_booking_state(uuid,public.booking_status,uuid,boolean,boolean)'::regprocedure)
  INTO v_definition;
  IF position(v_old_first IN v_definition) = 0 OR position(v_old_second IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch transition_booking_state release logic: expected release blocks not found';
  END IF;
  v_new_definition := replace(v_definition, v_old_first, v_new_first);
  v_new_definition := replace(v_new_definition, v_old_second, v_new_second);
  EXECUTE v_new_definition;
END;
$migration$;

-- Remove legacy status toggles that only consider parent bookings. The reconciliation
-- helper and its assignment triggers include recurring occurrence assignments and
-- preserve the worker's prior online intent.
DO $migration$
DECLARE
  v_definition text;
  v_new_definition text;
  v_active_old constant text := $old$if p_status in (
    'assigned'::public.booking_status,
    'on_the_way'::public.booking_status,
    'arrived'::public.booking_status,
    'in_progress'::public.booking_status
  ) then
    update public.worker_profiles
    set worker_status = 'busy'::public.worker_status
    where id = auth.uid();

    update public.worker_availability
    set is_available = false
    where worker_id = auth.uid()
      and is_available = true;
  end if;$old$;
  v_active_new constant text := $new$if p_status in (
    'assigned'::public.booking_status,
    'on_the_way'::public.booking_status,
    'arrived'::public.booking_status,
    'in_progress'::public.booking_status
  ) then
    perform public.reconcile_worker_assignment_presence(auth.uid());
  end if;$new$;
  v_release_old constant text := $old$if p_status in (
    'completed'::public.booking_status,
    'cancelled'::public.booking_status
  ) then
    select exists (
      select 1
      from public.bookings
      where worker_id = auth.uid()
        and status in (
          'assigned'::public.booking_status,
          'on_the_way'::public.booking_status,
          'arrived'::public.booking_status,
          'in_progress'::public.booking_status
        )
        and id <> p_booking_id
    )
    into v_has_active_booking;

    if not v_has_active_booking then
      update public.worker_profiles
      set worker_status = 'available'::public.worker_status
      where id = auth.uid()
        and worker_status <> 'suspended'::public.worker_status;

      update public.worker_availability
      set is_available = true
      where worker_id = auth.uid();
    end if;
  end if;$old$;
  v_release_new constant text := $new$if p_status in (
    'completed'::public.booking_status,
    'cancelled'::public.booking_status
  ) then
    perform public.reconcile_worker_assignment_presence(auth.uid());
  end if;$new$;
BEGIN
  SELECT pg_get_functiondef('public.update_worker_booking_status(uuid,public.booking_status)'::regprocedure)
  INTO v_definition;

  IF position(v_active_old IN v_definition) = 0
     OR position(v_release_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch update_worker_booking_status: expected worker status blocks not found';
  END IF;

  v_new_definition := replace(v_definition, v_active_old, v_active_new);
  v_new_definition := replace(v_new_definition, v_release_old, v_release_new);
  EXECUTE v_new_definition;
END;
$migration$;

-- Admin reassignment must not mark the old worker available before the booking's
-- worker_id changes. The booking trigger reconciles both the old and new worker
-- after the assignment update, including any active recurring occurrence.
DO $migration$
DECLARE
  v_definition text;
  v_new_definition text;
  v_start_marker constant text := $marker$  if v_old_worker is not null
     and v_old_worker<>p_worker_id then$marker$;
  v_end_marker constant text := $marker$  v_result:=public.transition_booking_state($marker$;
  v_candidate_old constant text := $old$      and wp.worker_status in (
        'available'::public.worker_status,
        'offline'::public.worker_status
      )$old$;
  v_candidate_new constant text := $new$      and wp.worker_status in (
        'available'::public.worker_status,
        'offline'::public.worker_status
      )
      and NOT public.worker_has_active_assignment(wp.id)$new$;
  v_start integer;
  v_end integer;
BEGIN
  SELECT pg_get_functiondef('public.admin_assign_booking_worker(uuid,uuid)'::regprocedure)
  INTO v_definition;

  v_start := position(v_start_marker IN v_definition);
  v_end := position(v_end_marker IN v_definition);
  IF v_start = 0 OR v_end = 0 OR v_end <= v_start THEN
    RAISE EXCEPTION 'Cannot patch admin_assign_booking_worker: old-worker availability block anchors not found';
  END IF;

  v_new_definition := left(v_definition, v_start - 1)
    || E'  -- Availability is reconciled by the assignment triggers after the booking update.\n\n'
    || substr(v_definition, v_end);

  IF position(v_candidate_old IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch admin_assign_booking_worker: worker eligibility guard not found';
  END IF;
  v_new_definition := replace(v_new_definition, v_candidate_old, v_candidate_new);

  EXECUTE v_new_definition;
END;
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_new_definition text;
  v_old_block constant text := $old$if not v_has_active_booking then
      perform set_config(
        'app.worker_profile_internal_mutation',
        'presence',
        true
      );

      update public.worker_profiles
      set worker_status = 'available'::public.worker_status
      where id = auth.uid()
        and worker_status <> 'suspended'::public.worker_status;

      update public.worker_availability
      set is_available = true
      where worker_id = auth.uid();

      update public.worker_presence
      set is_available = true
      where worker_id = auth.uid();
    end if;$old$;
  v_new_block constant text := $new$if not v_has_active_booking then
      perform public.reconcile_worker_assignment_presence(auth.uid());
    end if;$new$;
BEGIN
  SELECT pg_get_functiondef('public.verify_booking_otp_atomic(uuid,text,text)'::regprocedure)
  INTO v_definition;
  IF position(v_old_block IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch verify_booking_otp_atomic: legacy release block not found';
  END IF;
  v_new_definition := replace(v_definition, v_old_block, v_new_block);
  EXECUTE v_new_definition;
END;
$migration$;

DO $migration$
DECLARE
  v_definition text;
  v_new_definition text;
  v_old_block constant text := $old$    IF NOT v_has_active THEN
      UPDATE public.worker_profiles
      SET worker_status = 'available'::public.worker_status,
          updated_at = now()
      WHERE id = v_actor
        AND worker_status <> 'suspended'::public.worker_status;
      UPDATE public.worker_availability SET is_available = true WHERE worker_id = v_actor;
      UPDATE public.worker_presence SET is_available = true WHERE worker_id = v_actor;
    END IF;$old$;
  v_new_block constant text := $new$    IF NOT v_has_active THEN
      PERFORM public.reconcile_worker_assignment_presence(v_actor);
    END IF;$new$;
BEGIN
  SELECT pg_get_functiondef('public.verify_booking_occurrence_otp_atomic(uuid,text,text)'::regprocedure)
  INTO v_definition;
  IF position(v_old_block IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch verify_booking_occurrence_otp_atomic: legacy release block not found';
  END IF;
  v_new_definition := replace(v_definition, v_old_block, v_new_block);
  EXECUTE v_new_definition;
END;
$migration$;

-- Explicitly going offline while busy must cancel the remembered online intent.
DO $migration$
DECLARE
  v_definition text;
  v_new_definition text;
  v_old_block constant text := $old$update public.worker_presence
    set is_available = false,
        expires_at = now(),
        updated_at = now()
    where worker_id = v_worker_id;$old$;
  v_new_block constant text := $new$update public.worker_presence
    set is_available = false,
        expires_at = now(),
        was_available_before_busy = false,
        updated_at = now()
    where worker_id = v_worker_id;$new$;
  v_busy_guard_old constant text := $old$    if v_status = 'busy'::public.worker_status then
      raise exception 'Worker is busy';
    end if;$old$;
  v_busy_guard_new constant text := $new$    if v_status = 'busy'::public.worker_status then
      raise exception 'Worker is busy';
    end if;

    if public.worker_has_active_assignment(v_worker_id) then
      raise exception 'Worker has an assigned unfinished booking';
    end if;$new$;
BEGIN
  SELECT pg_get_functiondef('public.worker_set_presence(boolean)'::regprocedure)
  INTO v_definition;
  IF position(v_old_block IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch worker_set_presence: offline update block not found';
  END IF;
  v_new_definition := replace(v_definition, v_old_block, v_new_block);
  IF position(v_busy_guard_old IN v_new_definition) = 0 THEN
    RAISE EXCEPTION 'Cannot patch worker_set_presence: busy eligibility guard not found';
  END IF;
  v_new_definition := replace(v_new_definition, v_busy_guard_old, v_busy_guard_new);
  EXECUTE v_new_definition;
END;
$migration$;

-- Reconcile current workers once after all triggers and acceptance/state routines
-- are patched. This turns already-assigned workers busy and corrects stale busy flags.
DO $migration$
DECLARE
  v_worker record;
BEGIN
  FOR v_worker IN
    SELECT wp.id
    FROM public.worker_profiles wp
    ORDER BY wp.id
  LOOP
    PERFORM public.reconcile_worker_assignment_presence(v_worker.id);
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.dispatch_due_scheduled_worker_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.dispatch_due_scheduled_worker_offers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_due_scheduled_worker_offers() TO service_role;

-- Ensure exactly one minute-level scheduler job for the scheduled/recurring flow.
DO $migration$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid FROM cron.job
    WHERE command ILIKE '%dispatch_due_scheduled_worker_offers%'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'dispatch-due-scheduled-worker-offers',
    '* * * * *',
    'select public.dispatch_due_scheduled_worker_offers();'
  );
END;
$migration$;
