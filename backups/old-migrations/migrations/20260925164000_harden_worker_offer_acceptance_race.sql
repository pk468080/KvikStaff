create or replace function public.worker_respond_to_offer(
  p_offer_id uuid,
  p_response text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_worker_id uuid := auth.uid();
  v_worker public.worker_profiles%rowtype;
  v_offer public.booking_worker_offers%rowtype;
  v_booking public.bookings%rowtype;
  v_response text := lower(trim(p_response));
  v_result jsonb;
  v_pending_offers integer;
begin
  if v_worker_id is null then
    return jsonb_build_object('success',false,'error','Authentication required');
  end if;

  if v_response not in ('accept','decline') then
    return jsonb_build_object('success',false,'error','Invalid offer response');
  end if;

  -- Serialize concurrent actions by the same worker.
  select * into v_worker
  from public.worker_profiles
  where id=v_worker_id
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','Worker profile not found');
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id=v_worker_id
      and p.role='worker'::public.user_role
      and p.is_active=true
  ) then
    return jsonb_build_object('success',false,'error','Worker account is inactive');
  end if;

  if v_worker.is_verified is not true then
    return jsonb_build_object('success',false,'error','Worker account is not verified');
  end if;

  if v_worker.worker_status='suspended'::public.worker_status then
    return jsonb_build_object('success',false,'error','Worker account is suspended');
  end if;

  select * into v_offer
  from public.booking_worker_offers
  where id=p_offer_id and worker_id=v_worker_id
  for update;

  if not found then
    return jsonb_build_object('success',false,'error','Offer not found');
  end if;

  if v_offer.status <> 'pending' then
    return jsonb_build_object('success',false,'error','Offer is no longer available');
  end if;

  if v_offer.expires_at <= now() then
    update public.booking_worker_offers
    set status='expired',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';
    return jsonb_build_object('success',false,'error','Offer has expired','status','expired');
  end if;

  select * into v_booking
  from public.bookings
  where id=v_offer.booking_id
  for update;

  if not found then
    update public.booking_worker_offers
    set status='cancelled',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';
    return jsonb_build_object('success',false,'error','Booking no longer exists');
  end if;

  -- Re-check expiry after the booking lock to close the TOCTOU window.
  if v_offer.status <> 'pending' or v_offer.expires_at <= now() then
    update public.booking_worker_offers
    set status='expired',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';
    return jsonb_build_object('success',false,'error','Offer has expired','status','expired');
  end if;

  -- Re-read worker state after both row locks.
  select * into v_worker
  from public.worker_profiles
  where id=v_worker_id
  for update;

  if v_worker.is_verified is not true
     or v_worker.worker_status='suspended'::public.worker_status
     or not exists (
       select 1 from public.profiles p
       where p.id=v_worker_id
         and p.role='worker'::public.user_role
         and p.is_active=true
     ) then
    update public.booking_worker_offers
    set status='cancelled',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object(
      'success',false,
      'error','Worker account is no longer active and verified'
    );
  end if;

  if v_response='decline' then
    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id;

    select count(*) into v_pending_offers
    from public.booking_worker_offers
    where booking_id=v_booking.id and status='pending';

    if v_pending_offers=0
       and v_booking.worker_id is null
       and v_booking.status in (
         'paid'::public.booking_status,
         'searching_worker'::public.booking_status
       ) then
      begin
        perform public.dispatch_booking_worker_offers_internal(v_booking.id);
      exception when others then
        null;
      end;
    end if;

    return jsonb_build_object(
      'success',true,'action','decline',
      'offer_id',v_offer.id,'booking_id',v_booking.id,'status','declined'
    );
  end if;

  if v_booking.status not in (
    'paid'::public.booking_status,
    'searching_worker'::public.booking_status
  ) or v_booking.worker_id is not null then
    update public.booking_worker_offers
    set status='cancelled',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object('success',false,'error','Booking is no longer available');
  end if;

  -- Scheduled/recurring offers must still be fully coverable at acceptance time.
  if v_booking.fulfillment_type in (
    'scheduled'::public.booking_fulfillment_type,
    'recurring'::public.booking_fulfillment_type
  ) then
    if not public.worker_can_cover_scheduled_booking(v_booking.id,v_worker_id) then
      update public.booking_worker_offers
      set status='declined',responded_at=now(),updated_at=now()
      where id=v_offer.id and status='pending';

      return jsonb_build_object(
        'success',false,
        'error','You can no longer cover all scheduled occurrences for this booking'
      );
    end if;
  end if;

  -- The worker lock above serializes this overlap check for the same worker.
  if exists (
    select 1 from public.bookings ob
    where ob.worker_id=v_worker_id
      and ob.id<>v_booking.id
      and ob.status in (
        'assigned'::public.booking_status,
        'on_the_way'::public.booking_status,
        'arrived'::public.booking_status,
        'in_progress'::public.booking_status
      )
      and ob.scheduled_start < v_booking.scheduled_end
      and ob.scheduled_end > v_booking.scheduled_start
  ) then
    update public.booking_worker_offers
    set status='declined',responded_at=now(),updated_at=now()
    where id=v_offer.id and status='pending';

    return jsonb_build_object(
      'success',false,
      'error','You already have another booking during this time'
    );
  end if;

  v_result := public.transition_booking_state(
    v_booking.id,
    'assigned'::public.booking_status,
    v_worker_id,
    true,
    false
  );

  update public.bookings
  set worker_accepted_at=now(),updated_at=now()
  where id=v_booking.id;

  update public.booking_worker_offers
  set status='accepted',responded_at=now(),updated_at=now()
  where id=v_offer.id and status='pending';

  if not found then
    raise exception 'Offer is no longer available';
  end if;

  update public.booking_worker_offers
  set status='cancelled',responded_at=now(),updated_at=now()
  where booking_id=v_booking.id
    and id<>v_offer.id
    and status='pending';

  update public.worker_profiles
  set worker_status='busy'::public.worker_status,
      updated_at=now()
  where id=v_worker_id;

  update public.worker_presence
  set is_available=false,
      expires_at=now(),
      updated_at=now()
  where worker_id=v_worker_id;

  return jsonb_build_object(
    'success',true,
    'action','accept',
    'offer_id',v_offer.id,
    'booking_id',v_booking.id,
    'worker_id',v_worker_id,
    'status',v_result->>'status'
  );
end;
$function$;
