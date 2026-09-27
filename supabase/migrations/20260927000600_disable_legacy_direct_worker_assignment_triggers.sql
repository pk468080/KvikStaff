/*
 * Automatic worker matching is offer-first:
 * eligible workers receive booking_worker_offers and the booking
 * becomes assigned only after worker_respond_to_offer('accept').
 *
 * Remove legacy triggers that could directly assign scheduled bookings.
 */

drop trigger if exists worker_presence_auto_assign_scheduled
  on public.worker_presence;

drop trigger if exists worker_location_auto_assign_scheduled
  on public.worker_locations;
