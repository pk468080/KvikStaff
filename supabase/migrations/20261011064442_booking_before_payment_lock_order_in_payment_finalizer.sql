-- Standardize payment-finalization lock order to booking -> payment.
-- This prevents a payment callback and a cancellation transaction from
-- deadlocking while each waits for the other row.
DO $migration$
DECLARE
  v_def text;
  v_old_block text := $old$
  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = v_payment.booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found for payment';
  END IF;
$old$;
  v_new_block text := $new$
  -- Global booking lifecycle lock order: booking -> payment -> refund rows.
  -- Read the booking ID without locking payment, then acquire locks in order.
  SELECT p.booking_id
  INTO v_booking_id
  FROM public.payments p
  WHERE p.id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_booking_id IS NULL THEN
    RAISE EXCEPTION 'Payment has no associated booking';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = v_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found for payment';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found';
  END IF;

  IF v_payment.booking_id IS DISTINCT FROM v_booking.id THEN
    RAISE EXCEPTION 'Payment booking association changed during finalization';
  END IF;
$new$;
BEGIN
  v_def := pg_get_functiondef(
    'public.finalize_razorpay_payment(uuid,text,timestamptz)'::regprocedure
  );

  IF position(v_old_block in v_def) = 0 THEN
    RAISE EXCEPTION 'Expected original lock block was not found; no changes applied';
  END IF;

  IF position('v_booking_id uuid;' in v_def) = 0 THEN
    v_def := replace(
      v_def,
      '  v_booking public.bookings%rowtype;',
      '  v_booking public.bookings%rowtype;' || chr(10) || '  v_booking_id uuid;'
    );
  END IF;

  v_def := replace(v_def, v_old_block, v_new_block);

  IF position(v_old_block in v_def) > 0
     OR position('v_booking_id uuid;' in v_def) = 0 THEN
    RAISE EXCEPTION 'Failed to produce expected lock-order-safe function definition';
  END IF;

  EXECUTE v_def;
END;
$migration$;
