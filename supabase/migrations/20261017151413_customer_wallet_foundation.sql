BEGIN;

CREATE TABLE public.customer_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL
    REFERENCES public.profiles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'INR'
    CHECK (currency = 'INR'),
  balance_paise bigint NOT NULL DEFAULT 0
    CHECK (balance_paise >= 0),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_wallets_one_per_customer_currency
    UNIQUE (customer_id, currency)
);

CREATE TABLE public.wallet_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL
    REFERENCES public.customer_wallets(id) ON DELETE RESTRICT,
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL DEFAULT 'INR'
    CHECK (currency = 'INR'),
  provider text NOT NULL DEFAULT 'razorpay'
    CHECK (provider = 'razorpay'),
  provider_order_id text,
  provider_payment_id text,
  idempotency_key text NOT NULL
    CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  status text NOT NULL DEFAULT 'creating'
    CHECK (status IN (
      'creating', 'pending', 'succeeded', 'failed',
      'refund_pending', 'refunded'
    )),
  paid_at timestamptz,
  failure_reason text,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_topups_idempotency_per_wallet
    UNIQUE (wallet_id, idempotency_key)
);

CREATE UNIQUE INDEX wallet_topups_provider_order_uidx
  ON public.wallet_topups(provider_order_id)
  WHERE provider_order_id IS NOT NULL;

CREATE UNIQUE INDEX wallet_topups_provider_payment_uidx
  ON public.wallet_topups(provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX wallet_topups_wallet_created_idx
  ON public.wallet_topups(wallet_id, created_at DESC);

CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL
    REFERENCES public.customer_wallets(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL
    CHECK (transaction_type IN (
      'topup', 'booking_payment', 'booking_refund',
      'topup_refund', 'admin_adjustment'
    )),
  direction text NOT NULL
    CHECK (direction IN ('credit', 'debit')),
  amount_paise bigint NOT NULL CHECK (amount_paise > 0),
  currency text NOT NULL DEFAULT 'INR'
    CHECK (currency = 'INR'),
  balance_after_paise bigint NOT NULL
    CHECK (balance_after_paise >= 0),
  source_type text NOT NULL
    CHECK (source_type IN (
      'wallet_topup', 'booking', 'payment_refund',
      'topup_refund', 'admin_adjustment'
    )),
  source_id uuid NOT NULL,
  idempotency_key text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_transactions_unique_source_direction
    UNIQUE (source_type, source_id, direction)
);

CREATE UNIQUE INDEX wallet_transactions_idempotency_uidx
  ON public.wallet_transactions(wallet_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX wallet_transactions_wallet_created_idx
  ON public.wallet_transactions(wallet_id, created_at DESC);

ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.customer_wallets,
  public.wallet_topups,
  public.wallet_transactions
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  public.customer_wallets,
  public.wallet_topups,
  public.wallet_transactions
TO authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.customer_wallets,
  public.wallet_topups,
  public.wallet_transactions
TO service_role;

CREATE POLICY customer_wallets_select_own
ON public.customer_wallets
FOR SELECT TO authenticated
USING (
  customer_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.role = 'customer'::public.user_role
      AND p.is_active = true
  )
);

CREATE POLICY wallet_topups_select_own
ON public.wallet_topups
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_wallets w
    JOIN public.profiles p ON p.id = w.customer_id
    WHERE w.id = wallet_topups.wallet_id
      AND w.customer_id = (SELECT auth.uid())
      AND p.role = 'customer'::public.user_role
      AND p.is_active = true
  )
);

CREATE POLICY wallet_transactions_select_own
ON public.wallet_transactions
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.customer_wallets w
    JOIN public.profiles p ON p.id = w.customer_id
    WHERE w.id = wallet_transactions.wallet_id
      AND w.customer_id = (SELECT auth.uid())
      AND p.role = 'customer'::public.user_role
      AND p.is_active = true
  )
);

-- If the account-erasure workflow tries to rekey a wallet to the
-- pseudonymous profile, do not strand a positive wallet balance.
CREATE OR REPLACE FUNCTION public.prevent_nonzero_wallet_owner_rekey()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.customer_id IS DISTINCT FROM OLD.customer_id
     AND OLD.balance_paise > 0 THEN
    RAISE EXCEPTION
      'Wallet has a positive balance. Spend or refund the balance before account deletion.';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_nonzero_wallet_owner_rekey()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER customer_wallets_prevent_nonzero_owner_rekey
BEFORE UPDATE OF customer_id ON public.customer_wallets
FOR EACH ROW
EXECUTE FUNCTION public.prevent_nonzero_wallet_owner_rekey();

COMMIT;
