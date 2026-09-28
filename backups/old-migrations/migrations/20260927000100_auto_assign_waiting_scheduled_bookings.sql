CREATE OR REPLACE FUNCTION public.auto_assign_waiting_scheduled_bookings_for_worker(
  p_worker_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking record;
  v_worker_location public.geography;
  v_address public.geography;
  v_worker_radius numeric;
  v_assigned_count integer := 0;
BEGIN
  IF p_worker_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT wp.service_radius_km
  INTO v_worker_radius
  FROM public.worker_profiles wp
  JOIN public.profiles p
    ON p.id = wp.id
   AND p.role = 'worker'::public.user_role
   AND p.is_active = true
  JOIN public.worker_presence pr
    ON pr.worker_id = wp.id
   AND pr.is_available = true
   AND pr.expires_at > now()
  WHERE wp.id = p_worker_id
    AND wp.is_verified = true
    AND wp.worker_status = 'available'::public.worker_status
    AND wp.service_radius_km > 0
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT wl.location
  INTO v_worker_location
  FROM public.worker_locations wl
  WHERE wl.worker_id = p_worker_id
    AND wl.booking_id IS NULL
    AND wl.location IS NOT NULL
    AND wl.recorded_at >= now() - interval '10 minutes'
  ORDER BY wl.recorded_at DESC
  LIMIT 1;

  IF v_worker_location IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_booking IN
    SELECT
      b.id,
      b.service_id,
      b.address_id,
      b.scheduled_start,
      b.scheduled_end
    FROM public.bookings b
    WHERE b.status = 'searching_worker'::public.booking_status
      AND b.fulfillment_type =
        'scheduled'::public.booking_fulfillment_type
      AND b.worker_id IS NULL
      AND b.scheduled_start IS NOT NULL
      AND b.scheduled_end IS NOT NULL
      AND b.scheduled_start > now()
    ORDER BY
      b.scheduled_start ASC,
      b.created_at ASC,
      b.id
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT coalesce(
      a.location,
      st_setsrid(
        st_makepoint(a.longitude, a.latitude),
        4326
      )::public.geography
    )
    INTO v_address
    FROM public.addresses a
    WHERE a.id = v_booking.address_id;

    IF v_address IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.worker_services ws
      WHERE ws.worker_id = p_worker_id
        AND ws.service_id = v_booking.service_id
    ) THEN
      CONTINUE;
    END IF;

    IF NOT public.worker_covers_booking_interval(
      v_booking.service_id,
      p_worker_id,
      v_booking.scheduled_start,
      v_booking.scheduled_end
    ) THEN
      CONTINUE;
    END IF;

    IF NOT st_dwithin(
      v_worker_location,
      v_address,
      least(v_worker_radius, 10) * 1000
    ) THEN
      CONTINUE;
    END IF;

    IF NOT st_dwithin(
      v_worker_location,
      v_address,
      10000
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.bookings ob
      WHERE ob.worker_id = p_worker_id
        AND ob.id <> v_booking.id
        AND ob.status IN (
          'assigned'::public.booking_status,
          'on_the_way'::public.booking_status,
          'arrived'::public.booking_status,
          'in_progress'::public.booking_status
        )
        AND ob.scheduled_start < v_booking.scheduled_end
        AND ob.scheduled_end > v_booking.scheduled_start
    ) THEN
      CONTINUE;
    END IF;

    UPDATE public.bookings
    SET
      worker_id = p_worker_id,
      status = 'assigned'::public.booking_status,
      updated_at = now()
    WHERE id = v_booking.id
      AND status = 'searching_worker'::public.booking_status
      AND worker_id IS NULL;

    IF FOUND THEN
      INSERT INTO public.booking_status_history(
        booking_id,
        old_status,
        new_status,
        changed_by,
        created_at
      )
      VALUES(
        v_booking.id,
        'searching_worker'::public.booking_status,
        'assigned'::public.booking_status,
        NULL,
        now()
      );

      v_assigned_count := v_assigned_count + 1;
    END IF;
  END LOOP;

  RETURN v_assigned_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION
  public.auto_assign_waiting_scheduled_bookings_for_worker(uuid)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trigger_auto_assign_waiting_scheduled_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_available = true
     AND NEW.expires_at > now() THEN
    PERFORM public.auto_assign_waiting_scheduled_bookings_for_worker(
      NEW.worker_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS worker_presence_auto_assign_scheduled
ON public.worker_presence;

CREATE TRIGGER worker_presence_auto_assign_scheduled
AFTER INSERT OR UPDATE OF is_available, expires_at
ON public.worker_presence
FOR EACH ROW
WHEN (NEW.is_available = true)
EXECUTE FUNCTION
  public.trigger_auto_assign_waiting_scheduled_bookings();

CREATE OR REPLACE FUNCTION public.trigger_auto_assign_on_worker_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.booking_id IS NULL THEN
    PERFORM public.auto_assign_waiting_scheduled_bookings_for_worker(
      NEW.worker_id
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS worker_location_auto_assign_scheduled
ON public.worker_locations;

CREATE TRIGGER worker_location_auto_assign_scheduled
AFTER INSERT
ON public.worker_locations
FOR EACH ROW
WHEN (NEW.booking_id IS NULL)
EXECUTE FUNCTION
  public.trigger_auto_assign_on_worker_location();

REVOKE EXECUTE ON FUNCTION
  public.trigger_auto_assign_waiting_scheduled_bookings()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
  public.trigger_auto_assign_on_worker_location()
FROM PUBLIC, anon, authenticated;