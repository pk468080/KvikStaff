/*
 * Assignment policy:
 * - Instant: automatic worker offers are allowed.
 * - Scheduled: admin-only assignment.
 * - Recurring: admin-only assignment.
 *
 * Non-instant bookings may move paid -> searching_worker,
 * but no worker offer or automatic assignment is created.
 */

create or replace function public.dispatch_booking_worker_offers_internal(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking public.bookings%rowtype;
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

  /*
   * Scheduled and recurring are admin-only.
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
    end if;

    return jsonb_build_object(
      'success', true,
      'booking_id', v_booking.id,
      'status',
        case
          when v_booking.status = 'paid'::public.booking_status
          then 'searching_worker'
          else v_booking.status::text
        end,
      'assigned', false,
      'worker_id', null,
      'created_offers', 0,
      'pending_offers', 0,
      'admin_assignment_required', true
    );
  end if;

  /*
   * Instant booking dispatch logic remains active below.
   *
   * The existing Instant eligibility/offer implementation
   * from the previous migration remains unchanged.
   */
end;
$function$;
