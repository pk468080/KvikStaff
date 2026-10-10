
create or replace function public.worker_get_booking_context(
  p_booking_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_booking_id is null then
    raise exception 'Booking id is required';
  end if;

  if not exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
  ) then
    raise exception 'Booking not found';
  end if;

  if not exists (
    select 1
    from public.bookings b
    where b.id = p_booking_id
      and (
        b.worker_id = auth.uid()
        or exists (
          select 1
          from public.booking_worker_offers bwo
          where bwo.booking_id = b.id
            and bwo.worker_id = auth.uid()
            and bwo.status = 'pending'
            and bwo.expires_at > now()
        )
      )
  ) then
    raise exception 'Booking access denied';
  end if;

  select jsonb_build_object(
    'booking_id', b.id,
    'customer_id', b.customer_id,
    'customer_name', nullif(btrim(p.full_name), ''),
    'customer_phone', nullif(btrim(p.phone), ''),
    'service_id', b.service_id,
    'service_name', s.name,
    'variant_id', b.service_variant_id,
    'variant_name', sv.name,
    'address_id', b.address_id,
    'address_label', nullif(btrim(a.label), ''),
    'address_line', nullif(btrim(a.address_line), ''),
    'latitude', a.latitude,
    'longitude', a.longitude
  )
  into v_result
  from public.bookings b
  left join public.profiles p
    on p.id = b.customer_id
   and p.role = 'customer'
  left join public.services s
    on s.id = b.service_id
  left join public.service_variants sv
    on sv.id = b.service_variant_id
   and sv.service_id = b.service_id
  left join public.addresses a
    on a.id = b.address_id
   and a.user_id = b.customer_id
  where b.id = p_booking_id;

  if v_result is null then
    raise exception 'Booking context unavailable';
  end if;

  return v_result;
end;
$function$;

revoke all
on function public.worker_get_booking_context(uuid)
from public;

revoke all
on function public.worker_get_booking_context(uuid)
from anon;

grant execute
on function public.worker_get_booking_context(uuid)
to authenticated;
;
