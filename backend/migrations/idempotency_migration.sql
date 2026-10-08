DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'idempotency_status') THEN
        CREATE TYPE idempotency_status AS ENUM ('in_progress', 'completed', 'failed');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    status idempotency_status NOT NULL DEFAULT 'in_progress',
    response_body JSONB,
    response_status_code INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_idempotency_key UNIQUE (user_id, action, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON public.idempotency_keys (created_at);

-- Secure table from PostgREST/frontend clients
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.idempotency_keys FROM anon, authenticated;

-- Ensure triggers exist safely
CREATE OR REPLACE FUNCTION update_idempotency_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trg_idempotency_keys_updated_at'
    ) THEN
        CREATE TRIGGER trg_idempotency_keys_updated_at
        BEFORE UPDATE ON public.idempotency_keys
        FOR EACH ROW
        EXECUTE FUNCTION update_idempotency_keys_updated_at();
    END IF;
END $$;

-- For atomic booking insertion, update create_customer_hourly_booking to accept idempotency key (migration conceptual only, do not apply)
-- The PR should contain this migration but since we do not deploy it or change the DB,
-- we will handle idempotency outside the DB function via the decorator, BUT
-- the prompt explicitly requested: "If this requires a small database function change, create the migration SQL in the PR but do not apply it."
-- I'll write the conceptual migration SQL for the DB function here:

/*
CREATE OR REPLACE FUNCTION public.create_customer_hourly_booking(
    p_service_variant_id uuid,
    p_address_id uuid,
    p_booking_type public.booking_fulfillment_type,
    p_scheduled_start timestamptz,
    p_scheduled_end timestamptz,
    p_notes text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL,
    p_request_hash text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
    v_booking_id uuid;
BEGIN
    -- Check if idempotency key exists
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_booking_id
        FROM public.bookings
        WHERE idempotency_key = p_idempotency_key
          AND customer_id = auth.uid();

        IF v_booking_id IS NOT NULL THEN
            RETURN v_booking_id;
        END IF;
    END IF;

    -- Existing insert logic...
    -- ...
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
*/
