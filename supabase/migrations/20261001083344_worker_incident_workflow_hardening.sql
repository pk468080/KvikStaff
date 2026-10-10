
alter table public.worker_booking_incidents
  add column if not exists resolved_by uuid null;

create index if not exists worker_booking_incidents_resolved_by_idx
  on public.worker_booking_incidents(resolved_by);

drop function if exists public.admin_review_worker_booking_incident(uuid,text,text);

create or replace function public.admin_review_worker_booking_incident(
  p_incident_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns public.worker_booking_incidents
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_incident public.worker_booking_incidents%rowtype;
  v_before jsonb;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
  v_admin_id uuid := (select auth.uid());
  v_old_status text;
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  if v_status not in ('open','in_review','resolved','dismissed') then
    raise exception 'Invalid incident status';
  end if;

  if v_notes is not null and length(v_notes) > 2000 then
    raise exception 'Admin notes must not exceed 2000 characters';
  end if;

  select *
  into v_incident
  from public.worker_booking_incidents
  where id = p_incident_id
  for update;

  if not found then
    raise exception 'Worker booking incident not found';
  end if;

  v_old_status := v_incident.status;
  v_before := to_jsonb(v_incident);

  if v_old_status in ('resolved','dismissed') and v_status <> v_old_status then
    raise exception 'Resolved or dismissed incidents are terminal';
  end if;

  if v_status in ('resolved','dismissed') and v_notes is null then
    raise exception 'Admin notes are required when resolving or dismissing an incident';
  end if;

  if v_old_status = 'open' and v_status not in ('open','in_review','resolved','dismissed') then
    raise exception 'Invalid incident status transition';
  end if;

  if v_old_status = 'in_review' and v_status not in ('open','in_review','resolved','dismissed') then
    raise exception 'Invalid incident status transition';
  end if;

  update public.worker_booking_incidents
  set
    status = v_status,
    admin_notes = v_notes,
    resolved_at = case
      when v_status in ('resolved','dismissed')
        then coalesce(resolved_at, now())
      else null
    end,
    resolved_by = case
      when v_status in ('resolved','dismissed')
        then coalesce(resolved_by, v_admin_id)
      else null
    end,
    updated_at = now()
  where id = v_incident.id
  returning * into v_incident;

  perform public.write_admin_audit(
    'admin_review_worker_booking_incident',
    'worker_booking_incident',
    v_incident.id,
    v_before,
    to_jsonb(v_incident),
    jsonb_build_object(
      'old_status', v_old_status,
      'status', v_status
    )
  );

  if v_status in ('resolved','dismissed') then
    begin
      perform public.admin_create_notification(
        v_incident.worker_id,
        case
          when v_status = 'resolved' then 'Booking incident resolved'
          else 'Booking incident dismissed'
        end,
        case
          when v_status = 'resolved'
            then 'Your reported booking incident has been resolved by support.'
          else 'Your reported booking incident was dismissed by support.'
        end,
        'worker_booking_incident',
        v_incident.booking_id
      );
    exception when others then
      null;
    end;
  end if;

  return v_incident;
end;
$function$;

revoke all on function public.admin_review_worker_booking_incident(uuid,text,text)
from public;

grant execute on function public.admin_review_worker_booking_incident(uuid,text,text)
to authenticated;

create or replace function public.worker_get_incident_summary(
  p_booking_id uuid default null
)
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'open_count',
    count(*) filter (where i.status in ('open','in_review')),
    'resolved_count',
    count(*) filter (where i.status = 'resolved'),
    'dismissed_count',
    count(*) filter (where i.status = 'dismissed')
  )
  from public.worker_booking_incidents i
  where i.worker_id = (select auth.uid())
    and (
      p_booking_id is null
      or i.booking_id = p_booking_id
    );
$function$;

revoke all on function public.worker_get_incident_summary(uuid)
from public;

grant execute on function public.worker_get_incident_summary(uuid)
to authenticated;
;
