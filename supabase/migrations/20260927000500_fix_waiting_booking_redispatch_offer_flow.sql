create or replace function public.auto_dispatch_waiting_bookings_for_worker(
  p_worker_id uuid
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking record;
  v_offer_count integer := 0;
  v_result jsonb;
begin
  if p_worker_id is null then
    return 0;
  end if;

  /*
   * Re-dispatch never assigns directly.
   * It only creates a pending worker offer. The worker must accept
   * through worker_respond_to_offer() before the booking becomes assigned.
   */
  for v_booking in
    select b.id
    from public.bookings b
    where b.status in (
      'paid'::public.booking_status,
      'searching_worker'::public.booking_status
    )
      and b.worker_id is null
      and b.scheduled_end > now()
      and exists (
        select 1
        from public.payments p
        where p.booking_id = b.id
          and p.status = 'paid'::public.payment_status
      )
    order by b.scheduled_start asc, b.created_at asc
  loop
    begin
      v_result :=
        public.dispatch_booking_worker_offers_internal(
          v_booking.id
        );

      v_offer_count :=
        v_offer_count
        + coalesce(
            (v_result->>'created_offers')::integer,
            0
          );
    exception
      when others then
        null;
    end;
  end loop;

  return v_offer_count;
end;
$function$;

create or replace function public.trigger_auto_dispatch_waiting_bookings_for_worker()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.auto_dispatch_waiting_bookings_for_worker(new.worker_id);
  return new;
end;
$function$;

create or replace function public.trigger_auto_dispatch_on_worker_location()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.booking_id is null then
    perform public.auto_dispatch_waiting_bookings_for_worker(new.worker_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_auto_assign_waiting_scheduled_bookings
on public.worker_presence;

drop trigger if exists trg_auto_assign_waiting_scheduled_on_worker_location
on public.worker_locations;

create trigger trg_auto_dispatch_waiting_bookings
after insert or update of is_available, expires_at
on public.worker_presence
for each row
when (
  new.is_available = true
)
execute function public.trigger_auto_dispatch_waiting_bookings_for_worker();

create trigger trg_auto_dispatch_waiting_bookings_on_worker_location
after insert
on public.worker_locations
for each row
when (
  new.booking_id is null
)
execute function public.trigger_auto_dispatch_on_worker_location();

do $$
declare
  r record;
begin
  for r in
    select worker_id
    from public.worker_presence
    where is_available = true
      and expires_at > now()
  loop
    perform public.auto_dispatch_waiting_bookings_for_worker(r.worker_id);
  end loop;
end;
$$;
