-- Create an ENUM type for idempotency status
CREATE TYPE idempotency_status AS ENUM ('in_progress', 'completed', 'failed');

-- Create the idempotency_keys table
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    action VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    status idempotency_status NOT NULL DEFAULT 'in_progress',
    response_body JSONB,
    response_status_code INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure same user + same operation + same key is unique
    CONSTRAINT uq_idempotency_key UNIQUE (user_id, action, idempotency_key)
);

-- Add an index to automatically clear out old keys or for faster lookups
CREATE INDEX idx_idempotency_keys_created_at ON public.idempotency_keys (created_at);

-- Trigger to update 'updated_at' column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trg_idempotency_keys_updated_at
BEFORE UPDATE ON public.idempotency_keys
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
