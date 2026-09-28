create or replace function public.request_booking_refund(
  p_booking_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_request public.refund_requests%rowtype;
  v_payment_refund public.payment_refunds%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.status in (
    'completed'::public.booking_status,
    'expired'::public.booking_status
  ) then
    raise exception 'Completed or expired bookings require a dedicated adjustment workflow; full refund request is not permitted';
  end if;

  select *
  into v_payment
  from public.payments
  where booking_id = p_booking_id
    and status = 'paid'::public.payment_status
  order by updated_at desc
  limit 1
  for update;

  if not found then
    raise exception 'No paid payment found for booking';
  end if;

  if v_payment.amount <= 0 then
    raise exception 'Refund amount is invalid';
  end if;

  select *
  into v_request
  from public.refund_requests
  where booking_id = p_booking_id
  for update;

  if found then
    select *
    into v_payment_refund
    from public.payment_refunds
    where refund_request_id = v_request.id
    limit 1
    for update;

    if not found then
      insert into public.payment_refunds (
        payment_id,
        booking_id,
        amount,
        currency,
        reason,
        status,
        requested_by,
        refund_request_id
      )
      values (
        v_request.payment_id,
        v_request.booking_id,
        v_request.amount,
        v_request.currency,
        v_request.reason,
        'pending',
        auth.uid(),
        v_request.id
      )
      returning * into v_payment_refund;
    end if;

    return jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'refund_id', v_request.id,
      'payment_refund_id', v_payment_refund.id,
      'payment_id', v_request.payment_id,
      'amount', v_request.amount,
      'currency', v_request.currency,
      'status', v_request.status,
      'payment_refund_status', v_payment_refund.status,
      'idempotent', true
    );
  end if;

  insert into public.refund_requests (
    booking_id,
    payment_id,
    amount,
    currency,
    reason
  )
  values (
    p_booking_id,
    v_payment.id,
    v_payment.amount,
    v_payment.currency,
    nullif(trim(p_reason), '')
  )
  returning * into v_request;

  insert into public.payment_refunds (
    payment_id,
    booking_id,
    amount,
    currency,
    reason,
    status,
    requested_by,
    refund_request_id
  )
  values (
    v_payment.id,
    p_booking_id,
    v_payment.amount,
    v_payment.currency,
    nullif(trim(p_reason), ''),
    'pending',
    auth.uid(),
    v_request.id
  )
  returning * into v_payment_refund;

  return jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'refund_id', v_request.id,
    'payment_refund_id', v_payment_refund.id,
    'payment_id', v_request.payment_id,
    'amount', v_request.amount,
    'currency', v_request.currency,
    'status', v_request.status,
    'payment_refund_status', v_payment_refund.status,
    'idempotent', false
  );
end;
$function$;
