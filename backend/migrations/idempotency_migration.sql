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
    status idempotency_status NOT NULL DEFAULT 'in_progress',
    response_body JSONB,
    response_status_code INTEGER,
    locked_at TIMESTAMPTZ,
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
