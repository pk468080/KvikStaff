create or replace function public.worker_update_location(
  p_latitude double precision,
  p_longitude double precision,
  p_booking_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_worker_status public.worker_status;
  v_location geography;
  v_recorded_at timestamptz := now();
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if p_latitude is null or p_longitude is null then
    raise exception 'Latitude and longitude are required';
  end if;

  if p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid coordinates';
  end if;

  select wp.worker_status
  into v_worker_status
  from public.profiles p
  join public.worker_profiles wp on wp.id = p.id
  where p.id = v_worker_id
    and p.role = 'worker'::public.user_role
    and p.is_active = true
    and wp.is_verified = true
    and wp.worker_status <> 'suspended'::public.worker_status
  for update;

  if not found then
    raise exception 'Worker is not eligible to publish location';
  end if;

  if p_booking_id is null
     and v_worker_status not in (
       'available'::public.worker_status,
       'busy'::public.worker_status
     ) then
    raise exception 'Worker must be online or busy to publish generic location';
  end if;

  v_location :=
    st_setsrid(
      st_makepoint(p_longitude, p_latitude),
      4326
    )::geography;

  if p_booking_id is not null and not exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and b.worker_id = v_worker_id
      and b.status in (
        'assigned'::public.booking_status,
        'on_the_way'::public.booking_status,
        'arrived'::public.booking_status,
        'in_progress'::public.booking_status
      )
  ) then
    raise exception 'Booking is not assigned to this worker';
  end if;

  insert into public.worker_locations(
    worker_id,
    booking_id,
    latitude,
    longitude,
    location,
    recorded_at
  )
  values(
    v_worker_id,
    p_booking_id,
    p_latitude,
    p_longitude,
    v_location,
    v_recorded_at
  );

  if p_booking_id is null then
    insert into public.worker_locations(
      worker_id,
      booking_id,
      latitude,
      longitude,
      location,
      recorded_at
    )
    select
      v_worker_id,
      b.id,
      p_latitude,
      p_longitude,
      v_location,
      v_recorded_at
    from public.bookings b
    where b.worker_id = v_worker_id
      and b.status in (
        'on_the_way'::public.booking_status,
        'arrived'::public.booking_status,
        'in_progress'::public.booking_status
      );

    insert into public.worker_locations(
      worker_id,
      booking_id,
      latitude,
      longitude,
      location,
      recorded_at
    )
    select
      v_worker_id,
      o.booking_id,
      p_latitude,
      p_longitude,
      v_location,
      v_recorded_at
    from public.booking_schedule_occurrences o
    where o.worker_id = v_worker_id
      and o.status in (
        'on_the_way',
        'arrived',
        'in_progress'
      );
  end if;

  perform set_config(
    'app.worker_profile_internal_mutation',
    'location',
    true
  );

  update public.worker_profiles
  set
    current_location = v_location,
    updated_at = v_recorded_at
  where id = v_worker_id;

  return jsonb_build_object(
    'success', true,
    'recorded_at', v_recorded_at,
    'latitude', p_latitude,
    'longitude', p_longitude
  );
end;
$function$;
