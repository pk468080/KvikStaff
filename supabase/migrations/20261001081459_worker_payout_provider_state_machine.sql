
create or replace function public.apply_worker_payout_provider_update(
  p_payout_id uuid,
  p_provider_payout_id text,
  p_provider_status text,
  p_amount_paise bigint,
  p_currency text,
  p_fund_account_id text,
  p_utr text default null,
  p_fees_paise bigint default null,
  p_tax_paise bigint default null,
  p_status_details jsonb default null,
  p_failure_reason text default null,
  p_created_at timestamptz default null
)
returns public.worker_payouts
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_payout public.worker_payouts%rowtype;
  v_account public.worker_payout_accounts%rowtype;
  v_status text := lower(btrim(coalesce(p_provider_status, '')));
  v_local_rank integer;
  v_provider_rank integer;
begin
  if p_payout_id is null
     or nullif(btrim(coalesce(p_provider_payout_id, '')), '') is null
     or v_status not in (
       'queued','pending','rejected','processing',
       'processed','cancelled','reversed','failed'
     ) then
    raise exception 'Invalid payout provider update';
  end if;

  if coalesce(p_amount_paise, 0) <= 0
     or p_currency <> 'INR' then
    raise exception 'Invalid provider payout amount or currency';
  end if;

  select *
  into v_payout
  from public.worker_payouts
  where id = p_payout_id
  for update;

  if not found then
    raise exception 'Worker payout not found';
  end if;

  select *
  into v_account
  from public.worker_payout_accounts
  where id = v_payout.payout_account_id
    and worker_id = v_payout.worker_id;

  if not found then
    raise exception 'Worker payout account not found';
  end if;

  if v_account.provider_fund_account_id is not null
     and v_account.provider_fund_account_id <> p_fund_account_id then
    raise exception 'Provider fund account does not match the local payout account';
  end if;

  if round(v_payout.amount * 100, 0)::bigint <> p_amount_paise
     or v_payout.currency <> p_currency then
    raise exception 'Provider payout amount or currency does not match the local payout';
  end if;

  if v_payout.provider_payout_id is not null
     and v_payout.provider_payout_id <> btrim(p_provider_payout_id) then
    raise exception 'Payout is already linked to a different provider payout';
  end if;

  v_local_rank := case v_payout.status
    when 'pending' then 20
    when 'queued' then 30
    when 'processing' then 50
    when 'rejected' then 100
    when 'failed' then 100
    when 'cancelled' then 100
    when 'processed' then 100
    when 'reversed' then 100
    else 0
  end;

  v_provider_rank := case v_status
    when 'pending' then 20
    when 'queued' then 30
    when 'processing' then 50
    when 'rejected' then 100
    when 'failed' then 100
    when 'cancelled' then 100
    when 'processed' then 100
    when 'reversed' then 100
    else 0
  end;

  if v_local_rank = 100 then
    select *
    into v_payout
    from public.worker_payouts
    where id = v_payout.id;

    return v_payout;
  end if;

  if v_provider_rank < v_local_rank then
    return v_payout;
  end if;

  update public.worker_payouts
  set
    provider_payout_id = btrim(p_provider_payout_id),
    provider_status = v_status,
    status = v_status,
    utr = nullif(btrim(coalesce(p_utr, '')), ''),
    provider_fee_amount = case
      when p_fees_paise is null then provider_fee_amount
      else round(p_fees_paise / 100.0, 2)
    end,
    provider_tax_amount = case
      when p_tax_paise is null then provider_tax_amount
      else round(p_tax_paise / 100.0, 2)
    end,
    provider_status_details = p_status_details,
    failure_reason = nullif(btrim(coalesce(p_failure_reason, '')), ''),
    provider_created_at = coalesce(p_created_at, provider_created_at),
    processed_at = case
      when v_status = 'processed' then coalesce(processed_at, now())
      when v_status in ('reversed','failed','cancelled','rejected') then processed_at
      else null
    end,
    last_reconciled_at = now(),
    reconciliation_error = null,
    reconciliation_attempts = reconciliation_attempts + 1,
    updated_at = now()
  where id = v_payout.id
  returning * into v_payout;

  return v_payout;
end;
$function$;

revoke all on function public.apply_worker_payout_provider_update(
  uuid,text,text,bigint,text,text,text,bigint,bigint,jsonb,text,timestamptz
) from public;

grant execute on function public.apply_worker_payout_provider_update(
  uuid,text,text,bigint,text,text,text,bigint,bigint,jsonb,text,timestamptz
) to service_role;
;
