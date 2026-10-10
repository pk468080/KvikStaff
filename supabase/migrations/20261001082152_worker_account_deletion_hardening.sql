
create unique index if not exists account_deletion_requests_one_pending_per_user
on public.account_deletion_requests(user_id)
where status = 'pending';

create or replace function public.request_worker_account_deletion(
  p_reason text default null
)
returns public.account_deletion_requests
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_request public.account_deletion_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if v_reason is not null and length(v_reason) > 2000 then
    raise exception 'Deletion reason must not exceed 2000 characters';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Active worker account required';
  end if;

  select *
  into v_request
  from public.account_deletion_requests
  where user_id = v_worker_id
    and status = 'pending'
  order by requested_at desc
  limit 1
  for update;

  if found then
    return v_request;
  end if;

  insert into public.account_deletion_requests(
    user_id,
    reason,
    status
  )
  values(
    v_worker_id,
    v_reason,
    'pending'
  )
  returning * into v_request;

  return v_request;
end;
$function$;

revoke all on function public.request_worker_account_deletion(text)
from public;

grant execute on function public.request_worker_account_deletion(text)
to authenticated;

create or replace function public.admin_review_account_deletion(
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_user_id uuid;
  v_old_status text;
  v_role public.user_role;
  v_active_booking_count integer := 0;
  v_active_occurrence_count integer := 0;
  v_payout_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('approved','rejected','cancelled') then
    raise exception 'Invalid deletion request status';
  end if;

  select to_jsonb(r), r.user_id, r.status
  into v_before, v_user_id, v_old_status
  from public.account_deletion_requests r
  where r.id = p_request_id
  for update;

  if v_user_id is null then
    raise exception 'Deletion request not found';
  end if;

  if v_old_status <> 'pending' then
    raise exception 'Deletion request is no longer pending';
  end if;

  select role
  into v_role
  from public.profiles
  where id = v_user_id
  for update;

  if v_role is null then
    raise exception 'Account profile not found';
  end if;

  if p_status = 'approved' and v_role = 'worker'::public.user_role then
    select count(*)
    into v_active_booking_count
    from public.bookings b
    where b.worker_id = v_user_id
      and b.status in (
        'assigned'::public.booking_status,
        'on_the_way'::public.booking_status,
        'arrived'::public.booking_status,
        'in_progress'::public.booking_status
      );

    select count(*)
    into v_active_occurrence_count
    from public.booking_schedule_occurrences o
    where o.worker_id = v_user_id
      and o.status in ('assigned','on_the_way','arrived','in_progress');

    select count(*)
    into v_payout_count
    from public.worker_payouts p
    where p.worker_id = v_user_id
      and p.status in ('queued','pending','processing');

    if v_active_booking_count > 0 or v_active_occurrence_count > 0 then
      raise exception 'Worker has active bookings or occurrences and cannot be deactivated yet';
    end if;

    if v_payout_count > 0 then
      raise exception 'Worker has an active payout and cannot be deactivated yet';
    end if;
  end if;

  if p_status = 'approved' then
    update public.profiles
    set is_active = false,
        updated_at = now()
    where id = v_user_id;

    if v_role = 'worker'::public.user_role then
      update public.worker_presence
      set is_available = false,
          expires_at = now(),
          updated_at = now()
      where worker_id = v_user_id;

      update public.worker_availability
      set is_available = false
      where worker_id = v_user_id;

      update public.worker_profiles
      set worker_status = 'suspended'::public.worker_status,
          is_verified = false,
          updated_at = now()
      where id = v_user_id;

      update public.worker_push_tokens
      set is_active = false
      where worker_id = v_user_id;
    end if;
  end if;

  update public.account_deletion_requests
  set status = p_status,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where id = p_request_id;

  select to_jsonb(r)
  into v_after
  from public.account_deletion_requests r
  where r.id = p_request_id;

  perform public.write_admin_audit(
    'review_account_deletion',
    'account_deletion_request',
    p_request_id,
    v_before,
    v_after
  );

  begin
    perform public.admin_create_notification(
      v_user_id,
      case
        when p_status = 'approved' then 'Account deletion approved'
        when p_status = 'rejected' then 'Account deletion request rejected'
        else 'Account deletion request cancelled'
      end,
      case
        when p_status = 'approved'
          then 'Your account has been deactivated as requested.'
        when p_status = 'rejected'
          then 'Your account deletion request was not approved.'
        else 'Your account deletion request was cancelled.'
      end,
      'account_deletion',
      null
    );
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', p_status
  );
end;
$function$;

revoke all on function public.admin_review_account_deletion(uuid,text)
from public;
grant execute on function public.admin_review_account_deletion(uuid,text)
to authenticated;
;
