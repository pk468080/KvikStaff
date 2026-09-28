create or replace function public.create_customer_recurring_booking(
  p_service_variant_id uuid,
  p_address_id uuid,
  p_schedule_start_date date,
  p_schedule_end_date date,
  p_daily_start_time time,
  p_daily_end_time time,
  p_selected_weekdays smallint[],
  p_off_dates date[] default '{}'::date[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'customer'::public.user_role
      and is_active = true
  ) then
    raise exception 'Customer account is inactive';
  end if;

  return public.create_customer_multi_occurrence_booking(
    p_service_variant_id,p_address_id,p_schedule_start_date,p_schedule_end_date,
    p_daily_start_time,p_daily_end_time,p_selected_weekdays,p_off_dates,p_notes,
    'recurring'::public.booking_fulfillment_type
  );
end;
$function$;

create or replace function public.create_customer_scheduled_booking(
  p_service_variant_id uuid,
  p_address_id uuid,
  p_schedule_start_date date,
  p_schedule_end_date date,
  p_daily_start_time time,
  p_daily_end_time time,
  p_selected_weekdays smallint[],
  p_off_dates date[] default '{}'::date[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'customer'::public.user_role
      and is_active = true
  ) then
    raise exception 'Customer account is inactive';
  end if;

  return public.create_customer_multi_occurrence_booking(
    p_service_variant_id,p_address_id,p_schedule_start_date,p_schedule_end_date,
    p_daily_start_time,p_daily_end_time,p_selected_weekdays,p_off_dates,p_notes,
    'scheduled'::public.booking_fulfillment_type
  );
end;
$function$;

create or replace function public.create_customer_scheduled_range_booking(
  p_service_variant_id uuid,
  p_address_id uuid,
  p_start_date date,
  p_end_date date,
  p_daily_start_time time,
  p_daily_end_time time,
  p_off_dates date[] default '{}'::date[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'customer'::public.user_role
      and is_active = true
  ) then
    raise exception 'Customer account is inactive';
  end if;

  return public.create_customer_multi_occurrence_booking(
    p_service_variant_id,p_address_id,p_start_date,p_end_date,
    p_daily_start_time,p_daily_end_time,
    array[0,1,2,3,4,5,6]::smallint[],
    coalesce(p_off_dates,'{}'::date[]),p_notes,
    'scheduled'::public.booking_fulfillment_type
  );
end;
$function$;

create or replace function public.verify_booking_otp_atomic(
  p_booking_id uuid,
  p_otp_type text,
  p_otp_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking public.bookings%rowtype;
  v_otp public.booking_otps%rowtype;
  v_new_status public.booking_status;
  v_has_active_booking boolean;
  v_platform_fee numeric;
  v_result jsonb;
  v_otp_type text := lower(trim(p_otp_type));
begin
  if auth.uid() is null then
    return jsonb_build_object('success',false,'error','Authentication required');
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.worker_profiles wp on wp.id = p.id
    where p.id = auth.uid()
      and p.role = 'worker'::public.user_role
      and p.is_active = true
      and coalesce(wp.is_verified,false) = true
      and wp.worker_status <> 'suspended'::public.worker_status
  ) then
    return jsonb_build_object(
      'success',false,
      'error','Worker account is inactive, unverified, or suspended'
    );
  end if;

  if v_otp_type not in ('start','end') then
    return jsonb_build_object('success',false,'error','Invalid OTP type');
  end if;

  if p_otp_hash is null
     or length(trim(p_otp_hash)) <> 64
     or p_otp_hash !~ '^[0-9a-fA-F]{64}$' then
    return jsonb_build_object('success',false,'error','Invalid OTP hash');
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id and worker_id = auth.uid()
  for update;

  if not found then
    return jsonb_build_object(
      'success',false,
      'error','Booking not found or worker is not assigned'
    );
  end if;

  if v_otp_type = 'start' then
    if v_booking.status <> 'arrived'::public.booking_status then
      return jsonb_build_object(
        'success',false,
        'error','Booking must be arrived before start OTP verification'
      );
    end if;
    v_new_status := 'in_progress'::public.booking_status;
  else
    if v_booking.status <> 'in_progress'::public.booking_status then
      return jsonb_build_object(
        'success',false,
        'error','Booking must be in progress before end OTP verification'
      );
    end if;
    v_new_status := 'completed'::public.booking_status;
  end if;

  select * into v_otp
  from public.booking_otps
  where booking_id=p_booking_id
    and otp_type=v_otp_type::public.otp_type
    and status='pending'::public.otp_status
  order by created_at desc limit 1
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','Invalid or expired OTP');
  end if;

  if coalesce(v_otp.attempts,0) >= 5 then
    update public.booking_otps set status='expired'::public.otp_status where id=v_otp.id;
    return jsonb_build_object('success',false,'error','OTP has been locked after too many attempts');
  end if;

  if v_otp.expires_at is not null and v_otp.expires_at <= now() then
    update public.booking_otps set status='expired'::public.otp_status where id=v_otp.id;
    return jsonb_build_object('success',false,'error','OTP has expired. Please generate a new OTP.');
  end if;

  if lower(v_otp.otp_hash) <> lower(trim(p_otp_hash)) then
    update public.booking_otps
    set attempts=coalesce(attempts,0)+1,
        status=case when coalesce(attempts,0)+1 >= 5 then 'expired'::public.otp_status else status end
    where id=v_otp.id and status='pending'::public.otp_status;
    return jsonb_build_object('success',false,'error','Invalid OTP');
  end if;

  update public.booking_otps
  set status='verified'::public.otp_status, verified_at=now()
  where id=v_otp.id and status='pending'::public.otp_status;

  if not found then
    return jsonb_build_object('success',false,'error','OTP has already been used');
  end if;

  if v_otp_type='start' then
    update public.bookings
    set start_otp_verified_at=now(), started_at=coalesce(started_at,now()),
        started_by=coalesce(started_by,auth.uid()), updated_at=now()
    where id=v_booking.id;
    v_result := public.transition_booking_state(v_booking.id,v_new_status,null,false,false);
  else
    update public.bookings
    set end_otp_verified_at=now(), completed_at=coalesce(completed_at,now()), updated_at=now()
    where id=v_booking.id;

    v_result := public.transition_booking_state(v_booking.id,v_new_status,null,false,false);
    v_platform_fee := coalesce(v_booking.platform_fee,0);

    insert into public.worker_earnings(worker_id,booking_id,gross_amount,platform_fee,net_amount)
    select v_booking.worker_id,v_booking.id,v_booking.total_amount,v_platform_fee,
           v_booking.total_amount-v_platform_fee
    where not exists (select 1 from public.worker_earnings where booking_id=v_booking.id);

    select exists (
      select 1 from public.bookings
      where worker_id=auth.uid() and id<>v_booking.id
        and status in ('assigned','on_the_way','arrived','in_progress')
    ) into v_has_active_booking;

    if not v_has_active_booking then
      perform set_config('app.worker_profile_internal_mutation','presence',true);
      update public.worker_profiles
      set worker_status='available'::public.worker_status
      where id=auth.uid() and worker_status <> 'suspended'::public.worker_status;
      update public.worker_availability set is_available=true where worker_id=auth.uid();
      update public.worker_presence set is_available=true where worker_id=auth.uid();
    end if;
  end if;

  return jsonb_build_object(
    'success',true,'booking_id',v_booking.id,
    'otp_type',v_otp_type,'status',v_new_status::text
  );
end;
$function$;

create or replace function public.record_worker_booking_location(
  p_booking_id uuid,
  p_latitude double precision,
  p_longitude double precision
)
returns public.worker_locations
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_booking public.bookings%rowtype;
  v_location public.worker_locations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    join public.worker_profiles wp on wp.id=p.id
    where p.id=v_user_id
      and p.role='worker'::public.user_role
      and p.is_active=true
      and coalesce(wp.is_verified,false)=true
      and wp.worker_status <> 'suspended'::public.worker_status
  ) then
    raise exception 'Worker account is inactive, unverified, or suspended';
  end if;

  if p_booking_id is null then raise exception 'Booking ID is required'; end if;

  if p_latitude is null or p_longitude is null
     or p_latitude < -90 or p_latitude > 90
     or p_longitude < -180 or p_longitude > 180 then
    raise exception 'Invalid coordinates';
  end if;

  select * into v_booking
  from public.bookings
  where id=p_booking_id and worker_id=v_user_id
  for update;

  if not found then raise exception 'Booking not assigned to this worker'; end if;

  if v_booking.status not in (
    'on_the_way'::public.booking_status,
    'arrived'::public.booking_status,
    'in_progress'::public.booking_status
  ) then
    raise exception 'Location tracking is not active for this booking';
  end if;

  insert into public.worker_locations(
    worker_id,booking_id,latitude,longitude,recorded_at
  ) values(v_user_id,p_booking_id,p_latitude,p_longitude,now())
  returning * into v_location;

  return v_location;
end;
$function$;
