CREATE OR REPLACE FUNCTION public.create_customer_scheduled_booking(
  p_service_variant_id uuid,
  p_address_id uuid,
  p_schedule_start_date date,
  p_schedule_end_date date,
  p_daily_start_time time without time zone,
  p_daily_end_time time without time zone,
  p_selected_weekdays smallint[],
  p_off_dates date[] DEFAULT '{}'::date[],
  p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
$function$;