CREATE OR REPLACE FUNCTION public.transition_booking_state(p_booking_id uuid, p_new_status booking_status, p_worker_id uuid DEFAULT NULL::uuid, p_set_worker boolean DEFAULT false, p_clear_worker boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$

