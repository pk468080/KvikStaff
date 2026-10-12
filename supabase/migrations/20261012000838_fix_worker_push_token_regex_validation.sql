-- Fix worker push token regex validation
CREATE OR REPLACE FUNCTION public.register_worker_push_token(
  p_token text,
  p_platform text DEFAULT NULL
)
RETURNS public.push_tokens
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_worker public.workers;
  v_token text;
  v_platform text;
  v_row public.push_tokens;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_worker
  FROM public.workers
  WHERE user_id = v_user_id;

  IF NOT FOUND OR v_worker.status != 'active' THEN
    RAISE EXCEPTION 'Worker account not active.';
  END IF;

  v_token := btrim(p_token);
  IF v_token IS NULL OR v_token = '' THEN
    RAISE EXCEPTION 'Push token is required.';
  END IF;

  -- Correct validation pattern
  IF v_token !~ '^ExponentPushToken\[[^\]]+\]$' THEN
    RAISE EXCEPTION 'Invalid Expo push token.';
  END IF;

  v_platform := btrim(lower(p_platform));
  IF v_platform IS NOT NULL AND v_platform != '' AND v_platform NOT IN ('ios', 'android', 'web') THEN
    RAISE EXCEPTION 'Invalid platform.';
  END IF;

  INSERT INTO public.push_tokens (
    user_id,
    token,
    platform,
    is_active
  )
  VALUES (
    v_user_id,
    v_token,
    v_platform,
    true
  )
  ON CONFLICT (user_id, token)
  DO UPDATE SET
    is_active = true,
    platform = COALESCE(EXCLUDED.platform, push_tokens.platform),
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_worker_push_token(text, text) TO authenticated;
