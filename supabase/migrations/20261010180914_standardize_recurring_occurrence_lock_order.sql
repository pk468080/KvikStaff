CREATE OR REPLACE FUNCTION public.admin_cancel_booking_occurrence(
  p_occurrence_id uuid,
  p_reason text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_occurrence_booking_id uuid;
  v_occ public.booking_schedule_occurrences%rowtype;
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_quote jsonb;
  v_refund public.payment_refunds%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_remaining integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_occurrence_id IS NULL THEN
    RAISE EXCEPTION 'Occurrence ID is required';
  END IF;

  -- Discover the parent without locking the occurrence. Global lock order:
  -- parent booking first, then occurrence, then payment/refund rows.
  SELECT booking_id
  INTO v_occurrence_booking_id
  FROM public.booking_schedule_occurrences
  WHERE id = p_occurrence_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence not found';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = v_occurrence_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent booking not found';
  END IF;

  SELECT *
  INTO v_occ
  FROM public.booking_schedule_occurrences
  WHERE id = p_occurrence_id
    AND booking_id = v_booking.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Occurrence not found or its parent changed';
  END IF;

  IF v_booking.fulfillment_type <> 'recurring'::public.booking_fulfillment_type THEN
    RAISE EXCEPTION 'Only recurring booking occurrences can be cancelled through the occurrence flow';
  END IF;

  v_before := to_jsonb(v_occ);

  IF v_occ.status IN ('cancelled', 'completed') THEN
    RAISE EXCEPTION 'Occurrence cannot be cancelled from status %', v_occ.status;
  END IF;

  v_quote := public.calculate_cancellation_refund(
    COALESCE(v_occ.total_amount, 0),
    v_occ.scheduled_start,
    now()
  );

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE booking_id = v_booking.id
    AND status IN ('paid', 'partially_refunded')
  ORDER BY updated_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_payment.id IS NOT NULL
     AND COALESCE((v_quote->>'refund_amount')::numeric, 0) > 0 THEN
    IF COALESCE((
      SELECT SUM(pr.amount)
      FROM public.payment_refunds pr
      WHERE pr.payment_id = v_payment.id
        AND pr.status IN ('pending', 'processing', 'succeeded')
    ), 0) + (v_quote->>'refund_amount')::numeric > v_payment.amount THEN
      RAISE EXCEPTION 'Refund would exceed remaining refundable amount';
    END IF;

    INSERT INTO public.payment_refunds(
      payment_id,
      booking_id,
      occurrence_id,
      amount,
      currency,
      reason,
      status,
      requested_by,
      requested_at
    )
    VALUES(
      v_payment.id,
      v_booking.id,
      v_occ.id,
      (v_quote->>'refund_amount')::numeric,
      v_payment.currency,
      COALESCE(NULLIF(TRIM(p_reason), ''), 'Admin occurrence cancellation'),
      'pending',
      auth.uid(),
      now()
    )
    RETURNING * INTO v_refund;
  END IF;

  UPDATE public.booking_schedule_occurrences
  SET status = 'cancelled',
      worker_id = NULL,
      updated_at = now(),
      last_modified_at = now(),
      last_modified_by = auth.uid()
  WHERE id = v_occ.id;

  SELECT COUNT(*)
  INTO v_remaining
  FROM public.booking_schedule_occurrences
  WHERE booking_id = v_booking.id
    AND status <> 'cancelled';

  IF v_remaining > 0 THEN
    UPDATE public.bookings
    SET scheduled_start = (
          SELECT MIN(o.scheduled_start)
          FROM public.booking_schedule_occurrences o
          WHERE o.booking_id = v_booking.id
            AND o.status <> 'cancelled'
        ),
        scheduled_end = (
          SELECT MAX(o.scheduled_end)
          FROM public.booking_schedule_occurrences o
          WHERE o.booking_id = v_booking.id
            AND o.status <> 'cancelled'
        ),
        updated_at = now()
    WHERE id = v_booking.id;
  ELSE
    PERFORM public.transition_booking_state(
      v_booking.id,
      'cancelled'::public.booking_status,
      NULL,
      false,
      true
    );
  END IF;

  SELECT to_jsonb(o)
  INTO v_after
  FROM public.booking_schedule_occurrences o
  WHERE o.id = v_occ.id;

  PERFORM public.write_admin_audit(
    'admin_cancel_booking_occurrence',
    'booking_occurrence',
    v_occ.id,
    v_before,
    v_after,
    jsonb_build_object(
      'booking_id', v_booking.id,
      'reason', p_reason,
      'refund_id', v_refund.id,
      'refund_amount', COALESCE(v_refund.amount, 0),
      'remaining_occurrences', v_remaining
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'occurrence_id', v_occ.id,
    'booking_id', v_booking.id,
    'status', 'cancelled',
    'refund_id', v_refund.id,
    'refund_amount', COALESCE(v_refund.amount, 0),
    'refund_status', CASE
      WHEN v_refund.id IS NULL THEN NULL
      ELSE v_refund.status
    END,
    'remaining_occurrences', v_remaining,
    'parent_cancelled', v_remaining = 0
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_booking_occurrence_otp_atomic(
  p_occurrence_id uuid,
  p_otp_type text,
  p_otp_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_occurrence_booking_id uuid;
  v_occ public.booking_schedule_occurrences%rowtype;
  v_booking public.bookings%rowtype;
  v_otp public.booking_otps%rowtype;
  v_new_status text;
  v_actor uuid := auth.uid();
  v_has_active boolean := false;
  v_has_remaining boolean := false;
  v_completed_gross numeric := 0;
  v_completed_platform_fee numeric := 0;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Authentication required');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.worker_profiles wp ON wp.id = p.id
    WHERE p.id = v_actor
      AND p.role = 'worker'::public.user_role
      AND p.is_active = true
      AND wp.is_verified = true
      AND wp.worker_status <> 'suspended'::public.worker_status
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker account is not active and verified');
  END IF;

  IF p_occurrence_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Occurrence ID is required');
  END IF;

  IF lower(trim(p_otp_type)) NOT IN ('start', 'end') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP type');
  END IF;

  IF p_otp_hash IS NULL
     OR length(trim(p_otp_hash)) <> 64
     OR p_otp_hash !~ '^[0-9a-fA-F]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP hash');
  END IF;

  -- Lock the parent before the occurrence so this flow agrees with
  -- customer cancellation, series cancellation, and admin occurrence actions.
  SELECT booking_id
  INTO v_occurrence_booking_id
  FROM public.booking_schedule_occurrences
  WHERE id = p_occurrence_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Occurrence not found');
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = v_occurrence_booking_id
    AND worker_id = v_actor
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker is not assigned to this occurrence');
  END IF;

  SELECT *
  INTO v_occ
  FROM public.booking_schedule_occurrences
  WHERE id = p_occurrence_id
    AND booking_id = v_booking.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Occurrence not found or its parent changed');
  END IF;

  IF v_occ.worker_id IS DISTINCT FROM v_actor THEN
    RETURN jsonb_build_object('success', false, 'error', 'Worker is not assigned to this occurrence');
  END IF;

  IF v_booking.fulfillment_type <> 'recurring'::public.booking_fulfillment_type THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recurring booking occurrence is required for occurrence OTP verification');
  END IF;

  IF lower(trim(p_otp_type)) = 'start' THEN
    IF v_occ.status <> 'arrived' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Occurrence must be arrived before start OTP verification');
    END IF;
    v_new_status := 'in_progress';
  ELSE
    IF v_occ.status <> 'in_progress' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Occurrence must be in progress before end OTP verification');
    END IF;
    v_new_status := 'completed';
  END IF;

  SELECT *
  INTO v_otp
  FROM public.booking_otps
  WHERE occurrence_id = p_occurrence_id
    AND otp_type = lower(trim(p_otp_type))::public.otp_type
    AND status = 'pending'::public.otp_status
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired OTP');
  END IF;

  IF COALESCE(v_otp.attempts, 0) >= 5 THEN
    UPDATE public.booking_otps
    SET status = 'expired'::public.otp_status
    WHERE id = v_otp.id;
    RETURN jsonb_build_object('success', false, 'error', 'OTP has been locked after too many attempts');
  END IF;

  IF v_otp.expires_at IS NOT NULL AND v_otp.expires_at <= now() THEN
    UPDATE public.booking_otps
    SET status = 'expired'::public.otp_status
    WHERE id = v_otp.id;
    RETURN jsonb_build_object('success', false, 'error', 'OTP has expired. Please generate a new OTP.');
  END IF;

  IF lower(v_otp.otp_hash) <> lower(trim(p_otp_hash)) THEN
    UPDATE public.booking_otps
    SET attempts = COALESCE(attempts, 0) + 1,
        status = CASE
          WHEN COALESCE(attempts, 0) + 1 >= 5
          THEN 'expired'::public.otp_status
          ELSE status
        END
    WHERE id = v_otp.id
      AND status = 'pending'::public.otp_status;

    RETURN jsonb_build_object('success', false, 'error', 'Invalid OTP');
  END IF;

  UPDATE public.booking_otps
  SET status = 'verified'::public.otp_status,
      verified_at = now()
  WHERE id = v_otp.id
    AND status = 'pending'::public.otp_status;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP has already been used');
  END IF;

  UPDATE public.booking_schedule_occurrences
  SET status = v_new_status,
      started_at = CASE
        WHEN v_new_status = 'in_progress' THEN COALESCE(started_at, now())
        ELSE started_at
      END,
      completed_at = CASE
        WHEN v_new_status = 'completed' THEN COALESCE(completed_at, now())
        ELSE completed_at
      END,
      start_otp_verified_at = CASE
        WHEN lower(trim(p_otp_type)) = 'start' THEN now()
        ELSE start_otp_verified_at
      END,
      end_otp_verified_at = CASE
        WHEN lower(trim(p_otp_type)) = 'end' THEN now()
        ELSE end_otp_verified_at
      END,
      updated_at = now()
  WHERE id = v_occ.id;

  IF v_new_status = 'completed' THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.booking_schedule_occurrences o
      WHERE o.booking_id = v_occ.booking_id
        AND o.id <> v_occ.id
        AND o.status IN ('assigned', 'on_the_way', 'arrived', 'in_progress')
    )
    INTO v_has_active;

    SELECT EXISTS(
      SELECT 1
      FROM public.booking_schedule_occurrences o
      WHERE o.booking_id = v_occ.booking_id
        AND o.status NOT IN ('completed', 'cancelled')
    )
    INTO v_has_remaining;

    IF NOT v_has_remaining THEN
      SELECT COALESCE(SUM(o.total_amount), 0),
             COALESCE(SUM(o.platform_fee), 0)
      INTO v_completed_gross, v_completed_platform_fee
      FROM public.booking_schedule_occurrences o
      WHERE o.booking_id = v_booking.id
        AND o.status = 'completed';

      UPDATE public.bookings
      SET status = 'completed'::public.booking_status,
          completed_at = COALESCE(completed_at, now()),
          end_otp_verified_at = COALESCE(end_otp_verified_at, now()),
          updated_at = now()
      WHERE id = v_booking.id
        AND status NOT IN (
          'completed'::public.booking_status,
          'cancelled'::public.booking_status
        );

      INSERT INTO public.booking_status_history(
        booking_id, old_status, new_status, changed_by, created_at
      )
      SELECT v_booking.id, v_booking.status, 'completed'::public.booking_status, v_actor, now()
      WHERE v_booking.status IS DISTINCT FROM 'completed'::public.booking_status
        AND v_booking.status IS DISTINCT FROM 'cancelled'::public.booking_status;

      INSERT INTO public.worker_earnings(
        worker_id, booking_id, gross_amount, platform_fee, net_amount
      )
      SELECT v_booking.worker_id, v_booking.id, v_completed_gross,
             v_completed_platform_fee, v_completed_gross - v_completed_platform_fee
      WHERE v_booking.worker_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.worker_earnings we
          WHERE we.booking_id = v_booking.id
        );
    END IF;

    IF NOT v_has_active THEN
      UPDATE public.worker_profiles
      SET worker_status = 'available'::public.worker_status,
          updated_at = now()
      WHERE id = v_actor
        AND worker_status <> 'suspended'::public.worker_status;
      UPDATE public.worker_availability SET is_available = true WHERE worker_id = v_actor;
      UPDATE public.worker_presence SET is_available = true WHERE worker_id = v_actor;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'occurrence_id', v_occ.id,
    'booking_id', v_occ.booking_id,
    'otp_type', lower(trim(p_otp_type)),
    'status', v_new_status,
    'booking_completed', CASE
      WHEN v_new_status = 'completed' AND NOT v_has_remaining THEN true
      ELSE false
    END
  );
END;
$function$;
