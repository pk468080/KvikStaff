create or replace function public.finalize_payment_refund(
  p_refund_id uuid,
  p_status text,
  p_provider_refund_id text default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_refund public.payment_refunds%rowtype;
  v_payment public.payments%rowtype;
  v_succeeded numeric;
  v_existing_status text;
  v_effective_provider_refund_id text;
begin
  if not (
    (select auth.jwt() ->> 'role') = 'service_role'
    or (auth.uid() is not null and public.is_admin())
  ) then
    raise exception 'Admin access required';
  end if;

  if p_status not in ('processing','succeeded','failed','cancelled') then
    raise exception 'Invalid refund status';
  end if;

  select *
  into v_refund
  from public.payment_refunds
  where id = p_refund_id
  for update;

  if not found then
    raise exception 'Refund not found';
  end if;

  v_existing_status := v_refund.status::text;
  v_effective_provider_refund_id :=
    coalesce(p_provider_refund_id, v_refund.provider_refund_id);

  if v_existing_status = p_status then
    if p_status = 'succeeded'
       and v_effective_provider_refund_id is null then
      raise exception 'A succeeded refund must have a provider refund ID';
    end if;

    update public.payment_refunds
    set
      provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
      failure_reason = coalesce(p_failure_reason, failure_reason),
      processed_at = case
        when p_status in ('succeeded','failed','cancelled')
        then coalesce(processed_at, now())
        else processed_at
      end,
      updated_at = now()
    where id = p_refund_id;

    return jsonb_build_object(
      'success', true,
      'refund_id', p_refund_id,
      'refund_request_id', v_refund.refund_request_id,
      'status', p_status,
      'idempotent', true,
      'payment_status', (
        select status::text
        from public.payments
        where id = v_refund.payment_id
      )
    );
  end if;

  if v_existing_status in ('succeeded','failed','cancelled') then
    raise exception
      'Refund cannot transition from terminal status % to %',
      v_existing_status,
      p_status;
  end if;

  if v_existing_status = 'pending' then
    if p_status not in ('processing','failed','cancelled','succeeded') then
      raise exception 'Invalid refund transition';
    end if;
  elsif v_existing_status = 'processing' then
    if p_status not in ('succeeded','failed','cancelled') then
      raise exception 'Invalid refund transition';
    end if;
  else
    raise exception 'Refund has unsupported current status %', v_existing_status;
  end if;

  if p_status = 'succeeded'
     and v_effective_provider_refund_id is null then
    raise exception 'A succeeded refund must have a provider refund ID';
  end if;

  select *
  into v_payment
  from public.payments
  where id = v_refund.payment_id
  for update;

  select coalesce(sum(amount), 0)
  into v_succeeded
  from public.payment_refunds
  where payment_id = v_refund.payment_id
    and status = 'succeeded'
    and id <> v_refund.id;

  if p_status = 'succeeded'
     and v_succeeded + v_refund.amount > v_payment.amount then
    raise exception 'Succeeded refunds would exceed the payment amount';
  end if;

  update public.payment_refunds
  set
    status = p_status,
    provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
    failure_reason = coalesce(p_failure_reason, failure_reason),
    processed_at = case
      when p_status in ('succeeded','failed','cancelled') then now()
      else processed_at
    end,
    updated_at = now()
  where id = p_refund_id;

  if v_refund.refund_request_id is not null then
    update public.refund_requests
    set
      status = p_status,
      provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
      processed_at = case
        when p_status in ('succeeded','failed','cancelled')
        then coalesce(processed_at, now())
        else processed_at
      end,
      updated_at = now()
    where id = v_refund.refund_request_id;
  end if;

  v_succeeded :=
    v_succeeded +
    case
      when p_status = 'succeeded' then v_refund.amount
      else 0
    end;

  if v_succeeded >= v_payment.amount then
    update public.payments
    set
      status = 'refunded'::public.payment_status,
      updated_at = now()
    where id = v_payment.id;
  elsif v_succeeded > 0 then
    update public.payments
    set
      status = 'partially_refunded'::public.payment_status,
      updated_at = now()
    where id = v_payment.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'refund_id', p_refund_id,
    'refund_request_id', v_refund.refund_request_id,
    'status', p_status,
    'payment_status', (
      select status::text
      from public.payments
      where id = v_payment.id
    ),
    'succeeded_refund_total', v_succeeded
  );
end;
$function$;
