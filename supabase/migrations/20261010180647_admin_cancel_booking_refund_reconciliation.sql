CREATE OR REPLACE FUNCTION public.admin_cancel_booking(
  p_booking_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_refund public.payment_refunds%rowtype;
  v_occ record;
  v_before jsonb;
  v_after jsonb;
  v_old_status public.booking_status;
  v_transition jsonb;
  v_quote jsonb;
  v_quotes jsonb := '[]'::jsonb;
  v_quote_amount numeric := 0;
  v_total_refund numeric := 0;
  v_reserved_refund numeric := 0;
  v_cancelled_occurrences integer := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_booking_id IS NULL THEN
    RAISE EXCEPTION 'Booking ID is required';
  END IF;

  SELECT b.*
  INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  v_before := to_jsonb(v_booking);
  v_old_status := v_booking.status;

  IF v_old_status = 'cancelled'::public.booking_status THEN
    RAISE EXCEPTION 'Booking is already cancelled';
  END IF;

  IF v_old_status IN (
    'completed'::public.booking_status,
    'expired'::public.booking_status
  ) THEN
    RAISE EXCEPTION 'Completed or expired bookings cannot be cancelled';
  END IF;

  -- Build the refund quote before changing any booking state.
  -- For recurring series, only non-completed, non-cancelled occurrences
  -- contribute to the refund total. Lock occurrences after the parent booking.
  IF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type THEN
    FOR v_occ IN
      SELECT id, occurrence_index, total_amount, scheduled_start, status
      FROM public.booking_schedule_occurrences
      WHERE booking_id = v_booking.id
        AND status NOT IN ('completed', 'cancelled')
      ORDER BY occurrence_index
      FOR UPDATE
    LOOP
      v_quote := public.calculate_cancellation_refund(
        COALESCE(v_occ.total_amount, 0),
        v_occ.scheduled_start,
        now()
      );

      v_quote_amount := GREATEST(
        COALESCE((v_quote->>'refund_amount')::numeric, 0),
        0
      );
      v_total_refund := v_total_refund + v_quote_amount;
      v_cancelled_occurrences := v_cancelled_occurrences + 1;
      v_quotes := v_quotes || jsonb_build_array(
        jsonb_build_object(
          'occurrence_id', v_occ.id,
          'occurrence_index', v_occ.occurrence_index,
          'quote', v_quote
        )
      );
    END LOOP;
  ELSE
    v_quote := public.calculate_cancellation_refund(
      COALESCE(v_booking.total_amount, 0),
      v_booking.scheduled_start,
      now()
    );
    v_total_refund := GREATEST(
      COALESCE((v_quote->>'refund_amount')::numeric, 0),
      0
    );
  END IF;

  v_total_refund := round(v_total_refund, 2);

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE booking_id = v_booking.id
    AND status IN (
      'paid'::public.payment_status,
      'partially_refunded'::public.payment_status
    )
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_payment.id IS NOT NULL AND v_total_refund > 0 THEN
    SELECT COALESCE(SUM(pr.amount), 0)
    INTO v_reserved_refund
    FROM public.payment_refunds pr
    WHERE pr.payment_id = v_payment.id
      AND pr.status IN ('pending', 'processing', 'succeeded');

    IF v_reserved_refund + v_total_refund > v_payment.amount THEN
      RAISE EXCEPTION
        'Refund would exceed the remaining refundable amount; reconcile existing refunds before cancelling';
    END IF;
  END IF;

  v_transition := public.transition_booking_state(
    p_booking_id,
    'cancelled'::public.booking_status,
    NULL,
    false,
    true
  );

  IF v_payment.id IS NOT NULL AND v_total_refund > 0 THEN
    INSERT INTO public.payment_refunds (
      payment_id,
      booking_id,
      amount,
      currency,
      reason,
      status,
      requested_by,
      requested_at
    )
    VALUES (
      v_payment.id,
      v_booking.id,
      v_total_refund,
      v_payment.currency,
      COALESCE(NULLIF(TRIM(p_reason), ''), 'Admin booking cancellation'),
      'pending',
      auth.uid(),
      now()
    )
    RETURNING * INTO v_refund;
  END IF;

  SELECT to_jsonb(b)
  INTO v_after
  FROM public.bookings b
  WHERE b.id = p_booking_id;

  PERFORM public.write_admin_audit(
    'admin_cancel_booking',
    'booking',
    p_booking_id,
    v_before,
    v_after,
    jsonb_build_object(
      'reason', p_reason,
      'old_status', v_old_status::text,
      'new_status', 'cancelled',
      'payment_id', v_payment.id,
      'refund_id', v_refund.id,
      'refund_amount', COALESCE(v_refund.amount, 0),
      'refund_status', CASE
        WHEN v_refund.id IS NULL THEN NULL
        ELSE v_refund.status
      END,
      'refund_quote_amount', v_total_refund,
      'cancelled_occurrences', v_cancelled_occurrences
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'old_status', v_old_status::text,
    'status', 'cancelled',
    'worker_id', NULL,
    'transitioned', COALESCE((v_transition->>'transitioned')::boolean, true),
    'refund_amount', COALESCE(v_refund.amount, 0),
    'refund_id', v_refund.id,
    'refund_status', CASE
      WHEN v_refund.id IS NULL THEN NULL
      ELSE v_refund.status
    END,
    'refund_quote_amount', v_total_refund,
    'cancelled_occurrences', v_cancelled_occurrences,
    'refund_policy', CASE
      WHEN v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type
      THEN v_quotes
      ELSE v_quote
    END
  );
END;
$function$;
