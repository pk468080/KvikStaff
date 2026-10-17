BEGIN;

-- Wallet booking refunds use the existing payment_refunds audit trail, but must
-- credit the wallet rather than create a Razorpay refund job.
CREATE OR REPLACE FUNCTION public.prepare_wallet_payment_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payment public.payments%rowtype;
  v_customer_id uuid;
  v_wallet_id uuid;
  v_reserved numeric := 0;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments p
  WHERE p.id = NEW.payment_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment for refund was not found';
  END IF;
  IF v_payment.provider <> 'wallet' THEN
    RETURN NEW;
  END IF;

  IF NEW.booking_id IS DISTINCT FROM v_payment.booking_id THEN
    RAISE EXCEPTION 'Refund booking does not match wallet payment';
  END IF;
  IF upper(NEW.currency) <> 'INR' OR upper(v_payment.currency) <> 'INR' THEN
    RAISE EXCEPTION 'Wallet refund currency must be INR';
  END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0
     OR NEW.amount * 100 <> round(NEW.amount * 100) THEN
    RAISE EXCEPTION 'Wallet refund amount must be positive and exact to paise';
  END IF;
  IF v_payment.status NOT IN (
    'paid'::public.payment_status,
    'partially_refunded'::public.payment_status
  ) THEN
    RAISE EXCEPTION 'Wallet payment is not refundable in its current state';
  END IF;

  SELECT coalesce(sum(pr.amount), 0) INTO v_reserved
  FROM public.payment_refunds pr
  WHERE pr.payment_id = v_payment.id
    AND pr.status IN ('pending', 'processing', 'succeeded');
  IF v_reserved + NEW.amount > v_payment.amount THEN
    RAISE EXCEPTION 'Wallet refunds would exceed the original payment amount';
  END IF;

  SELECT b.customer_id INTO v_customer_id
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking for wallet refund was not found';
  END IF;

  SELECT w.id INTO v_wallet_id
  FROM public.customer_wallets w
  WHERE w.customer_id = v_customer_id
    AND w.currency = 'INR'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer wallet for refund was not found';
  END IF;

  NEW.status := 'succeeded';
  NEW.provider_refund_id := NULL;
  NEW.failure_reason := NULL;
  NEW.processed_at := coalesce(NEW.processed_at, now());
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_wallet_payment_refund()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_wallet_payment_refund()
  TO service_role;

CREATE OR REPLACE FUNCTION public.apply_wallet_payment_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payment public.payments%rowtype;
  v_wallet public.customer_wallets%rowtype;
  v_customer_id uuid;
  v_refund_paise bigint;
  v_succeeded numeric := 0;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments p
  WHERE p.id = NEW.payment_id;
  IF NOT FOUND OR v_payment.provider <> 'wallet' THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'succeeded' THEN
    RAISE EXCEPTION 'Wallet payment refund must complete atomically';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.wallet_transactions tx
    WHERE tx.source_type = 'payment_refund'
      AND tx.source_id = NEW.id
      AND tx.direction = 'credit'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT b.customer_id INTO v_customer_id
  FROM public.bookings b
  WHERE b.id = NEW.booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking for wallet refund was not found';
  END IF;

  SELECT * INTO v_wallet
  FROM public.customer_wallets w
  WHERE w.customer_id = v_customer_id
    AND w.currency = 'INR'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer wallet for refund was not found';
  END IF;

  v_refund_paise := round(NEW.amount * 100)::bigint;
  UPDATE public.customer_wallets
  SET balance_paise = balance_paise + v_refund_paise,
      status = CASE WHEN status = 'closed' THEN 'suspended' ELSE status END,
      updated_at = now()
  WHERE id = v_wallet.id
  RETURNING * INTO v_wallet;

  INSERT INTO public.wallet_transactions (
    wallet_id, transaction_type, direction, amount_paise, currency,
    balance_after_paise, source_type, source_id, idempotency_key, metadata
  ) VALUES (
    v_wallet.id, 'booking_refund', 'credit', v_refund_paise, 'INR',
    v_wallet.balance_paise, 'payment_refund', NEW.id,
    'payment-refund:' || NEW.id::text,
    jsonb_build_object('payment_id', NEW.payment_id,
                       'booking_id', NEW.booking_id,
                       'occurrence_id', NEW.occurrence_id)
  );

  SELECT coalesce(sum(pr.amount), 0) INTO v_succeeded
  FROM public.payment_refunds pr
  WHERE pr.payment_id = NEW.payment_id
    AND pr.status = 'succeeded';

  UPDATE public.payments
  SET status = CASE
        WHEN v_succeeded >= v_payment.amount
          THEN 'refunded'::public.payment_status
        ELSE 'partially_refunded'::public.payment_status
      END,
      updated_at = now()
  WHERE id = NEW.payment_id;

  IF NEW.refund_request_id IS NOT NULL THEN
    UPDATE public.refund_requests
    SET status = 'succeeded',
        provider_refund_id = NULL,
        processed_at = coalesce(processed_at, now()),
        updated_at = now()
    WHERE id = NEW.refund_request_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_wallet_payment_refund()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_wallet_payment_refund()
  TO service_role;

DROP TRIGGER IF EXISTS payment_refunds_prepare_wallet_payment
  ON public.payment_refunds;
CREATE TRIGGER payment_refunds_prepare_wallet_payment
BEFORE INSERT ON public.payment_refunds
FOR EACH ROW EXECUTE FUNCTION public.prepare_wallet_payment_refund();

DROP TRIGGER IF EXISTS payment_refunds_apply_wallet_payment
  ON public.payment_refunds;
CREATE TRIGGER payment_refunds_apply_wallet_payment
AFTER INSERT ON public.payment_refunds
FOR EACH ROW EXECUTE FUNCTION public.apply_wallet_payment_refund();


CREATE OR REPLACE FUNCTION public.pay_booking_with_wallet(
  p_booking_id uuid,
  p_customer_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_booking public.bookings%rowtype;
  v_payment public.payments%rowtype;
  v_wallet public.customer_wallets%rowtype;
  v_tx public.wallet_transactions%rowtype;
  v_amount_paise bigint;
  v_balance_after bigint;
  v_currency text;
  v_dispatch jsonb;
  v_quote jsonb;
  v_quote_refund numeric := 0;
  v_refund_amount numeric := 0;
  v_refund public.payment_refunds%rowtype;
  v_occ record;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_booking_id IS NULL OR p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Booking ID and customer ID are required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_customer_id
      AND p.role = 'customer'::public.user_role
      AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Customer account is inactive or invalid';
  END IF;

  -- Lock order is booking -> payment -> wallet, shared with booking payment flows.
  SELECT * INTO v_booking
  FROM public.bookings b
  WHERE b.id = p_booking_id AND b.customer_id = p_customer_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT * INTO v_payment
  FROM public.payments p
  WHERE p.booking_id = v_booking.id
  FOR UPDATE;
  IF FOUND THEN
    IF v_payment.provider = 'wallet'
       AND v_payment.status IN (
         'paid'::public.payment_status,
         'partially_refunded'::public.payment_status,
         'refunded'::public.payment_status
       ) THEN
      SELECT * INTO v_tx
      FROM public.wallet_transactions tx
      WHERE tx.source_type = 'booking'
        AND tx.source_id = v_booking.id
        AND tx.direction = 'debit';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Wallet payment ledger is missing; manual reconciliation required';
      END IF;
      SELECT * INTO v_wallet
      FROM public.customer_wallets w
      WHERE w.customer_id = p_customer_id AND w.currency = 'INR';
      RETURN jsonb_build_object(
        'success', true, 'idempotent', true,
        'booking_id', v_booking.id, 'payment_id', v_payment.id,
        'status', v_payment.status::text,
        'booking_status', v_booking.status::text,
        'balance_paise', v_wallet.balance_paise
      );
    END IF;
    RAISE EXCEPTION 'Booking already has a payment attempt; reconcile it before using wallet';
  END IF;

  IF v_booking.status NOT IN (
    'pending_payment'::public.booking_status,
    'payment_failed'::public.booking_status
  ) THEN
    RAISE EXCEPTION 'Booking is not available for payment';
  END IF;
  IF v_booking.fulfillment_type IN (
    'instant'::public.booking_fulfillment_type,
    'scheduled'::public.booking_fulfillment_type
  ) AND v_booking.scheduled_start <= now() THEN
    RAISE EXCEPTION 'Booking schedule has already started';
  END IF;
  v_currency := upper(btrim(coalesce(v_booking.pricing_snapshot ->> 'currency', '')));
  IF v_currency <> 'INR' THEN
    RAISE EXCEPTION 'Wallet payment is available only for INR bookings';
  END IF;
  IF v_booking.total_amount IS NULL OR v_booking.total_amount <= 0
     OR v_booking.total_amount <> round(v_booking.total_amount, 2) THEN
    RAISE EXCEPTION 'Booking payment amount is invalid';
  END IF;
  v_amount_paise := round(v_booking.total_amount * 100)::bigint;
  IF v_amount_paise <= 0 THEN
    RAISE EXCEPTION 'Booking payment amount is invalid';
  END IF;

  INSERT INTO public.customer_wallets (customer_id, currency)
  VALUES (p_customer_id, 'INR')
  ON CONFLICT (customer_id, currency) DO NOTHING;
  SELECT * INTO v_wallet
  FROM public.customer_wallets w
  WHERE w.customer_id = p_customer_id AND w.currency = 'INR'
  FOR UPDATE;
  IF NOT FOUND OR v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'Wallet is not active';
  END IF;
  IF v_wallet.balance_paise < v_amount_paise THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE public.customer_wallets
  SET balance_paise = balance_paise - v_amount_paise,
      updated_at = now()
  WHERE id = v_wallet.id
    AND status = 'active'
    AND balance_paise >= v_amount_paise
  RETURNING balance_paise INTO v_balance_after;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  INSERT INTO public.payments (
    booking_id, provider, amount, currency, status, paid_at
  ) VALUES (
    v_booking.id, 'wallet', v_booking.total_amount, 'INR',
    'paid'::public.payment_status, now()
  ) RETURNING * INTO v_payment;

  INSERT INTO public.wallet_transactions (
    wallet_id, transaction_type, direction, amount_paise, currency,
    balance_after_paise, source_type, source_id, idempotency_key, metadata
  ) VALUES (
    v_wallet.id, 'booking_payment', 'debit', v_amount_paise, 'INR',
    v_balance_after, 'booking', v_booking.id,
    'booking:' || v_booking.id::text,
    jsonb_build_object('booking_id', v_booking.id, 'payment_id', v_payment.id)
  );

  UPDATE public.bookings
  SET status = 'paid'::public.booking_status, updated_at = now()
  WHERE id = v_booking.id;
  INSERT INTO public.booking_status_history (
    booking_id, old_status, new_status, changed_by, created_at
  ) VALUES (
    v_booking.id, v_booking.status, 'paid'::public.booking_status, NULL, now()
  );

  -- Reconcile policy refunds for recurring occurrences cancelled before payment.
  IF v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type THEN
    FOR v_occ IN
      SELECT o.total_amount, o.scheduled_start, o.cancelled_at
      FROM public.booking_schedule_occurrences o
      WHERE o.booking_id = v_booking.id AND o.status = 'cancelled'
      ORDER BY o.occurrence_index
    LOOP
      v_quote := public.calculate_cancellation_refund(
        coalesce(v_occ.total_amount, 0), v_occ.scheduled_start,
        coalesce(v_occ.cancelled_at, now())
      );
      v_quote_refund := v_quote_refund
        + greatest(coalesce((v_quote->>'refund_amount')::numeric, 0), 0);
    END LOOP;
    v_refund_amount := least(greatest(v_quote_refund, 0), v_payment.amount);
    IF v_refund_amount > 0 THEN
      INSERT INTO public.payment_refunds (
        payment_id, booking_id, amount, currency, reason,
        status, requested_by, requested_at
      ) VALUES (
        v_payment.id, v_booking.id, round(v_refund_amount, 2), 'INR',
        'Automatic wallet refund: recurring occurrence(s) cancelled before payment',
        'pending', NULL, now()
      ) RETURNING * INTO v_refund;
    END IF;
  END IF;

  BEGIN
    v_dispatch := public.dispatch_booking_worker_offers_internal(v_booking.id);
  EXCEPTION WHEN OTHERS THEN
    v_dispatch := jsonb_build_object(
      'success', false, 'assigned', false,
      'status', 'searching_worker', 'error', SQLERRM
    );
    UPDATE public.bookings
    SET status = 'searching_worker'::public.booking_status, updated_at = now()
    WHERE id = v_booking.id AND status = 'paid'::public.booking_status;
    INSERT INTO public.booking_status_history (
      booking_id, old_status, new_status, changed_by, created_at
    ) VALUES (
      v_booking.id, 'paid'::public.booking_status,
      'searching_worker'::public.booking_status, NULL, now()
    );
  END;

  SELECT * INTO v_wallet FROM public.customer_wallets w WHERE w.id = v_wallet.id;
  RETURN jsonb_build_object(
    'success', true, 'idempotent', false,
    'booking_id', v_booking.id, 'payment_id', v_payment.id,
    'status', v_payment.status::text,
    'booking_status', coalesce(v_dispatch->>'status', 'searching_worker'),
    'assigned', coalesce((v_dispatch->>'assigned')::boolean, false),
    'worker_id', v_dispatch->'worker_id',
    'created_offers', coalesce(v_dispatch->'created_offers', '0'::jsonb),
    'pending_offers', coalesce(v_dispatch->'pending_offers', '0'::jsonb),
    'balance_paise', v_wallet.balance_paise,
    'refunded_before_dispatch', round(coalesce(v_refund_amount, 0), 2),
    'refund_id', v_refund.id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pay_booking_with_wallet(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_booking_with_wallet(uuid, uuid)
  TO service_role;

COMMIT;
