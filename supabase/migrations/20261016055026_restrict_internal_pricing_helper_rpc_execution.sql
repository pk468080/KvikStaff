BEGIN;

-- Internal pricing and booking helpers must not be callable directly
-- by anon or authenticated API clients.
-- Retain execution for trusted server-side operations.

REVOKE EXECUTE
  ON FUNCTION public.calculate_platform_charges(numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
  ON FUNCTION public.calculate_platform_charges(numeric)
  TO service_role;

REVOKE EXECUTE
  ON FUNCTION public.calculate_recurring_occurrence_price(
    uuid, numeric, numeric
  )
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
  ON FUNCTION public.calculate_recurring_occurrence_price(
    uuid, numeric, numeric
  )
  TO service_role;

REVOKE EXECUTE
  ON FUNCTION public.get_configured_gst_rate_percent()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
  ON FUNCTION public.get_configured_gst_rate_percent()
  TO service_role;

REVOKE EXECUTE
  ON FUNCTION public.get_recurring_booking_max_horizon_days()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
  ON FUNCTION public.get_recurring_booking_max_horizon_days()
  TO service_role;

REVOKE EXECUTE
  ON FUNCTION public.is_booking_within_operating_hours(
    timestamp with time zone,
    timestamp with time zone
  )
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
  ON FUNCTION public.is_booking_within_operating_hours(
    timestamp with time zone,
    timestamp with time zone
  )
  TO service_role;

REVOKE EXECUTE
  ON FUNCTION public.customer_has_active_booking_overlap(
    uuid,
    timestamp with time zone,
    timestamp with time zone,
    uuid
  )
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
  ON FUNCTION public.customer_has_active_booking_overlap(
    uuid,
    timestamp with time zone,
    timestamp with time zone,
    uuid
  )
  TO service_role;

COMMIT;