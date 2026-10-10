
insert into public.platform_settings(key, value, description, is_active)
values(
  'worker_payouts.enabled',
  '{"value": false}'::jsonb,
  'Master switch for worker payout requests. Keep disabled until RazorpayX payout configuration is verified.',
  true
)
on conflict (key) do nothing;

alter table public.worker_payout_accounts
  add column if not exists verified_at timestamptz;

alter table public.worker_payouts
  add column if not exists provider_status text,
  add column if not exists utr text,
  add column if not exists provider_fee_amount numeric not null default 0,
  add column if not exists provider_tax_amount numeric not null default 0,
  add column if not exists provider_status_details jsonb,
  add column if not exists provider_created_at timestamptz,
  add column if not exists failure_code text;

create table if not exists public.worker_payout_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  provider_payout_id text,
  provider_status text,
  amount numeric,
  currency text,
  fund_account_id text,
  utr text,
  status_details jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text
);

create index if not exists
idx_worker_payout_webhook_events_payout
on public.worker_payout_webhook_events(provider_payout_id, received_at desc);

create index if not exists
idx_worker_payout_webhook_events_unprocessed
on public.worker_payout_webhook_events(received_at desc)
where processed_at is null;

alter table public.worker_payout_webhook_events enable row level security;
revoke all on table public.worker_payout_webhook_events from anon;
revoke all on table public.worker_payout_webhook_events from authenticated;

create or replace function public.create_worker_payout_internal(
  p_worker_id uuid,
  p_payout_account_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_mode text default null
)
returns public.worker_payouts
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_payout public.worker_payouts%rowtype;
  v_profile public.worker_profiles%rowtype;
  v_account public.worker_payout_accounts%rowtype;
  v_remaining numeric := round(coalesce(p_amount, 0), 2);
  v_requested numeric := round(coalesce(p_amount, 0), 2);
  v_allocated numeric;
  v_available numeric;
  v_take numeric;
  v_earning record;
begin
  if p_worker_id is null then
    raise exception 'Worker ID is required';
  end if;

  if v_requested <= 0 then
    raise exception 'Payout amount must be greater than zero';
  end if;

  if btrim(coalesce(p_idempotency_key, '')) = '' then
    raise exception 'Payout idempotency key is required';
  end if;

  select *
  into v_profile
  from public.worker_profiles
  where id = p_worker_id
  for update;

  if not found then
    raise exception 'Worker profile not found';
  end if;

  if not coalesce(v_profile.is_verified, false) then
    raise exception 'Worker account must be verified before payouts can be requested';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id
    and worker_id = p_worker_id
    and status = 'verified'
  for update;

  if not found then
    raise exception 'Verified worker payout account not found';
  end if;

  if exists (
    select 1
    from public.worker_payouts
    where idempotency_key = btrim(p_idempotency_key)
  ) then
    select *
    into v_payout
    from public.worker_payouts
    where idempotency_key = btrim(p_idempotency_key)
    limit 1;

    if v_payout.worker_id <> p_worker_id then
      raise exception 'Payout idempotency key belongs to a different worker';
    end if;

    return v_payout;
  end if;

  insert into public.worker_payouts(
    worker_id,
    payout_account_id,
    provider,
    idempotency_key,
    amount,
    currency,
    status,
    mode,
    purpose
  )
  values(
    p_worker_id,
    v_account.id,
    'razorpayx',
    btrim(p_idempotency_key),
    v_requested,
    'INR',
    'queued',
    nullif(upper(btrim(coalesce(p_mode, ''))), ''),
    'payout'
  )
  returning * into v_payout;

  for v_earning in
    select e.id, e.net_amount
    from public.worker_earnings e
    where e.worker_id = p_worker_id
      and e.net_amount > 0
    order by e.created_at, e.id
    for update
  loop
    exit when v_remaining <= 0;

    select coalesce(sum(i.amount), 0)
    into v_allocated
    from public.worker_payout_items i
    join public.worker_payouts p
      on p.id = i.payout_id
    where i.earning_id = v_earning.id
      and p.worker_id = p_worker_id
      and p.status in (
        'queued',
        'pending',
        'processing',
        'processed'
      );

    v_available :=
      greatest(
        0,
        round(
          v_earning.net_amount - v_allocated,
          2
        )
      );

    v_take :=
      least(
        v_remaining,
        v_available
      );

    if v_take > 0 then
      insert into public.worker_payout_items(
        payout_id,
        earning_id,
        amount
      )
      values(
        v_payout.id,
        v_earning.id,
        v_take
      );

      v_remaining :=
        round(
          v_remaining - v_take,
          2
        );
    end if;
  end loop;

  if v_remaining > 0 then
    raise exception 'Requested payout exceeds the worker available balance';
  end if;

  return v_payout;
end;
$function$;

revoke all on function public.create_worker_payout_internal(uuid, uuid, numeric, text, text)
from public;

create or replace function public.admin_create_worker_payout(
  p_worker_id uuid,
  p_payout_account_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_mode text default null
)
returns public.worker_payouts
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_payout public.worker_payouts%rowtype;
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  v_payout :=
    public.create_worker_payout_internal(
      p_worker_id,
      p_payout_account_id,
      p_amount,
      p_idempotency_key,
      p_mode
    );

  return v_payout;
end;
$function$;

revoke all on function public.admin_create_worker_payout(uuid, uuid, numeric, text, text)
from public;

grant execute on function public.admin_create_worker_payout(uuid, uuid, numeric, text, text)
to authenticated;

create or replace function public.worker_request_payout(
  p_amount numeric,
  p_idempotency_key text,
  p_payout_account_id uuid default null,
  p_mode text default null
)
returns public.worker_payouts
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_account_id uuid;
  v_enabled boolean := false;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  select coalesce(
    (select (value->>'value')::boolean
     from public.platform_settings
     where key = 'worker_payouts.enabled'
       and is_active = true
     order by updated_at desc
     limit 1),
    false
  )
  into v_enabled;

  if not v_enabled then
    raise exception 'Worker payouts are not currently enabled';
  end if;

  if p_payout_account_id is not null then
    v_account_id := p_payout_account_id;
  else
    select a.id
    into v_account_id
    from public.worker_payout_accounts a
    where a.worker_id = v_worker_id
      and a.status = 'verified'
    order by a.is_default desc, a.created_at desc
    limit 1;
  end if;

  if v_account_id is null then
    raise exception 'A verified payout account is required';
  end if;

  return public.create_worker_payout_internal(
    v_worker_id,
    v_account_id,
    p_amount,
    p_idempotency_key,
    p_mode
  );
end;
$function$;

revoke all on function public.worker_request_payout(numeric, text, uuid, text)
from public;
grant execute on function public.worker_request_payout(numeric, text, uuid, text)
to authenticated;

create or replace function public.worker_set_default_payout_account(
  p_payout_account_id uuid
)
returns public.worker_payout_accounts
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_account public.worker_payout_accounts%rowtype;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id
    and worker_id = v_worker_id
    and status = 'verified'
  for update;

  if not found then
    raise exception 'Verified worker payout account not found';
  end if;

  update public.worker_payout_accounts
  set is_default = false,
      updated_at = now()
  where worker_id = v_worker_id
    and is_default = true
    and id <> p_payout_account_id;

  update public.worker_payout_accounts
  set is_default = true,
      updated_at = now()
  where id = p_payout_account_id;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id;

  return v_account;
end;
$function$;

revoke all on function public.worker_set_default_payout_account(uuid)
from public;
grant execute on function public.worker_set_default_payout_account(uuid)
to authenticated;

create or replace function public.worker_disable_payout_account(
  p_payout_account_id uuid
)
returns public.worker_payout_accounts
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_account public.worker_payout_accounts%rowtype;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id
    and worker_id = v_worker_id
    and status <> 'disabled'
  for update;

  if not found then
    raise exception 'Worker payout account not found';
  end if;

  update public.worker_payout_accounts
  set is_default = false,
      status = 'disabled',
      updated_at = now()
  where id = p_payout_account_id;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id;

  return v_account;
end;
$function$;

revoke all on function public.worker_disable_payout_account(uuid)
from public;
grant execute on function public.worker_disable_payout_account(uuid)
to authenticated;

create or replace function public.admin_review_worker_payout_account(
  p_payout_account_id uuid,
  p_status text,
  p_rejection_reason text default null
)
returns public.worker_payout_accounts
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_account public.worker_payout_accounts%rowtype;
  v_before jsonb;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_reason text := nullif(btrim(coalesce(p_rejection_reason, '')), '');
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  if v_status not in ('pending','verified','rejected','disabled') then
    raise exception 'Invalid payout account status';
  end if;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id
  for update;

  if not found then
    raise exception 'Worker payout account not found';
  end if;

  v_before := to_jsonb(v_account);

  if v_status = 'verified' and nullif(v_account.provider_fund_account_id, '') is null then
    raise exception 'Provider fund account is required before verification';
  end if;

  if v_status = 'rejected' and v_reason is null then
    raise exception 'Rejection reason is required';
  end if;

  update public.worker_payout_accounts
  set status = v_status,
      rejection_reason =
        case
          when v_status = 'rejected' then v_reason
          else null
        end,
      verified_at =
        case
          when v_status = 'verified' then coalesce(verified_at, now())
          else null
        end,
      is_default =
        case
          when v_status = 'disabled' or v_status = 'rejected'
            then false
          else is_default
        end,
      updated_at = now()
  where id = v_account.id
  returning * into v_account;

  if v_status = 'verified'
     and not exists (
       select 1
       from public.worker_payout_accounts a
       where a.worker_id = v_account.worker_id
         and a.id <> v_account.id
         and a.status = 'verified'
         and a.is_default = true
     ) then
    update public.worker_payout_accounts
    set is_default = true,
        updated_at = now()
    where id = v_account.id
    returning * into v_account;
  end if;

  perform public.write_admin_audit(
    'admin_review_worker_payout_account',
    'worker_payout_account',
    v_account.id,
    v_before,
    to_jsonb(v_account),
    jsonb_build_object(
      'status', v_status,
      'rejection_reason', v_reason
    )
  );

  return v_account;
end;
$function$;

revoke all on function public.admin_review_worker_payout_account(uuid,text,text)
from public;
grant execute on function public.admin_review_worker_payout_account(uuid,text,text)
to authenticated;

create or replace function public.worker_list_reviews(
  p_limit integer default 50
)
returns table(
  id uuid,
  booking_id uuid,
  occurrence_id uuid,
  rating integer,
  comment text,
  created_at timestamptz
)
language sql
security definer
set search_path to ''
as $function$
  select
    r.id,
    r.booking_id,
    r.occurrence_id,
    r.rating,
    r.comment,
    r.created_at
  from public.reviews r
  where r.worker_id = (select auth.uid())
    and r.moderation_status = 'published'
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

revoke all on function public.worker_list_reviews(integer)
from public;
grant execute on function public.worker_list_reviews(integer)
to authenticated;

create or replace function public.worker_list_booking_incidents(
  p_booking_id uuid default null,
  p_limit integer default 50
)
returns setof public.worker_booking_incidents
language sql
security definer
set search_path to ''
as $function$
  select i
  from public.worker_booking_incidents i
  where i.worker_id = (select auth.uid())
    and (
      p_booking_id is null
      or i.booking_id = p_booking_id
    )
  order by i.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

revoke all on function public.worker_list_booking_incidents(uuid, integer)
from public;
grant execute on function public.worker_list_booking_incidents(uuid, integer)
to authenticated;

create or replace function public.worker_list_booking_change_requests(
  p_booking_id uuid default null,
  p_limit integer default 50
)
returns setof public.worker_booking_change_requests
language sql
security definer
set search_path to ''
as $function$
  select r
  from public.worker_booking_change_requests r
  where r.worker_id = (select auth.uid())
    and (
      p_booking_id is null
      or r.booking_id = p_booking_id
    )
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

revoke all on function public.worker_list_booking_change_requests(uuid, integer)
from public;
grant execute on function public.worker_list_booking_change_requests(uuid, integer)
to authenticated;

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
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  if v_status not in ('open','in_review','resolved','dismissed') then
    raise exception 'Invalid incident status';
  end if;

  select *
  into v_incident
  from public.worker_booking_incidents
  where id = p_incident_id
  for update;

  if not found then
    raise exception 'Worker booking incident not found';
  end if;

  v_before := to_jsonb(v_incident);

  update public.worker_booking_incidents
  set status = v_status,
      admin_notes = v_notes,
      resolved_at =
        case
          when v_status in ('resolved','dismissed')
            then coalesce(resolved_at, now())
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
      'status', v_status
    )
  );

  return v_incident;
end;
$function$;

revoke all on function public.admin_review_worker_booking_incident(uuid,text,text)
from public;
grant execute on function public.admin_review_worker_booking_incident(uuid,text,text)
to authenticated;

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
declare
  v_request public.worker_booking_change_requests%rowtype;
  v_before jsonb;
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  if v_status not in ('open','approved','rejected') then
    raise exception 'Invalid worker change request status';
  end if;

  select *
  into v_request
  from public.worker_booking_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Worker booking change request not found';
  end if;

  if v_request.status = 'withdrawn' then
    raise exception 'Withdrawn worker change requests cannot be reviewed';
  end if;

  v_before := to_jsonb(v_request);

  update public.worker_booking_change_requests
  set status = v_status,
      admin_notes = v_notes,
      reviewed_at =
        case
          when v_status in ('approved','rejected') then now()
          else null
        end,
      reviewed_by =
        case
          when v_status in ('approved','rejected') then (select auth.uid())
          else null
        end,
      updated_at = now()
  where id = v_request.id
  returning * into v_request;

  perform public.write_admin_audit(
    'admin_review_worker_booking_change_request',
    'worker_booking_change_request',
    v_request.id,
    v_before,
    to_jsonb(v_request),
    jsonb_build_object(
      'status', v_status
    )
  );

  return v_request;
end;
$function$;

revoke all on function public.admin_review_worker_booking_change_request(uuid,text,text)
from public;
grant execute on function public.admin_review_worker_booking_change_request(uuid,text,text)
to authenticated;
;
