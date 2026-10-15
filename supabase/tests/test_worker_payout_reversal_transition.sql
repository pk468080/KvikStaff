BEGIN;

DO $test$
DECLARE
  v_worker_id CONSTANT uuid :=
    '10000000-0000-4000-8000-000000000101';
  v_account_id CONSTANT uuid :=
    '10000000-0000-4000-8000-000000000102';

  v_processed_payout_id CONSTANT uuid :=
    '10000000-0000-4000-8000-000000000103';
  v_failed_payout_id CONSTANT uuid :=
    '10000000-0000-4000-8000-000000000104';
  v_reversed_payout_id CONSTANT uuid :=
    '10000000-0000-4000-8000-000000000105';

  v_processed_at CONSTANT timestamptz :=
    timestamptz '2026-10-14 12:00:00+00';

  v_result public.worker_payouts%ROWTYPE;
BEGIN
  IF has_function_privilege(
       'anon',
       'public.apply_worker_payout_provider_update(uuid,text,text,bigint,text,text,text,bigint,bigint,jsonb,text,timestamptz)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.apply_worker_payout_provider_update(uuid,text,text,bigint,text,text,text,bigint,bigint,jsonb,text,timestamptz)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'service_role',
       'public.apply_worker_payout_provider_update(uuid,text,text,bigint,text,text,text,bigint,bigint,jsonb,text,timestamptz)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION
      'Payout provider update function permissions are incorrect';
  END IF;

  INSERT INTO public.profiles (id, role, is_active)
  VALUES (v_worker_id, 'worker'::public.user_role, true);

  INSERT INTO public.worker_profiles (id)
  VALUES (v_worker_id);

  INSERT INTO public.worker_payout_accounts (
    id,
    worker_id,
    provider_fund_account_id,
    account_type,
    status
  )
  VALUES (
    v_account_id,
    v_worker_id,
    'fa_ci_reversal_test',
    'bank_account',
    'verified'
  );

  INSERT INTO public.worker_payouts (
    id,
    worker_id,
    payout_account_id,
    provider_payout_id,
    idempotency_key,
    amount,
    currency,
    status,
    provider_status,
    processed_at
  )
  VALUES
    (
      v_processed_payout_id,
      v_worker_id,
      v_account_id,
      'pout_ci_processed_to_reversed',
      'ci-reversal-processed-001',
      100.00,
      'INR',
      'processed',
      'processed',
      v_processed_at
    ),
    (
      v_failed_payout_id,
      v_worker_id,
      v_account_id,
      'pout_ci_failed_terminal',
      'ci-reversal-failed-002',
      100.00,
      'INR',
      'failed',
      'failed',
      NULL
    ),
    (
      v_reversed_payout_id,
      v_worker_id,
      v_account_id,
      'pout_ci_reversed_terminal',
      'ci-reversal-reversed-003',
      100.00,
      'INR',
      'reversed',
      'reversed',
      v_processed_at
    );

  -- A processed payout must accept a legitimate provider reversal.
  v_result := public.apply_worker_payout_provider_update(
    v_processed_payout_id,
    'pout_ci_processed_to_reversed',
    'reversed',
    10000,
    'INR',
    'fa_ci_reversal_test',
    'UTR-CI-REVERSAL',
    NULL,
    NULL,
    '{"status":"reversed","test":true}'::jsonb,
    'CI reversal test',
    NULL
  );

  IF v_result.status IS DISTINCT FROM 'reversed'
     OR v_result.provider_status IS DISTINCT FROM 'reversed'
     OR v_result.processed_at IS DISTINCT FROM v_processed_at
     OR v_result.reconciliation_attempts <> 1
     OR v_result.last_reconciled_at IS NULL
  THEN
    RAISE EXCEPTION
      'Processed-to-reversed transition failed or lost payout metadata';
  END IF;

  -- A reversal event must not change an already failed payout.
  v_result := public.apply_worker_payout_provider_update(
    v_failed_payout_id,
    'pout_ci_failed_terminal',
    'reversed',
    10000,
    'INR',
    'fa_ci_reversal_test',
    NULL,
    NULL,
    NULL,
    '{"status":"reversed","test":true}'::jsonb,
    NULL,
    NULL
  );

  IF v_result.status IS DISTINCT FROM 'failed'
     OR v_result.provider_status IS DISTINCT FROM 'failed'
     OR v_result.reconciliation_attempts <> 0
  THEN
    RAISE EXCEPTION
      'A failed payout was incorrectly changed by a reversal event';
  END IF;

  -- A stale processed event must not undo a reversal.
  v_result := public.apply_worker_payout_provider_update(
    v_reversed_payout_id,
    'pout_ci_reversed_terminal',
    'processed',
    10000,
    'INR',
    'fa_ci_reversal_test',
    NULL,
    NULL,
    NULL,
    '{"status":"processed","test":true}'::jsonb,
    NULL,
    NULL
  );

  IF v_result.status IS DISTINCT FROM 'reversed'
     OR v_result.provider_status IS DISTINCT FROM 'reversed'
     OR v_result.reconciliation_attempts <> 0
  THEN
    RAISE EXCEPTION
      'A stale processed event incorrectly undid a reversal';
  END IF;
END;
$test$;

ROLLBACK;