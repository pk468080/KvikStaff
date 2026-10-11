-- Track occurrence-specific cancellation time independently of last_modified_at,
-- which is also used for rescheduling and other occurrence edits.

ALTER TABLE public.booking_schedule_occurrences
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Backfill using an occurrence-specific refund request where available.
-- For children cancelled together by a parent-series cancellation, use the
-- parent cancellation event timestamp. For still-active parent series, use
-- the occurrence's recorded modification timestamp, then updated_at.
UPDATE public.booking_schedule_occurrences o
SET cancelled_at = CASE
  WHEN b.status = 'cancelled'::public.booking_status THEN COALESCE(
    (
      SELECT min(pr.requested_at)
      FROM public.payment_refunds pr
      WHERE pr.occurrence_id = o.id
    ),
    (
      SELECT max(h.created_at)
      FROM public.booking_status_history h
      WHERE h.booking_id = b.id
        AND h.new_status = 'cancelled'::public.booking_status
    ),
    o.updated_at
  )
  ELSE COALESCE(
    (
      SELECT min(pr.requested_at)
      FROM public.payment_refunds pr
      WHERE pr.occurrence_id = o.id
    ),
    o.last_modified_at,
    o.updated_at
  )
END
FROM public.bookings b
WHERE b.id = o.booking_id
  AND o.status = 'cancelled'
  AND o.cancelled_at IS NULL;

CREATE OR REPLACE FUNCTION public.capture_booking_schedule_occurrence_cancelled_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'cancelled' THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    ELSE
      NEW.cancelled_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    ELSE
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, OLD.cancelled_at, now());
    END IF;
  ELSE
    NEW.cancelled_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS booking_schedule_occurrences_capture_cancelled_at
  ON public.booking_schedule_occurrences;

CREATE TRIGGER booking_schedule_occurrences_capture_cancelled_at
BEFORE INSERT OR UPDATE OF status
ON public.booking_schedule_occurrences
FOR EACH ROW
EXECUTE FUNCTION public.capture_booking_schedule_occurrence_cancelled_at();

CREATE OR REPLACE FUNCTION public.finalize_razorpay_payment(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_paid_at timestamp with time zone DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments%rowtype;
  v_booking public.bookings%rowtype;
  v_dispatch jsonb;
  v_cancelled_at timestamptz;
  v_quote jsonb;
  v_quote_refund numeric := 0;
  v_reserved_refund numeric := 0;
  v_refund_amount numeric := 0;
  v_refund public.payment_refunds%rowtype;
  v_occ record;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'Payment ID is required';
  END IF;

  IF p_provider_payment_id IS NULL
     OR btrim(p_provider_payment_id) = '' THEN
    RAISE EXCEPTION 'Provider payment ID is required';
  END IF;

  IF v_paid_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Invalid payment timestamp';
  END IF;

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

  IF v_payment.provider_payment_id IS NOT NULL
     AND v_payment.provider_payment_id <> p_provider_payment_id THEN
    RAISE EXCEPTION 'Provider payment ID does not match recorded payment';
  END IF;

  IF v_payment.status = 'paid'::public.payment_status THEN
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

    BEGIN
      v_dispatch := public.dispatch_booking_worker_offers_internal(v_booking.id);
    EXCEPTION
      WHEN OTHERS THEN
        v_dispatch := jsonb_build_object(
          'success', false,
          'assigned', false,
          'status', 'searching_worker',
          'error', sqlerrm
        );
    END;

    RETURN jsonb_build_object(
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
  END IF;

  IF v_payment.status NOT IN ('pending'::public.payment_status, 'failed'::public.payment_status) THEN
    RAISE EXCEPTION 'Payment is not eligible for success finalization';
  END IF;

  IF v_booking.status = 'cancelled'::public.booking_status THEN
    IF v_booking.scheduled_start IS NULL THEN
      RAISE EXCEPTION 'Cancelled booking has no scheduled start; payment finalization requires reconciliation';
    END IF;

    SELECT h.created_at
    INTO v_cancelled_at
    FROM public.booking_status_history h
    WHERE h.booking_id = v_booking.id
      AND h.new_status = 'cancelled'::public.booking_status
    ORDER BY h.created_at DESC, h.id DESC
    LIMIT 1;

    IF v_cancelled_at IS NULL THEN
      RAISE EXCEPTION 'Cancelled booking has no cancellation history timestamp; payment finalization requires reconciliation';
    END IF;

    UPDATE public.payments
    SET provider_payment_id = p_provider_payment_id,
        status = 'paid'::public.payment_status,
        paid_at = v_paid_at,
        updated_at = now()
    WHERE id = v_payment.id;

    IF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type THEN
      /*
       * A recurring payment covers multiple independently scheduled shifts.
       * Calculate each cancelled occurrence using its own amount, scheduled
       * start, and dedicated cancellation timestamp. The series timestamp is
       * only a fallback for legacy rows without occurrence-level metadata.
       */
      v_quote_refund := 0;

      FOR v_occ IN
        SELECT
          o.total_amount,
          o.scheduled_start,
          o.cancelled_at
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

    IF v_quote_refund > v_payment.amount THEN
      v_quote_refund := v_payment.amount;
    END IF;

    IF v_quote_refund > 0 THEN
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
            THEN 'Automatic refund: recurring-series payment captured after cancellation'
            ELSE 'Automatic refund: payment captured after cancellation'
          END,
          'pending',
          NULL,
          now()
        )
        RETURNING * INTO v_refund;
      END IF;
    END IF;

    RETURN jsonb_build_object(
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
  END IF;

  IF v_booking.status = 'expired'::public.booking_status THEN
    RAISE EXCEPTION 'Booking is expired and cannot be paid';
  END IF;

  IF (
    v_booking.fulfillment_type IN (
      'instant'::public.booking_fulfillment_type,
      'scheduled'::public.booking_fulfillment_type
    )
    AND v_booking.status IN (
      'pending_payment'::public.booking_status,
      'payment_failed'::public.booking_status
    )
    AND v_booking.scheduled_start IS NOT NULL
    AND v_booking.scheduled_start <= now()
  ) THEN
    UPDATE public.bookings
    SET status = 'expired'::public.booking_status,
        updated_at = now()
    WHERE id = v_booking.id
      AND status IN (
        'pending_payment'::public.booking_status,
        'payment_failed'::public.booking_status
      );

    INSERT INTO public.booking_status_history (
      booking_id, old_status, new_status, changed_by, created_at
    )
    VALUES (
      v_booking.id, v_booking.status, 'expired'::public.booking_status, NULL, now()
    );

    RAISE EXCEPTION 'Booking expired before payment finalization';
  END IF;

  UPDATE public.payments
  SET provider_payment_id = p_provider_payment_id,
      status = 'paid'::public.payment_status,
      paid_at = v_paid_at,
      updated_at = now()
  WHERE id = v_payment.id;

  IF v_booking.status IN (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status
  ) THEN
    UPDATE public.bookings
    SET status = 'paid'::public.booking_status,
        updated_at = now()
    WHERE id = v_booking.id;

    INSERT INTO public.booking_status_history (
      booking_id, old_status, new_status, changed_by, created_at
    )
    VALUES (
      v_booking.id, v_booking.status, 'paid'::public.booking_status, NULL, now()
    );
  END IF;

  BEGIN
    v_dispatch := public.dispatch_booking_worker_offers_internal(v_booking.id);
  EXCEPTION
    WHEN OTHERS THEN
      v_dispatch := jsonb_build_object(
        'success', false,
        'assigned', false,
        'status', 'searching_worker',
        'error', sqlerrm
      );

      UPDATE public.bookings
      SET status = 'searching_worker'::public.booking_status,
          updated_at = now()
      WHERE id = v_booking.id
        AND status = 'paid'::public.booking_status;

      INSERT INTO public.booking_status_history (
        booking_id, old_status, new_status, changed_by, created_at
      )
      VALUES (
        v_booking.id,
        'paid'::public.booking_status,
        'searching_worker'::public.booking_status,
        NULL,
        now()
      );
  END;

  RETURN jsonb_build_object(
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
END;
$function$;
