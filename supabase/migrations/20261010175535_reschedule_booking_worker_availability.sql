CREATE OR REPLACE FUNCTION public.reschedule_customer_booking(
  p_booking_id uuid,
  p_new_start timestamp with time zone,
  p_new_end timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;
