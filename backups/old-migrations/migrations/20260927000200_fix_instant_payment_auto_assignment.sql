-- Fix Instant payment finalization so eligible workers are assigned immediately.
-- Instant bookings do not use the worker-offer workflow.

create or replace function public.finalize_razorpay_payment(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_paid_at timestamp with time zone default now()
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_assignment jsonb;
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
    begin
      v_assignment :=
        public.assign_paid_booking_worker(v_booking.id);
    exception
      when others then
        v_assignment := jsonb_build_object(
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
      'booking_status',
        coalesce(
          v_assignment->>'status',
          v_booking.status::text
        ),
      'assigned',
        coalesce(
          (v_assignment->>'assigned')::boolean,
          false
        ),
      'worker_id',
        v_assignment->'worker_id'
    );
  end if;

  if v_payment.status not in (
    'pending'::public.payment_status,
    'failed'::public.payment_status
  ) then
    raise exception 'Payment is not eligible for success finalization';
  end if;

  update public.payments
  set
    provider_payment_id = p_provider_payment_id,
    status = 'paid'::public.payment_status,
    paid_at = v_paid_at,
    updated_at = now()
  where id = v_payment.id;

  if v_booking.status in (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status
  ) then
    update public.bookings
    set
      status = 'paid'::public.booking_status,
      updated_at = now()
    where id = v_booking.id;

    insert into public.booking_status_history (
      booking_id,
      old_status,
      new_status,
      changed_by,
      created_at
    )
    values (
      v_booking.id,
      v_booking.status,
      'paid'::public.booking_status,
      null,
      now()
    );
  end if;

  begin
    v_assignment :=
      public.assign_paid_booking_worker(v_booking.id);
  exception
    when others then
      v_assignment := jsonb_build_object(
        'success', false,
        'assigned', false,
        'status', 'searching_worker',
        'error', sqlerrm
      );

      update public.bookings
      set
        status = 'searching_worker'::public.booking_status,
        updated_at = now()
      where id = v_booking.id
        and status = 'paid'::public.booking_status;

      insert into public.booking_status_history (
        booking_id,
        old_status,
        new_status,
        changed_by,
        created_at
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
    'booking_status',
      coalesce(
        v_assignment->>'status',
        'searching_worker'
      ),
    'assigned',
      coalesce(
        (v_assignment->>'assigned')::boolean,
        false
      ),
    'worker_id',
      v_assignment->'worker_id'
  );
end;
$function$;
