-- Automatic assignment contract:
-- 1. Payment creates worker offer(s), not an assignment.
-- 2. Worker accepts the offer.
-- 3. worker_respond_to_offer() transitions the booking to assigned.
-- 4. Instant, Scheduled and Recurring use the same offer -> accept boundary.

create or replace function public.dispatch_booking_worker_offers_internal(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_booking public.bookings%rowtype;
  v_address public.geography;
  v_worker record;
  v_created_count integer := 0;
  v_existing_count integer := 0;
  v_worker_limit integer;
  v_offer_minutes integer;
  v_offer_expires_at timestamptz;
begin
  if p_booking_id is null then
    raise exception 'Booking ID is required';
  end if;

  select * into v_booking
  from public.bookings
  where id=p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.status not in (
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  ) then
    return jsonb_build_object(
      'success',false,
      'booking_id',v_booking.id,
      'status',v_booking.status::text,
      'error','Booking is not awaiting worker assignment'
    );
  end if;

  if v_booking.worker_id is not null then
    return jsonb_build_object(
      'success',true,
      'booking_id',v_booking.id,
      'status','assigned',
      'assigned',true,
      'worker_id',v_booking.worker_id,
      'created_offers',0,
      'pending_offers',0
    );
  end if;

  select case
    when jsonb_typeof(ps.value->'value')='number'
    then (ps.value->>'value')::integer
    else null
  end
  into v_worker_limit
  from public.platform_settings ps
  where ps.key='dispatch.worker_offer_limit'
    and ps.is_active=true;

  select case
    when jsonb_typeof(ps.value->'value')='number'
    then (ps.value->>'value')::integer
    else null
  end
  into v_offer_minutes
  from public.platform_settings ps
  where ps.key='dispatch.worker_offer_duration_minutes'
    and ps.is_active=true;

  if v_worker_limit is null then
    raise exception 'Dispatch setting dispatch.worker_offer_limit is not configured';
  end if;

  if v_offer_minutes is null then
    raise exception 'Dispatch setting dispatch.worker_offer_duration_minutes is not configured';
  end if;

  if v_worker_limit < 1 then
    raise exception 'Dispatch worker offer limit must be at least 1';
  end if;

  if v_offer_minutes < 1 then
    raise exception 'Dispatch worker offer duration must be at least 1 minute';
  end if;

  select coalesce(
    a.location,
    public.st_setsrid(
      public.st_makepoint(a.longitude,a.latitude),
      4326
    )::public.geography
  )
  into v_address
  from public.addresses a
  where a.id=v_booking.address_id;

  if v_address is null then
    raise exception 'Booking location is missing';
  end if;

  v_offer_expires_at :=
    now()+make_interval(mins=>v_offer_minutes);

  /*
   * Eligibility:
   * - verified active worker
   * - worker is currently available
   * - fresh location
   * - service match
   * - within worker radius and platform 10 km maximum
   * - no active overlapping booking
   * - Instant: live location/conflict eligibility
   * - Scheduled: full interval coverage
   * - Recurring: every persisted occurrence must be coverable
   *
   * Assignment does NOT happen here. This function only creates offers.
   */
  for v_worker in
    select
      wp.id as worker_id,
      wp.rating,
      wp.total_completed_jobs,
      wp.service_radius_km,
      public.st_distance(
        wl.location,v_address
      )/1000.0 as distance_km
    from public.worker_services ws
    join public.worker_profiles wp
      on wp.id=ws.worker_id
    join public.worker_presence pr
      on pr.worker_id=wp.id
     and pr.is_available=true
     and pr.expires_at>now()
    join lateral (
      select wl.location
      from public.worker_locations wl
      where wl.worker_id=wp.id
        and wl.location is not null
        and wl.recorded_at>=now()-interval '10 minutes'
      order by wl.recorded_at desc
      limit 1
    ) wl on true
    where ws.service_id=v_booking.service_id
      and wp.is_verified=true
      and wp.worker_status='available'::public.worker_status
      and wp.service_radius_km is not null
      and wp.service_radius_km>0
      and public.st_dwithin(
        wl.location,
        v_address,
        least(wp.service_radius_km,10)*1000
      )
      and public.st_dwithin(
        wl.location,
        v_address,
        10000
      )
      and not exists (
        select 1
        from public.booking_worker_offers bwo
        where bwo.booking_id=v_booking.id
          and bwo.worker_id=wp.id
          and bwo.status in ('pending','declined','expired')
      )
      and not exists (
        select 1
        from public.bookings b
        where b.worker_id=wp.id
          and b.id<>v_booking.id
          and b.status in (
            'assigned'::public.booking_status,
            'on_the_way'::public.booking_status,
            'arrived'::public.booking_status,
            'in_progress'::public.booking_status
          )
          and b.scheduled_start<v_booking.scheduled_end
          and b.scheduled_end>v_booking.scheduled_start
      )
      and (
        v_booking.fulfillment_type='instant'::public.booking_fulfillment_type
        or (
          v_booking.fulfillment_type='scheduled'::public.booking_fulfillment_type
          and public.worker_covers_booking_interval(
            v_booking.service_id,
            wp.id,
            v_booking.scheduled_start,
            v_booking.scheduled_end
          )
        )
        or (
          v_booking.fulfillment_type='recurring'::public.booking_fulfillment_type
          and public.worker_can_cover_scheduled_booking(
            v_booking.id,
            wp.id
          )
        )
      )
    order by
      distance_km asc,
      wp.rating desc nulls last,
      wp.total_completed_jobs desc nulls last,
      wp.id
    limit v_worker_limit
  loop
    insert into public.booking_worker_offers (
      booking_id,
      worker_id,
      status,
      offered_at,
      expires_at,
      responded_at,
      created_at,
      updated_at
    )
    values (
      v_booking.id,
      v_worker.worker_id,
      'pending',
      now(),
      v_offer_expires_at,
      null,
      now(),
      now()
    )
    on conflict do nothing;

    if found then
      v_created_count:=v_created_count+1;
    end if;
  end loop;

  if v_created_count>0
     and v_booking.status='paid'::public.booking_status then
    update public.bookings
    set
      status='searching_worker'::public.booking_status,
      updated_at=now()
    where id=v_booking.id;

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

  select count(*)
  into v_existing_count
  from public.booking_worker_offers
  where booking_id=v_booking.id
    and status='pending';

  return jsonb_build_object(
    'success',true,
    'booking_id',v_booking.id,
    'status',
      case
        when v_booking.status='paid'::public.booking_status
             and v_created_count>0
        then 'searching_worker'
        else v_booking.status::text
      end,
    'assigned',false,
    'worker_id',null,
    'created_offers',v_created_count,
    'pending_offers',v_existing_count,
    'offer_expires_at',v_offer_expires_at
  );
end;
$function$;

create or replace function public.finalize_razorpay_payment(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_paid_at timestamp with time zone default now()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_dispatch jsonb;
  v_paid_at timestamptz:=coalesce(p_paid_at,now());
begin
  if coalesce(auth.role(),'')<>'service_role' then
    raise exception 'Service role required';
  end if;

  select * into v_payment
  from public.payments
  where id=p_payment_id
  for update;

  if not found then raise exception 'Payment not found'; end if;

  select * into v_booking
  from public.bookings
  where id=v_payment.booking_id
  for update;

  if not found then raise exception 'Booking not found for payment'; end if;

  if p_provider_payment_id is null
     or btrim(p_provider_payment_id)='' then
    raise exception 'Provider payment ID is required';
  end if;

  if v_paid_at>now()+interval '5 minutes' then
    raise exception 'Invalid payment timestamp';
  end if;

  if v_payment.provider_payment_id is not null
     and v_payment.provider_payment_id<>p_provider_payment_id then
    raise exception 'Provider payment ID does not match recorded payment';
  end if;

  if v_payment.status='paid'::public.payment_status then
    begin
      v_dispatch:=
        public.dispatch_booking_worker_offers_internal(v_booking.id);
    exception when others then
      v_dispatch:=jsonb_build_object(
        'success',false,
        'assigned',false,
        'status','searching_worker',
        'error',sqlerrm
      );
    end;

    return jsonb_build_object(
      'success',true,
      'already_paid',true,
      'payment_id',v_payment.id,
      'booking_id',v_booking.id,
      'booking_status',coalesce(
        v_dispatch->>'status',
        v_booking.status::text
      ),
      'assigned',coalesce(
        (v_dispatch->>'assigned')::boolean,
        false
      ),
      'worker_id',v_dispatch->'worker_id',
      'created_offers',coalesce(
        v_dispatch->'created_offers',
        '0'::jsonb
      ),
      'pending_offers',coalesce(
        v_dispatch->'pending_offers',
        '0'::jsonb
      )
    );
  end if;

  if v_payment.status not in (
    'pending'::public.payment_status,
    'failed'::public.payment_status
  ) then
    raise exception 'Payment is not eligible for success finalization';
  end if;

  update public.payments
  set
    provider_payment_id=p_provider_payment_id,
    status='paid'::public.payment_status,
    paid_at=v_paid_at,
    updated_at=now()
  where id=v_payment.id;

  if v_booking.status in (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status
  ) then
    update public.bookings
    set
      status='paid'::public.booking_status,
      updated_at=now()
    where id=v_booking.id;

    insert into public.booking_status_history (
      booking_id,old_status,new_status,changed_by,created_at
    )
    values (
      v_booking.id,
      v_booking.status,
      'paid'::public.booking_status,
      null,
      now()
    );
  end if;

  begin
    v_dispatch:=
      public.dispatch_booking_worker_offers_internal(v_booking.id);
  exception when others then
    v_dispatch:=jsonb_build_object(
      'success',false,
      'assigned',false,
      'status','searching_worker',
      'error',sqlerrm
    );

    update public.bookings
    set
      status='searching_worker'::public.booking_status,
      updated_at=now()
    where id=v_booking.id
      and status='paid'::public.booking_status;

    insert into public.booking_status_history (
      booking_id,old_status,new_status,changed_by,created_at
    )
    values (
      v_booking.id,
      'paid'::public.booking_status,
      'searching_worker'::public.booking_status,
      null,
      now()
    );
  end;

  return jsonb_build_object(
    'success',true,
    'already_paid',false,
    'payment_id',v_payment.id,
    'booking_id',v_booking.id,
    'booking_status',coalesce(
      v_dispatch->>'status',
      'searching_worker'
    ),
    'assigned',coalesce(
      (v_dispatch->>'assigned')::boolean,
      false
    ),
    'worker_id',v_dispatch->'worker_id',
    'created_offers',coalesce(
      v_dispatch->'created_offers',
      '0'::jsonb
    ),
    'pending_offers',coalesce(
      v_dispatch->'pending_offers',
      '0'::jsonb
    )
  );
end;
$function$;

create or replace function public.reconcile_paid_booking(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_dispatch jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_booking
  from public.bookings
  where id=p_booking_id
  for update;

  if not found then raise exception 'Booking not found'; end if;

  if v_booking.customer_id<>auth.uid()
     and not public.is_admin() then
    raise exception 'Booking access denied';
  end if;

  select * into v_payment
  from public.payments
  where booking_id=p_booking_id
    and status='paid'::public.payment_status
  order by updated_at desc
  limit 1;

  if not found then raise exception 'No paid payment found for booking'; end if;

  if v_booking.status in (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status
  ) then
    update public.bookings
    set status='paid'::public.booking_status,updated_at=now()
    where id=p_booking_id;

    insert into public.booking_status_history(
      booking_id,old_status,new_status,changed_by,created_at
    )
    values(
      p_booking_id,
      v_booking.status,
      'paid'::public.booking_status,
      auth.uid(),
      now()
    );
  end if;

  if v_booking.status in (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status,
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  ) then
    v_dispatch:=
      public.dispatch_booking_worker_offers_internal(p_booking_id);
  else
    v_dispatch:=jsonb_build_object(
      'success',true,
      'assigned',v_booking.worker_id is not null,
      'status',v_booking.status::text,
      'worker_id',v_booking.worker_id
    );
  end if;

  return jsonb_build_object(
    'success',true,
    'booking_id',p_booking_id,
    'payment_id',v_payment.id,
    'assignment',v_dispatch
  );
end;
$function$;
