-- When an idempotent payment callback sees an already-paid but cancelled
-- booking, reconcile the policy quote against existing reserved refunds.
-- The remaining amount alone is queued, preventing duplicate refunds.
DO $migration$
DECLARE
  v_def text;
  v_old_block text := $old$
    IF v_booking.status = 'cancelled'::public.booking_status THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_paid', true,
        'booking_id', v_booking.id,
        'payment_id', v_payment.id,
        'booking_status', 'cancelled',
        'assigned', false,
        'captured_after_cancellation', false
      );
    END IF;
$old$;
  v_new_block text := $new$
    IF v_booking.status = 'cancelled'::public.booking_status THEN
      SELECT h.created_at
      INTO v_cancelled_at
      FROM public.booking_status_history h
      WHERE h.booking_id = v_booking.id
        AND h.new_status = 'cancelled'::public.booking_status
      ORDER BY h.created_at DESC, h.id DESC
      LIMIT 1;

      IF v_cancelled_at IS NULL THEN
        RAISE EXCEPTION
          'Cancelled paid booking has no cancellation timestamp; refund reconciliation required';
      END IF;

      v_quote_refund := 0;

      IF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type THEN
        FOR v_occ IN
          SELECT o.total_amount, o.scheduled_start, o.cancelled_at
          FROM public.booking_schedule_occurrences o
          WHERE o.booking_id = v_booking.id
            AND o.status = 'cancelled'
          ORDER BY o.occurrence_index
        LOOP
          v_quote := public.calculate_cancellation_refund(
            coalesce(v_occ.total_amount, 0),
            v_occ.scheduled_start,
            coalesce(v_occ.cancelled_at, v_cancelled_at)
          );

          v_quote_refund := v_quote_refund
            + greatest(coalesce((v_quote->>'refund_amount')::numeric, 0), 0);
        END LOOP;
      ELSE
        v_quote := public.calculate_cancellation_refund(
          coalesce(v_payment.amount, 0),
          v_booking.scheduled_start,
          v_cancelled_at
        );

        v_quote_refund := greatest(coalesce((v_quote->>'refund_amount')::numeric, 0), 0);
      END IF;

      v_quote_refund := least(greatest(v_quote_refund, 0), coalesce(v_payment.amount, 0));

      SELECT coalesce(sum(pr.amount), 0)
      INTO v_reserved_refund
      FROM public.payment_refunds pr
      WHERE pr.payment_id = v_payment.id
        AND pr.status IN ('pending', 'processing', 'succeeded');

      v_refund_amount := greatest(v_quote_refund - v_reserved_refund, 0);

      IF v_refund_amount > 0 THEN
        INSERT INTO public.payment_refunds(
          payment_id, booking_id, amount, currency, reason,
          status, requested_by, requested_at
        )
        VALUES(
          v_payment.id,
          v_booking.id,
          round(v_refund_amount, 2),
          v_payment.currency,
          CASE
            WHEN v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type
            THEN 'Automatic refund: reconciled already-paid cancelled recurring booking'
            ELSE 'Automatic refund: reconciled already-paid cancelled booking'
          END,
          'pending',
          NULL,
          now()
        )
        RETURNING * INTO v_refund;
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'already_paid', true,
        'booking_id', v_booking.id,
        'payment_id', v_payment.id,
        'booking_status', 'cancelled',
        'assigned', false,
        'captured_after_cancellation', true,
        'refund_reconciliation_checked', true,
        'refund_amount', round(coalesce(v_refund_amount, 0), 2),
        'refund_id', v_refund.id,
        'refund_status', v_refund.status
      );
    END IF;
$new$;
BEGIN
  v_def := pg_get_functiondef(
    'public.finalize_razorpay_payment(uuid,text,timestamptz)'::regprocedure
  );

  IF position(v_old_block in v_def) = 0 THEN
    RAISE EXCEPTION 'Expected already-paid cancelled-booking branch was not found; no changes applied';
  END IF;

  v_def := replace(v_def, v_old_block, v_new_block);

  IF position(v_old_block in v_def) > 0
     OR position('refund_reconciliation_checked' in v_def) = 0 THEN
    RAISE EXCEPTION 'Failed to produce expected refund-reconciliation branch';
  END IF;

  EXECUTE v_def;
END;
$migration$;
