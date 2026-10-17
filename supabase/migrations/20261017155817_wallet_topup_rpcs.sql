BEGIN;

-- Idempotently prepare a top-up row before contacting Razorpay.
-- Initial MVP bounds: INR 100 to INR 50,000 per top-up.
CREATE OR REPLACE FUNCTION public.create_wallet_topup_intent(
  p_customer_id uuid,
  p_amount_paise bigint,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_wallet public.customer_wallets%rowtype;
  v_topup public.wallet_topups%rowtype;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_receipt text;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'Customer ID is required';
  END IF;
  IF p_amount_paise IS NULL OR p_amount_paise < 10000 OR p_amount_paise > 5000000 THEN
    RAISE EXCEPTION 'Top-up amount must be between INR 100 and INR 50000';
  END IF;
  IF length(v_key) < 1 OR length(v_key) > 200 THEN
    RAISE EXCEPTION 'A valid idempotency key is required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_customer_id
      AND p.role = 'customer'::public.user_role
      AND p.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Customer account is inactive or invalid';
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

  SELECT * INTO v_topup
  FROM public.wallet_topups t
  WHERE t.wallet_id = v_wallet.id
    AND t.idempotency_key = v_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_topup.amount_paise <> p_amount_paise THEN
      RAISE EXCEPTION 'Idempotency key was already used with a different amount';
    END IF;
    v_receipt := 'wt_' || replace(v_topup.id::text, '-', '');
    RETURN jsonb_build_object(
      'success', true,
      'created', false,
      'topup_id', v_topup.id,
      'wallet_id', v_wallet.id,
      'amount_paise', v_topup.amount_paise,
      'currency', v_topup.currency,
      'status', v_topup.status,
      'provider_order_id', v_topup.provider_order_id,
      'receipt', v_receipt,
      'paid_at', v_topup.paid_at
    );
  END IF;

  INSERT INTO public.wallet_topups (
    wallet_id, amount_paise, currency, provider, idempotency_key, status, provider_metadata
  ) VALUES (
    v_wallet.id, p_amount_paise, 'INR', 'razorpay', v_key, 'creating', '{}'::jsonb
  ) RETURNING * INTO v_topup;

  v_receipt := 'wt_' || replace(v_topup.id::text, '-', '');
  UPDATE public.wallet_topups
  SET provider_metadata = provider_metadata || jsonb_build_object('receipt', v_receipt),
      updated_at = now()
  WHERE id = v_topup.id
  RETURNING * INTO v_topup;

  RETURN jsonb_build_object(
    'success', true,
    'created', true,
    'topup_id', v_topup.id,
    'wallet_id', v_wallet.id,
    'amount_paise', v_topup.amount_paise,
    'currency', v_topup.currency,
    'status', v_topup.status,
    'provider_order_id', v_topup.provider_order_id,
    'receipt', v_receipt,
    'paid_at', v_topup.paid_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_wallet_topup_intent(uuid, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_wallet_topup_intent(uuid, bigint, text)
  TO service_role;


-- Attach the provider order after it has been created. Retries can only attach
-- the same provider order; they cannot replace it.
CREATE OR REPLACE FUNCTION public.attach_wallet_topup_order(
  p_customer_id uuid,
  p_topup_id uuid,
  p_provider_order_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_topup public.wallet_topups%rowtype;
  v_customer_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_customer_id IS NULL OR p_topup_id IS NULL
     OR p_provider_order_id IS NULL OR btrim(p_provider_order_id) = '' THEN
    RAISE EXCEPTION 'Customer, top-up and provider order IDs are required';
  END IF;

  SELECT t.* INTO v_topup
  FROM public.wallet_topups t
  WHERE t.id = p_topup_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Top-up not found';
  END IF;
  SELECT w.customer_id INTO v_customer_id
  FROM public.customer_wallets w WHERE w.id = v_topup.wallet_id;
  IF v_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Top-up access denied';
  END IF;

  IF v_topup.provider_order_id IS NOT NULL THEN
    IF v_topup.provider_order_id <> p_provider_order_id THEN
      RAISE EXCEPTION 'Top-up already has a different provider order';
    END IF;
    RETURN jsonb_build_object(
      'success', true, 'idempotent', true,
      'topup_id', v_topup.id, 'wallet_id', v_topup.wallet_id,
      'amount_paise', v_topup.amount_paise, 'currency', v_topup.currency,
      'status', v_topup.status, 'provider_order_id', v_topup.provider_order_id
    );
  END IF;

  IF v_topup.status <> 'creating' THEN
    RAISE EXCEPTION 'Top-up is not waiting for a provider order';
  END IF;

  UPDATE public.wallet_topups
  SET provider_order_id = p_provider_order_id,
      status = 'pending',
      updated_at = now()
  WHERE id = v_topup.id
  RETURNING * INTO v_topup;

  RETURN jsonb_build_object(
    'success', true, 'idempotent', false,
    'topup_id', v_topup.id, 'wallet_id', v_topup.wallet_id,
    'amount_paise', v_topup.amount_paise, 'currency', v_topup.currency,
    'status', v_topup.status, 'provider_order_id', v_topup.provider_order_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_wallet_topup_order(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_wallet_topup_order(uuid, uuid, text)
  TO service_role;


-- Mark only a provider-rejected order creation as failed. Ambiguous transport
-- failures deliberately remain in 'creating' for reconciliation.
CREATE OR REPLACE FUNCTION public.fail_wallet_topup_creation(
  p_customer_id uuid,
  p_topup_id uuid,
  p_failure_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_topup public.wallet_topups%rowtype;
  v_customer_id uuid;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  SELECT t.* INTO v_topup
  FROM public.wallet_topups t
  WHERE t.id = p_topup_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Top-up not found';
  END IF;
  SELECT w.customer_id INTO v_customer_id
  FROM public.customer_wallets w WHERE w.id = v_topup.wallet_id;
  IF v_customer_id IS DISTINCT FROM p_customer_id THEN
    RAISE EXCEPTION 'Top-up access denied';
  END IF;

  IF v_topup.status = 'failed' THEN
    RETURN jsonb_build_object(
      'success', true, 'idempotent', true,
      'topup_id', v_topup.id, 'status', v_topup.status
    );
  END IF;
  IF v_topup.status <> 'creating' OR v_topup.provider_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Top-up cannot be marked failed in its current state';
  END IF;

  UPDATE public.wallet_topups
  SET status = 'failed',
      failure_reason = left(coalesce(nullif(btrim(p_failure_reason), ''), 'Razorpay order creation rejected'), 500),
      updated_at = now()
  WHERE id = v_topup.id
  RETURNING * INTO v_topup;

  RETURN jsonb_build_object(
    'success', true, 'idempotent', false,
    'topup_id', v_topup.id, 'status', v_topup.status
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fail_wallet_topup_creation(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_wallet_topup_creation(uuid, uuid, text)
  TO service_role;


-- The only operation that credits a top-up. Caller must have independently
-- verified the captured Razorpay payment record and its order/amount/currency.
CREATE OR REPLACE FUNCTION public.finalize_wallet_topup(
  p_topup_id uuid,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_provider_amount_paise bigint,
  p_provider_currency text,
  p_paid_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_topup public.wallet_topups%rowtype;
  v_wallet public.customer_wallets%rowtype;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
  v_balance_after bigint;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_topup_id IS NULL
     OR p_provider_order_id IS NULL OR btrim(p_provider_order_id) = ''
     OR p_provider_payment_id IS NULL OR btrim(p_provider_payment_id) = '' THEN
    RAISE EXCEPTION 'Top-up, provider order and payment IDs are required';
  END IF;
  IF p_provider_amount_paise IS NULL OR p_provider_amount_paise <= 0 THEN
    RAISE EXCEPTION 'Provider payment amount is invalid';
  END IF;
  IF upper(btrim(coalesce(p_provider_currency, ''))) <> 'INR' THEN
    RAISE EXCEPTION 'Provider payment currency must be INR';
  END IF;
  IF v_paid_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Invalid payment timestamp';
  END IF;

  SELECT * INTO v_topup
  FROM public.wallet_topups t
  WHERE t.id = p_topup_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Top-up not found';
  END IF;

  IF v_topup.amount_paise <> p_provider_amount_paise
     OR v_topup.currency <> upper(btrim(p_provider_currency)) THEN
    RAISE EXCEPTION 'Razorpay payment amount or currency does not match the top-up';
  END IF;
  IF v_topup.provider_order_id IS DISTINCT FROM p_provider_order_id THEN
    RAISE EXCEPTION 'Razorpay order does not match the top-up';
  END IF;

  IF v_topup.status = 'succeeded' THEN
    IF v_topup.provider_payment_id IS DISTINCT FROM p_provider_payment_id THEN
      RAISE EXCEPTION 'Top-up already succeeded with a different provider payment';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.wallet_transactions tx
      WHERE tx.wallet_id = v_topup.wallet_id
        AND tx.source_type = 'wallet_topup'
        AND tx.source_id = v_topup.id
        AND tx.direction = 'credit'
    ) THEN
      RAISE EXCEPTION 'Successful top-up is missing its ledger entry; reconciliation required';
    END IF;
    SELECT * INTO v_wallet FROM public.customer_wallets w WHERE w.id = v_topup.wallet_id;
    RETURN jsonb_build_object(
      'success', true, 'idempotent', true,
      'topup_id', v_topup.id, 'wallet_id', v_wallet.id,
      'status', v_topup.status, 'balance_paise', v_wallet.balance_paise,
      'provider_payment_id', v_topup.provider_payment_id
    );
  END IF;

  IF v_topup.status <> 'pending' THEN
    RAISE EXCEPTION 'Top-up is not eligible for finalization from status %', v_topup.status;
  END IF;

  SELECT * INTO v_wallet
  FROM public.customer_wallets w
  WHERE w.id = v_topup.wallet_id
  FOR UPDATE;
  IF NOT FOUND OR v_wallet.status <> 'active' THEN
    RAISE EXCEPTION 'Wallet is not active; captured funds require reconciliation';
  END IF;

  UPDATE public.customer_wallets
  SET balance_paise = balance_paise + v_topup.amount_paise,
      updated_at = now()
  WHERE id = v_wallet.id AND status = 'active'
  RETURNING balance_paise INTO v_balance_after;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet could not be credited';
  END IF;

  INSERT INTO public.wallet_transactions (
    wallet_id, transaction_type, direction, amount_paise, currency,
    balance_after_paise, source_type, source_id, idempotency_key, metadata
  ) VALUES (
    v_wallet.id, 'topup', 'credit', v_topup.amount_paise, 'INR',
    v_balance_after, 'wallet_topup', v_topup.id,
    'wallet-topup:' || v_topup.id::text,
    jsonb_build_object(
      'provider', 'razorpay',
      'provider_order_id', p_provider_order_id,
      'provider_payment_id', p_provider_payment_id
    )
  );

  UPDATE public.wallet_topups
  SET provider_order_id = p_provider_order_id,
      provider_payment_id = p_provider_payment_id,
      status = 'succeeded',
      paid_at = v_paid_at,
      failure_reason = NULL,
      provider_metadata = provider_metadata || jsonb_build_object(
        'verified_amount_paise', p_provider_amount_paise,
        'verified_currency', upper(btrim(p_provider_currency)),
        'verified_payment_id', p_provider_payment_id
      ),
      updated_at = now()
  WHERE id = v_topup.id
  RETURNING * INTO v_topup;

  RETURN jsonb_build_object(
    'success', true, 'idempotent', false,
    'topup_id', v_topup.id, 'wallet_id', v_wallet.id,
    'status', v_topup.status, 'balance_paise', v_balance_after,
    'provider_payment_id', v_topup.provider_payment_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_wallet_topup(uuid, text, text, bigint, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_wallet_topup(uuid, text, text, bigint, text, timestamptz)
  TO service_role;

COMMIT;
