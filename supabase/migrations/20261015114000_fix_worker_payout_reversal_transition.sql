BEGIN;

CREATE OR REPLACE FUNCTION public.apply_worker_payout_provider_update(
  p_payout_id uuid,
  p_provider_payout_id text,
  p_provider_status text,
  p_amount_paise bigint,
  p_currency text,
  p_fund_account_id text,
  p_utr text DEFAULT NULL,
  p_fees_paise bigint DEFAULT NULL,
  p_tax_paise bigint DEFAULT NULL,
  p_status_details jsonb DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL
)
RETURNS public.worker_payouts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_payout public.worker_payouts%ROWTYPE;
  v_account public.worker_payout_accounts%ROWTYPE;
  v_status text := lower(btrim(coalesce(p_provider_status, '')));
  v_local_rank integer;
  v_provider_rank integer;
BEGIN
  IF p_payout_id IS NULL
     OR nullif(btrim(coalesce(p_provider_payout_id, '')), '') IS NULL
     OR v_status NOT IN (
       'queued', 'pending', 'rejected', 'processing',
       'processed', 'cancelled', 'reversed', 'failed'
     )
  THEN
    RAISE EXCEPTION 'Invalid payout provider update';
  END IF;

  IF coalesce(p_amount_paise, 0) <= 0
     OR p_currency <> 'INR'
  THEN
    RAISE EXCEPTION 'Invalid provider payout amount or currency';
  END IF;

  SELECT *
  INTO v_payout
  FROM public.worker_payouts
  WHERE id = p_payout_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worker payout not found';
  END IF;

  SELECT *
  INTO v_account
  FROM public.worker_payout_accounts
  WHERE id = v_payout.payout_account_id
    AND worker_id = v_payout.worker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worker payout account not found';
  END IF;

  IF v_account.provider_fund_account_id IS NOT NULL
     AND v_account.provider_fund_account_id <> p_fund_account_id
  THEN
    RAISE EXCEPTION
      'Provider fund account does not match the local payout account';
  END IF;

  IF round(v_payout.amount * 100, 0)::bigint <> p_amount_paise
     OR v_payout.currency <> p_currency
  THEN
    RAISE EXCEPTION
      'Provider payout amount or currency does not match the local payout';
  END IF;

  IF v_payout.provider_payout_id IS NOT NULL
     AND v_payout.provider_payout_id <> btrim(p_provider_payout_id)
  THEN
    RAISE EXCEPTION
      'Payout is already linked to a different provider payout';
  END IF;

  v_local_rank := CASE v_payout.status
    WHEN 'pending' THEN 20
    WHEN 'queued' THEN 30
    WHEN 'processing' THEN 50
    WHEN 'rejected' THEN 100
    WHEN 'failed' THEN 100
    WHEN 'cancelled' THEN 100
    WHEN 'processed' THEN 100
    WHEN 'reversed' THEN 100
    ELSE 0
  END;

  v_provider_rank := CASE v_status
    WHEN 'pending' THEN 20
    WHEN 'queued' THEN 30
    WHEN 'processing' THEN 50
    WHEN 'rejected' THEN 100
    WHEN 'failed' THEN 100
    WHEN 'cancelled' THEN 100
    WHEN 'processed' THEN 100
    WHEN 'reversed' THEN 100
    ELSE 0
  END;

  -- Allow only the legitimate processed-to-reversed transition
  -- through the terminal-state guard.
  IF v_local_rank = 100
     AND NOT (
       v_payout.status = 'processed'
       AND v_status = 'reversed'
     )
  THEN
    SELECT *
    INTO v_payout
    FROM public.worker_payouts
    WHERE id = v_payout.id;

    RETURN v_payout;
  END IF;

  IF v_provider_rank < v_local_rank THEN
    RETURN v_payout;
  END IF;

  UPDATE public.worker_payouts
  SET
    provider_payout_id = btrim(p_provider_payout_id),
    provider_status = v_status,
    status = v_status,
    utr = nullif(btrim(coalesce(p_utr, '')), ''),
    provider_fee_amount = CASE
      WHEN p_fees_paise IS NULL THEN provider_fee_amount
      ELSE round(p_fees_paise / 100.0, 2)
    END,
    provider_tax_amount = CASE
      WHEN p_tax_paise IS NULL THEN provider_tax_amount
      ELSE round(p_tax_paise / 100.0, 2)
    END,
    provider_status_details = p_status_details,
    failure_reason = nullif(btrim(coalesce(p_failure_reason, '')), ''),
    provider_created_at = coalesce(p_created_at, provider_created_at),
    processed_at = CASE
      WHEN v_status = 'processed'
        THEN coalesce(processed_at, now())
      WHEN v_status IN ('reversed', 'failed', 'cancelled', 'rejected')
        THEN processed_at
      ELSE NULL
    END,
    last_reconciled_at = now(),
    reconciliation_error = NULL,
    reconciliation_attempts = reconciliation_attempts + 1,
    updated_at = now()
  WHERE id = v_payout.id
  RETURNING * INTO v_payout;

  RETURN v_payout;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_worker_payout_provider_update(
  uuid, text, text, bigint, text, text, text, bigint, bigint,
  jsonb, text, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_worker_payout_provider_update(
  uuid, text, text, bigint, text, text, text, bigint, bigint,
  jsonb, text, timestamptz
) TO service_role;

COMMIT;