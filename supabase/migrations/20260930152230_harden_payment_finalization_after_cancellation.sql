create or replace function public.finalize_razorpay_payment(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_dispatch jsonb;
  v_cancelled_at timestamptz;
  v_quote jsonb;
  v_quote_refund numeric := 0;
  v_reserved_refund numeric := 0;
  v_refund_amount numeric := 0;
  v_refund public.payment_refunds%rowtype;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_payment_id is null then
    raise exception 'Payment ID is required';
  end if;

  if p_provider_payment_id is null
     or btrim(p_provider_payment_id) = '' then
    raise exception 'Provider payment ID is required';
  end if;

  if v_paid_at > now() + interval '5 minutes' then
    raise exception 'Invalid payment timestamp';
  end if;

  select *
  into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = v_payment.booking_id
  for update;

  if not found then
    raise exception 'Booking not found for payment';
  end if;

  if v_payment.provider_payment_id is not null
     and v_payment.provider_payment_id <> p_provider_payment_id then
    raise exception 'Provider payment ID does not match recorded payment';
  end if;

  if v_payment.status = 'paid'::public.payment_status then
    if v_booking.status = 'cancelled'::public.booking_status then
      return jsonb_build_object(
        'success', true,
        'already_paid', true,
        'booking_id', v_booking.id,
        'payment_id', v_payment.id,
        'booking_status', 'cancelled',
        'assigned', false,
        'captured_after_cancellation', false
      );
    end if;

    begin
      v_dispatch := public.dispatch_booking_worker_offers_internal(v_booking.id);
    exception
      when others then
        v_dispatch := jsonb_build_object(
          'success', false,
          'assigned', false,
          'status', 'searching_worker',
          'error', sqlerrm
        );
    end;

    return jsonb_build_object(
      'success', true,
      'already_paid', true,
      'payment_id', v_payment.id,
      'booking_id', v_booking.id,
      'booking_status', coalesce(v_dispatch->>'status', v_booking.status::text),
      'assigned', coalesce((v_dispatch->>'assigned')::boolean, false),
      'worker_id', v_dispatch->'worker_id',
      'created_offers', coalesce(v_dispatch->'created_offers', '0'::jsonb),
      'pending_offers', coalesce(v_dispatch->'pending_offers', '0'::jsonb)
    );
  end if;

  if v_payment.status not in ('pending'::public.payment_status, 'failed'::public.payment_status) then
    raise exception 'Payment is not eligible for success finalization';
  end if;

  if v_booking.status = 'cancelled'::public.booking_status then
    if v_booking.scheduled_start is null then
      raise exception 'Cancelled booking has no scheduled start; payment finalization requires reconciliation';
    end if;

    select h.created_at
    into v_cancelled_at
    from public.booking_status_history h
    where h.booking_id = v_booking.id
      and h.new_status = 'cancelled'::public.booking_status
    order by h.created_at desc, h.id desc
    limit 1;

    if v_cancelled_at is null then
      raise exception 'Cancelled booking has no cancellation history timestamp; payment finalization requires reconciliation';
    end if;

    update public.payments
    set provider_payment_id = p_provider_payment_id,
        status = 'paid'::public.payment_status,
        paid_at = v_paid_at,
        updated_at = now()
    where id = v_payment.id;

    v_quote := public.calculate_cancellation_refund(
      coalesce(v_payment.amount, 0),
      v_booking.scheduled_start,
      v_cancelled_at
    );

    v_quote_refund := greatest(coalesce((v_quote->>'refund_amount')::numeric, 0), 0);

    if v_quote_refund > v_payment.amount then
      v_quote_refund := v_payment.amount;
    end if;

    if v_quote_refund > 0 then
      select coalesce(sum(pr.amount), 0)
      into v_reserved_refund
      from public.payment_refunds pr
      where pr.payment_id = v_payment.id
        and pr.status in ('pending', 'processing', 'succeeded');

      v_refund_amount := greatest(v_quote_refund - v_reserved_refund, 0);

      if v_refund_amount > 0 then
        insert into public.payment_refunds(
          payment_id, booking_id, amount, currency, reason,
          status, requested_by, requested_at
        )
        values(
          v_payment.id,
          v_booking.id,
          round(v_refund_amount, 2),
          v_payment.currency,
          'Automatic refund: payment captured after cancellation',
          'pending',
          null,
          now()
        )
        returning * into v_refund;
      end if;
    end if;

    return jsonb_build_object(
      'success', true,
      'already_paid', false,
      'payment_id', v_payment.id,
      'booking_id', v_booking.id,
      'booking_status', 'cancelled',
      'assigned', false,
      'captured_after_cancellation', true,
      'refund_amount', round(v_refund_amount, 2),
      'refund_id', v_refund.id,
      'refund_status', v_refund.status
    );
  end if;

  if v_booking.status = 'expired'::public.booking_status then
    raise exception 'Booking is expired and cannot be paid';
  end if;

  if (
    v_booking.fulfillment_type in (
      'instant'::public.booking_fulfillment_type,
      'scheduled'::public.booking_fulfillment_type
    )
    and v_booking.status in (
      'pending_payment'::public.booking_status,
      'payment_failed'::public.booking_status
    )
    and v_booking.scheduled_start is not null
    and v_booking.scheduled_start <= now()
  ) then
    update public.bookings
    set status = 'expired'::public.booking_status,
        updated_at = now()
    where id = v_booking.id
      and status in (
        'pending_payment'::public.booking_status,
        'payment_failed'::public.booking_status
      );

    insert into public.booking_status_history (
      booking_id, old_status, new_status, changed_by, created_at
    )
    values (
      v_booking.id, v_booking.status, 'expired'::public.booking_status, null, now()
    );

    raise exception 'Booking expired before payment finalization';
  end if;

  update public.payments
  set provider_payment_id = p_provider_payment_id,
      status = 'paid'::public.payment_status,
      paid_at = v_paid_at,
      updated_at = now()
  where id = v_payment.id;

  if v_booking.status in (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status
  ) then
    update public.bookings
    set status = 'paid'::public.booking_status,
        updated_at = now()
    where id = v_booking.id;

    insert into public.booking_status_history (
      booking_id, old_status, new_status, changed_by, created_at
    )
    values (
      v_booking.id, v_booking.status, 'paid'::public.booking_status, null, now()
    );
  end if;

  begin
    v_dispatch := public.dispatch_booking_worker_offers_internal(v_booking.id);
  exception
    when others then
      v_dispatch := jsonb_build_object(
        'success', false,
        'assigned', false,
        'status', 'searching_worker',
        'error', sqlerrm
      );

      update public.bookings
      set status = 'searching_worker'::public.booking_status,
          updated_at = now()
      where id = v_booking.id
        and status = 'paid'::public.booking_status;

      insert into public.booking_status_history (
        booking_id, old_status, new_status, changed_by, created_at
      )
      values (
        v_booking.id,
        'paid'::public.booking_status,
        'searching_worker'::public.booking_status,
        null,
        now()
      );
  end;

  return jsonb_build_object(
    'success', true,
    'already_paid', false,
    'payment_id', v_payment.id,
    'booking_id', v_booking.id,
    'booking_status', coalesce(v_dispatch->>'status', 'searching_worker'),
    'assigned', coalesce((v_dispatch->>'assigned')::boolean, false),
    'worker_id', v_dispatch->'worker_id',
    'created_offers', coalesce(v_dispatch->'created_offers', '0'::jsonb),
    'pending_offers', coalesce(v_dispatch->'pending_offers', '0'::jsonb)
  );
end;
$function$;;
