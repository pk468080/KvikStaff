
create table if not exists public.worker_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null
    references public.worker_profiles(id)
    on delete cascade,
  provider text not null default 'razorpayx'
    check (provider in ('razorpayx')),
  provider_contact_id text,
  provider_fund_account_id text,
  account_type text not null
    check (account_type in ('bank_account', 'upi')),
  account_holder_name text,
  bank_name text,
  account_last4 text,
  upi_id_masked text,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected', 'disabled')),
  is_default boolean not null default false,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists
worker_payout_accounts_provider_fund_account_key
on public.worker_payout_accounts(provider, provider_fund_account_id)
where provider_fund_account_id is not null;

create unique index if not exists
worker_payout_accounts_default_worker_key
on public.worker_payout_accounts(worker_id)
where is_default = true and status <> 'disabled';

create index if not exists
idx_worker_payout_accounts_worker_status
on public.worker_payout_accounts(worker_id, status, created_at desc);

create table if not exists public.worker_payouts (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null
    references public.worker_profiles(id)
    on delete cascade,
  payout_account_id uuid
    references public.worker_payout_accounts(id)
    on delete set null,
  provider text not null default 'razorpayx'
    check (provider in ('razorpayx')),
  provider_payout_id text,
  idempotency_key text not null unique,
  amount numeric not null
    check (amount > 0),
  currency text not null default 'INR'
    check (currency = 'INR'),
  status text not null default 'queued'
    check (status in (
      'queued','pending','rejected','processing',
      'processed','cancelled','reversed','failed'
    )),
  mode text,
  purpose text not null default 'payout',
  failure_reason text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists
worker_payouts_provider_payout_key
on public.worker_payouts(provider, provider_payout_id)
where provider_payout_id is not null;

create index if not exists
idx_worker_payouts_worker_created
on public.worker_payouts(worker_id, created_at desc);

create index if not exists
idx_worker_payouts_status_created
on public.worker_payouts(status, created_at);

create table if not exists public.worker_payout_items (
  id uuid primary key default gen_random_uuid(),
  payout_id uuid not null
    references public.worker_payouts(id)
    on delete cascade,
  earning_id uuid not null
    references public.worker_earnings(id)
    on delete restrict,
  amount numeric not null
    check (amount > 0),
  created_at timestamptz not null default now(),
  unique(payout_id, earning_id)
);

create index if not exists
idx_worker_payout_items_earning
on public.worker_payout_items(earning_id);

create index if not exists
idx_worker_payout_items_payout
on public.worker_payout_items(payout_id);

create table if not exists public.worker_booking_incidents (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null
    references public.worker_profiles(id)
    on delete cascade,
  booking_id uuid not null
    references public.bookings(id)
    on delete cascade,
  occurrence_id uuid
    references public.booking_schedule_occurrences(id)
    on delete cascade,
  incident_type text not null
    check (incident_type in (
      'customer_unavailable',
      'wrong_address',
      'unsafe_location',
      'access_problem',
      'extra_work_requested',
      'customer_behaviour',
      'worker_emergency',
      'other'
    )),
  status text not null default 'open'
    check (status in ('open', 'in_review', 'resolved', 'dismissed')),
  description text not null
    check (length(btrim(description)) between 1 and 2000),
  admin_notes text,
  reported_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists
idx_worker_booking_incidents_worker_created
on public.worker_booking_incidents(worker_id, created_at desc);

create index if not exists
idx_worker_booking_incidents_booking_created
on public.worker_booking_incidents(booking_id, created_at desc);

create index if not exists
idx_worker_booking_incidents_open
on public.worker_booking_incidents(status, created_at desc)
where status in ('open', 'in_review');

create table if not exists public.worker_booking_change_requests (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null
    references public.worker_profiles(id)
    on delete cascade,
  booking_id uuid not null
    references public.bookings(id)
    on delete cascade,
  occurrence_id uuid
    references public.booking_schedule_occurrences(id)
    on delete cascade,
  request_type text not null
    check (request_type in ('cancel', 'reschedule')),
  reason text not null
    check (length(btrim(reason)) between 1 and 2000),
  requested_start timestamptz,
  requested_end timestamptz,
  status text not null default 'open'
    check (status in ('open', 'approved', 'rejected', 'withdrawn')),
  admin_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid
    references public.profiles(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    request_type <> 'reschedule'
    or (
      requested_start is not null
      and requested_end is not null
      and requested_end > requested_start
    )
  ),
  check (
    request_type <> 'cancel'
    or (
      requested_start is null
      and requested_end is null
    )
  )
);

create index if not exists
idx_worker_booking_change_requests_worker_created
on public.worker_booking_change_requests(worker_id, created_at desc);

create index if not exists
idx_worker_booking_change_requests_booking_created
on public.worker_booking_change_requests(booking_id, created_at desc);

create index if not exists
idx_worker_booking_change_requests_open
on public.worker_booking_change_requests(status, created_at desc)
where status = 'open';

alter table public.worker_payout_accounts enable row level security;
alter table public.worker_payouts enable row level security;
alter table public.worker_payout_items enable row level security;
alter table public.worker_booking_incidents enable row level security;
alter table public.worker_booking_change_requests enable row level security;

revoke all on table public.worker_payout_accounts from anon;
revoke all on table public.worker_payout_accounts from authenticated;
revoke all on table public.worker_payouts from anon;
revoke all on table public.worker_payouts from authenticated;
revoke all on table public.worker_payout_items from anon;
revoke all on table public.worker_payout_items from authenticated;
revoke all on table public.worker_booking_incidents from anon;
revoke all on table public.worker_booking_incidents from authenticated;
revoke all on table public.worker_booking_change_requests from anon;
revoke all on table public.worker_booking_change_requests from authenticated;

drop policy if exists worker_payout_accounts_select_own_or_admin
on public.worker_payout_accounts;
create policy worker_payout_accounts_select_own_or_admin
on public.worker_payout_accounts
for select to authenticated
using (
  worker_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists worker_payouts_select_own_or_admin
on public.worker_payouts;
create policy worker_payouts_select_own_or_admin
on public.worker_payouts
for select to authenticated
using (
  worker_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists worker_payout_items_select_own_or_admin
on public.worker_payout_items;
create policy worker_payout_items_select_own_or_admin
on public.worker_payout_items
for select to authenticated
using (
  exists (
    select 1
    from public.worker_payouts p
    where p.id = worker_payout_items.payout_id
      and (
        p.worker_id = (select auth.uid())
        or (select public.is_admin())
      )
  )
);

drop policy if exists worker_booking_incidents_select_own_or_admin
on public.worker_booking_incidents;
create policy worker_booking_incidents_select_own_or_admin
on public.worker_booking_incidents
for select to authenticated
using (
  worker_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists worker_booking_change_requests_select_own_or_admin
on public.worker_booking_change_requests;
create policy worker_booking_change_requests_select_own_or_admin
on public.worker_booking_change_requests
for select to authenticated
using (
  worker_id = (select auth.uid())
  or (select public.is_admin())
);

create or replace function public.worker_get_payout_overview()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_total_earned numeric := 0;
  v_reserved numeric := 0;
  v_paid numeric := 0;
  v_available numeric := 0;
  v_account_count integer := 0;
  v_verified_account_count integer := 0;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  select coalesce(sum(e.net_amount), 0)
  into v_total_earned
  from public.worker_earnings e
  where e.worker_id = v_worker_id;

  select coalesce(sum(i.amount), 0)
  into v_reserved
  from public.worker_payout_items i
  join public.worker_payouts p on p.id = i.payout_id
  where p.worker_id = v_worker_id
    and p.status in ('queued','pending','processing');

  select coalesce(sum(i.amount), 0)
  into v_paid
  from public.worker_payout_items i
  join public.worker_payouts p on p.id = i.payout_id
  where p.worker_id = v_worker_id
    and p.status = 'processed';

  v_available := greatest(
    0,
    v_total_earned - v_reserved - v_paid
  );

  select count(*)
  into v_account_count
  from public.worker_payout_accounts a
  where a.worker_id = v_worker_id
    and a.status <> 'disabled';

  select count(*)
  into v_verified_account_count
  from public.worker_payout_accounts a
  where a.worker_id = v_worker_id
    and a.status = 'verified';

  return jsonb_build_object(
    'total_earned', round(v_total_earned, 2),
    'reserved_for_payout', round(v_reserved, 2),
    'paid_out', round(v_paid, 2),
    'available_for_payout', round(v_available, 2),
    'payout_accounts', v_account_count,
    'verified_payout_accounts', v_verified_account_count,
    'payout_enabled', false
  );
end;
$function$;

revoke all on function public.worker_get_payout_overview() from public;
grant execute on function public.worker_get_payout_overview() to authenticated;

create or replace function public.worker_list_payouts(
  p_limit integer default 50
)
returns setof public.worker_payouts
language sql
security definer
set search_path to ''
as $function$
  select p
  from public.worker_payouts p
  where p.worker_id = (select auth.uid())
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$function$;

revoke all on function public.worker_list_payouts(integer) from public;
grant execute on function public.worker_list_payouts(integer) to authenticated;

create or replace function public.worker_list_payout_accounts()
returns setof public.worker_payout_accounts
language sql
security definer
set search_path to ''
as $function$
  select a
  from public.worker_payout_accounts a
  where a.worker_id = (select auth.uid())
  order by a.is_default desc, a.created_at desc;
$function$;

revoke all on function public.worker_list_payout_accounts() from public;
grant execute on function public.worker_list_payout_accounts() to authenticated;

create or replace function public.worker_report_booking_incident(
  p_booking_id uuid,
  p_incident_type text,
  p_description text,
  p_occurrence_id uuid default null
)
returns public.worker_booking_incidents
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_occurrence public.booking_schedule_occurrences%rowtype;
  v_incident public.worker_booking_incidents%rowtype;
  v_type text := lower(btrim(coalesce(p_incident_type, '')));
  v_description text := btrim(coalesce(p_description, ''));
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if v_type not in (
    'customer_unavailable',
    'wrong_address',
    'unsafe_location',
    'access_problem',
    'extra_work_requested',
    'customer_behaviour',
    'worker_emergency',
    'other'
  ) then
    raise exception 'Invalid incident type';
  end if;

  if length(v_description) < 1 or length(v_description) > 2000 then
    raise exception 'Incident description must be between 1 and 2000 characters';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if p_occurrence_id is not null then
    select * into v_occurrence
    from public.booking_schedule_occurrences
    where id = p_occurrence_id
      and booking_id = p_booking_id
    for update;

    if not found then
      raise exception 'Booking occurrence not found';
    end if;

    if v_occurrence.worker_id <> v_worker_id then
      raise exception 'Worker is not assigned to this occurrence';
    end if;

    if v_occurrence.status not in (
      'scheduled','assigned','on_the_way','arrived','in_progress'
    ) then
      raise exception 'Incident cannot be reported for this occurrence at its current status';
    end if;
  else
    if v_booking.worker_id <> v_worker_id then
      raise exception 'Worker is not assigned to this booking';
    end if;

    if v_booking.status not in (
      'assigned','on_the_way','arrived','in_progress'
    ) then
      raise exception 'Incident cannot be reported for this booking at its current status';
    end if;
  end if;

  insert into public.worker_booking_incidents(
    worker_id, booking_id, occurrence_id, incident_type, description
  )
  values(
    v_worker_id, p_booking_id, p_occurrence_id, v_type, v_description
  )
  returning * into v_incident;

  return v_incident;
end;
$function$;

revoke all on function public.worker_report_booking_incident(uuid, text, text, uuid) from public;
grant execute on function public.worker_report_booking_incident(uuid, text, text, uuid) to authenticated;

create or replace function public.worker_create_booking_change_request(
  p_booking_id uuid,
  p_request_type text,
  p_reason text,
  p_requested_start timestamptz default null,
  p_requested_end timestamptz default null,
  p_occurrence_id uuid default null
)
returns public.worker_booking_change_requests
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_occurrence public.booking_schedule_occurrences%rowtype;
  v_request public.worker_booking_change_requests%rowtype;
  v_request_type text := lower(btrim(coalesce(p_request_type, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if v_request_type not in ('cancel', 'reschedule') then
    raise exception 'Invalid booking change request type';
  end if;

  if length(v_reason) < 1 or length(v_reason) > 2000 then
    raise exception 'Request reason must be between 1 and 2000 characters';
  end if;

  if v_request_type = 'reschedule'
     and (
       p_requested_start is null
       or p_requested_end is null
       or p_requested_end <= p_requested_start
     ) then
    raise exception 'A valid requested start and end are required for reschedule requests';
  end if;

  if v_request_type = 'cancel'
     and (
       p_requested_start is not null
       or p_requested_end is not null
     ) then
    raise exception 'Cancellation requests must not include new times';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if p_occurrence_id is not null then
    select * into v_occurrence
    from public.booking_schedule_occurrences
    where id = p_occurrence_id
      and booking_id = p_booking_id
    for update;

    if not found then
      raise exception 'Booking occurrence not found';
    end if;

    if v_occurrence.worker_id <> v_worker_id then
      raise exception 'Worker is not assigned to this occurrence';
    end if;

    if v_occurrence.status not in ('scheduled','assigned') then
      raise exception 'This occurrence can no longer accept worker change requests';
    end if;
  else
    if v_booking.worker_id <> v_worker_id then
      raise exception 'Worker is not assigned to this booking';
    end if;

    if v_booking.status <> 'assigned' then
      raise exception 'This booking can no longer accept worker change requests';
    end if;
  end if;

  if p_requested_start is not null
     and p_requested_start <= now() then
    raise exception 'Requested start must be in the future';
  end if;

  if exists (
    select 1
    from public.worker_booking_change_requests r
    where r.worker_id = v_worker_id
      and r.booking_id = p_booking_id
      and r.occurrence_id is not distinct from p_occurrence_id
      and r.status = 'open'
  ) then
    raise exception 'An open worker change request already exists for this booking';
  end if;

  insert into public.worker_booking_change_requests(
    worker_id, booking_id, occurrence_id, request_type, reason,
    requested_start, requested_end
  )
  values(
    v_worker_id, p_booking_id, p_occurrence_id, v_request_type, v_reason,
    p_requested_start, p_requested_end
  )
  returning * into v_request;

  return v_request;
end;
$function$;

revoke all on function public.worker_create_booking_change_request(uuid, text, text, timestamptz, timestamptz, uuid) from public;
grant execute on function public.worker_create_booking_change_request(uuid, text, text, timestamptz, timestamptz, uuid) to authenticated;

create or replace function public.worker_withdraw_booking_change_request(
  p_request_id uuid
)
returns public.worker_booking_change_requests
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_request public.worker_booking_change_requests%rowtype;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_request
  from public.worker_booking_change_requests
  where id = p_request_id
    and worker_id = v_worker_id
  for update;

  if not found then
    raise exception 'Worker booking change request not found';
  end if;

  if v_request.status <> 'open' then
    raise exception 'Only open change requests can be withdrawn';
  end if;

  update public.worker_booking_change_requests
  set status='withdrawn', updated_at=now()
  where id=v_request.id
  returning * into v_request;

  return v_request;
end;
$function$;

revoke all on function public.worker_withdraw_booking_change_request(uuid) from public;
grant execute on function public.worker_withdraw_booking_change_request(uuid) to authenticated;

create or replace function public.worker_get_verification_summary()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_application_status text;
  v_is_verified boolean;
  v_document_count integer := 0;
  v_approved_count integer := 0;
  v_pending_count integer := 0;
  v_rejected_count integer := 0;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  select wp.is_verified into v_is_verified
  from public.worker_profiles wp
  where wp.id = v_worker_id;

  if not found then
    raise exception 'Worker profile not found';
  end if;

  select wa.status::text into v_application_status
  from public.worker_applications wa
  where wa.worker_id = v_worker_id
  order by wa.created_at desc
  limit 1;

  select
    count(*) filter (where d.document_type in (
      'passport_photo','aadhaar','pan',
      'address_proof','police_verification','bank_account'
    )),
    count(*) filter (where d.status = 'approved'),
    count(*) filter (where d.status = 'pending'),
    count(*) filter (where d.status = 'rejected')
  into
    v_document_count, v_approved_count, v_pending_count, v_rejected_count
  from public.worker_documents d
  where d.worker_id = v_worker_id;

  return jsonb_build_object(
    'worker_verified', coalesce(v_is_verified,false),
    'application_status', v_application_status,
    'document_count', v_document_count,
    'approved_document_count', v_approved_count,
    'pending_document_count', v_pending_count,
    'rejected_document_count', v_rejected_count
  );
end;
$function$;

revoke all on function public.worker_get_verification_summary() from public;
grant execute on function public.worker_get_verification_summary() to authenticated;

create or replace function public.worker_get_performance_summary()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_completed_jobs integer := 0;
  v_completed_occurrences integer := 0;
  v_total_earnings numeric := 0;
  v_average_rating numeric := 0;
  v_total_reviews integer := 0;
  v_offer_total integer := 0;
  v_offer_accepted integer := 0;
  v_offer_declined integer := 0;
  v_offer_expired integer := 0;
  v_acceptance_rate numeric := 0;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  select count(*) into v_completed_jobs
  from public.bookings b
  where b.worker_id = v_worker_id
    and b.status = 'completed'::public.booking_status;

  select count(*) into v_completed_occurrences
  from public.booking_schedule_occurrences o
  where o.worker_id = v_worker_id
    and o.status = 'completed';

  select coalesce(sum(e.net_amount),0) into v_total_earnings
  from public.worker_earnings e
  where e.worker_id = v_worker_id;

  select coalesce(avg(r.rating),0), count(*)
  into v_average_rating, v_total_reviews
  from public.reviews r
  where r.worker_id = v_worker_id
    and r.moderation_status = 'published';

  select count(*) into v_offer_total
  from public.booking_worker_offers o
  where o.worker_id = v_worker_id
    and o.status in ('accepted','declined','expired');

  select count(*) into v_offer_accepted
  from public.booking_worker_offers o
  where o.worker_id = v_worker_id and o.status = 'accepted';

  select count(*) into v_offer_declined
  from public.booking_worker_offers o
  where o.worker_id = v_worker_id and o.status = 'declined';

  select count(*) into v_offer_expired
  from public.booking_worker_offers o
  where o.worker_id = v_worker_id and o.status = 'expired';

  if v_offer_total > 0 then
    v_acceptance_rate := round(
      (v_offer_accepted::numeric / v_offer_total::numeric) * 100,
      2
    );
  end if;

  return jsonb_build_object(
    'completed_jobs', v_completed_jobs,
    'completed_occurrences', v_completed_occurrences,
    'total_net_earnings', round(v_total_earnings,2),
    'average_rating', round(v_average_rating,2),
    'review_count', v_total_reviews,
    'offer_decided_count', v_offer_total,
    'accepted_offer_count', v_offer_accepted,
    'declined_offer_count', v_offer_declined,
    'expired_offer_count', v_offer_expired,
    'acceptance_rate_percent', v_acceptance_rate
  );
end;
$function$;

revoke all on function public.worker_get_performance_summary() from public;
grant execute on function public.worker_get_performance_summary() to authenticated;

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
  v_account public.worker_payout_accounts%rowtype;
  v_remaining numeric := round(coalesce(p_amount,0),2);
  v_earning record;
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  if p_worker_id is null
     or p_payout_account_id is null
     or v_remaining <= 0 then
    raise exception 'Valid worker, payout account and amount are required';
  end if;

  if btrim(coalesce(p_idempotency_key,'')) = '' then
    raise exception 'Payout idempotency key is required';
  end if;

  select * into v_account
  from public.worker_payout_accounts
  where id = p_payout_account_id
    and worker_id = p_worker_id
    and status = 'verified'
  for update;

  if not found then
    raise exception 'Verified worker payout account not found';
  end if;

  if exists (
    select 1 from public.worker_payouts
    where idempotency_key = btrim(p_idempotency_key)
  ) then
    select * into v_payout
    from public.worker_payouts
    where idempotency_key = btrim(p_idempotency_key)
    limit 1;
    return v_payout;
  end if;

  for v_earning in
    select e.id, e.net_amount
    from public.worker_earnings e
    where e.worker_id = p_worker_id
      and e.net_amount > 0
    order by e.created_at, e.id
    for update
  loop
    exit when v_remaining <= 0;
    if not exists (
      select 1
      from public.worker_payout_items i
      join public.worker_payouts p on p.id=i.payout_id
      where i.earning_id=v_earning.id
        and p.status in ('queued','pending','processing','processed')
    ) then
      v_remaining := round(v_remaining-v_earning.net_amount,2);
    end if;
  end loop;

  if v_remaining > 0 then
    raise exception 'Requested payout exceeds the worker available balance';
  end if;

  insert into public.worker_payouts(
    worker_id,payout_account_id,provider,idempotency_key,
    amount,currency,status,mode
  )
  values(
    p_worker_id,p_payout_account_id,'razorpayx',
    btrim(p_idempotency_key),round(p_amount,2),'INR','queued',
    nullif(btrim(coalesce(p_mode,'')),'')
  )
  returning * into v_payout;

  v_remaining := round(p_amount,2);

  for v_earning in
    select e.id, e.net_amount
    from public.worker_earnings e
    where e.worker_id=p_worker_id and e.net_amount>0
    order by e.created_at, e.id
    for update
  loop
    exit when v_remaining<=0;

    if exists (
      select 1
      from public.worker_payout_items i
      join public.worker_payouts p on p.id=i.payout_id
      where i.earning_id=v_earning.id
        and p.status in ('queued','pending','processing','processed')
    ) then
      continue;
    end if;

    if v_earning.net_amount <= v_remaining then
      insert into public.worker_payout_items(payout_id,earning_id,amount)
      values(v_payout.id,v_earning.id,v_earning.net_amount);

      v_remaining := round(v_remaining-v_earning.net_amount,2);
    else
      raise exception
        'Payout allocation would require splitting an earning; use a later payout allocation implementation';
    end if;
  end loop;

  if v_remaining <> 0 then
    raise exception 'Payout allocation did not exactly match requested amount';
  end if;

  return v_payout;
end;
$function$;

revoke all on function public.admin_create_worker_payout(uuid, uuid, numeric, text, text) from public;
grant execute on function public.admin_create_worker_payout(uuid, uuid, numeric, text, text) to authenticated;
;
