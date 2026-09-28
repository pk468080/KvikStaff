create or replace function public.cancel_customer_booking(
  p_booking_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  if v_booking.status in ('cancelled','completed','expired') then
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
    'refund_id',v_refund.id
  );
end;
$function$;

create or replace function public.reschedule_customer_booking(
  p_booking_id uuid,
  p_new_start timestamp with time zone,
  p_new_end timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_customer_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_occ public.booking_schedule_occurrences%rowtype;
  v_offer public.booking_worker_offers%rowtype;
  v_timezone text := 'Asia/Kolkata';
  v_new_date date;
  v_old_date date;
  v_new_start_local timestamp;
  v_new_end_local timestamp;
  v_old_count integer;
  v_new_worker_available boolean := false;
begin
  if v_customer_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = v_customer_id
      and role = 'customer'::public.user_role
      and is_active = true
  ) then
    raise exception 'Customer account is inactive';
  end if;

  if p_booking_id is null or p_new_start is null or p_new_end is null then
    raise exception 'Booking and new schedule are required';
  end if;

  if p_new_end <= p_new_start then
    raise exception 'New end time must be after new start time';
  end if;

  select coalesce(
    nullif(trim(value->>'value'),''),
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
    and customer_id = v_customer_id;

  if not found then
    raise exception 'Booking not found';
  end if;

  for v_offer in
    select *
    from public.booking_worker_offers
    where booking_id = p_booking_id
      and status = 'pending'
    order by id
    for update
  loop
    null;
  end loop;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
    and customer_id = v_customer_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.fulfillment_type <> 'scheduled'::public.booking_fulfillment_type then
    raise exception 'Only scheduled bookings can be rescheduled';
  end if;

  if v_booking.worker_id is not null then
    raise exception 'Assigned bookings cannot be rescheduled by the customer';
  end if;

  if v_booking.status not in (
    'pending_payment'::public.booking_status,
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  ) then
    raise exception 'This booking can no longer be rescheduled';
  end if;

  select count(*)
  into v_old_count
  from public.booking_schedule_occurrences
  where booking_id = v_booking.id;

  if v_old_count <> 1 then
    raise exception 'Only single-occurrence scheduled bookings can be rescheduled';
  end if;

  select *
  into v_occ
  from public.booking_schedule_occurrences
  where booking_id = v_booking.id
  order by occurrence_index
  limit 1
  for update;

  if v_occ.worker_id is not null then
    raise exception 'Assigned bookings cannot be rescheduled by the customer';
  end if;

  if v_occ.status in (
    'on_the_way',
    'arrived',
    'in_progress',
    'completed',
    'cancelled'
  ) then
    raise exception 'This booking occurrence can no longer be rescheduled';
  end if;

  if p_new_start <= now() then
    raise exception 'New booking time must be in the future';
  end if;

  v_new_start_local := p_new_start at time zone v_timezone;
  v_new_end_local := p_new_end at time zone v_timezone;
  v_new_date := v_new_start_local::date;
  v_old_date := (v_occ.scheduled_start at time zone v_timezone)::date;

  if v_new_end_local::date <> v_new_date then
    raise exception 'Booking must start and end on the same local date';
  end if;

  if not public.is_booking_within_operating_hours(p_new_start, p_new_end) then
    raise exception 'Requested working hours are outside configured operating hours';
  end if;

  if extract(epoch from (p_new_end - p_new_start))
     <> extract(epoch from (v_occ.scheduled_end - v_occ.scheduled_start))
  then
    raise exception 'Rescheduling must preserve the original booking duration';
  end if;

  if v_new_date <= ((now() at time zone v_timezone)::date + 1) then
    select exists (
      select 1
      from public.worker_profiles wp
      join public.worker_services ws
        on ws.worker_id = wp.id
       and ws.service_id = v_booking.service_id
      where wp.is_verified = true
        and wp.worker_status = 'available'::public.worker_status
        and public.worker_covers_booking_interval(
          v_booking.service_id,
          wp.id,
          p_new_start,
          p_new_end
        )
    )
    into v_new_worker_available;

    if not v_new_worker_available then
      raise exception 'No worker schedule is available for the selected time; choose another time';
    end if;
  end if;

  update public.booking_worker_offers
  set status = 'cancelled',
      responded_at = now(),
      updated_at = now()
  where booking_id = v_booking.id
    and status = 'pending';

  update public.bookings
  set scheduled_start = p_new_start,
      scheduled_end = p_new_end,
      schedule_start_date = v_new_date,
      schedule_end_date = v_new_date,
      daily_start_time = v_new_start_local::time,
      daily_end_time = v_new_end_local::time,
      selected_weekdays = array[extract(dow from v_new_date)::smallint],
      off_dates = '{}'::date[],
      updated_at = now()
  where id = v_booking.id;

  update public.booking_schedule_occurrences
  set occurrence_date = v_new_date,
      scheduled_start = p_new_start,
      scheduled_end = p_new_end,
      original_occurrence_date = coalesce(original_occurrence_date, v_old_date),
      last_modified_at = now(),
      last_modified_by = v_customer_id
  where id = v_occ.id;

  return jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'occurrence_id', v_occ.id,
    'scheduled_start', p_new_start,
    'scheduled_end', p_new_end,
    'previous_scheduled_start', v_occ.scheduled_start,
    'previous_scheduled_end', v_occ.scheduled_end,
    'timezone', v_timezone
  );
end;
$function$;
