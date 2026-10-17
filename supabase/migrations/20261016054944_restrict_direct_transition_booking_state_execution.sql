BEGIN;

-- Booking state transitions must not be callable directly by API clients.
-- Trusted backend operations retain execution through service_role.
REVOKE EXECUTE
  ON FUNCTION public.transition_booking_state(
    uuid,
    public.booking_status,
    uuid,
    boolean,
    boolean
  )
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.transition_booking_state(
    uuid,
    public.booking_status,
    uuid,
    boolean,
    boolean
  )
  TO service_role;

COMMIT;