
begin;

revoke execute on function public.admin_get_live_map_data() from public;
grant execute on function public.admin_get_live_map_data() to authenticated, service_role;

alter function public.worker_get_booking_context(uuid)
  set search_path = public;

create or replace function public.admin_review_worker_booking_change_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text default null
)
returns public.worker_booking_change_requests
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  return public.admin_execute_worker_booking_change_request(
    p_request_id,
    p_status,
    p_admin_notes
  );
end;
$function$;

commit;
;
