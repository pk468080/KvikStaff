
CREATE OR REPLACE FUNCTION public.enforce_customer_profile_phone_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_auth_phone text;
  v_auth_phone_confirmed_at timestamptz;
  v_auth_digits text;
  v_profile_digits text;
BEGIN
  -- Service-role and trusted database maintenance operations remain supported.
  IF coalesce(auth.role(), '') = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  -- An authenticated administrator may perform reviewed account corrections.
  IF auth.uid() IS NOT NULL AND public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- The auth.users worker-signup trigger creates worker profiles internally.
  -- Do not block that trusted trigger; ordinary client requests have auth.uid().
  IF auth.uid() IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = NEW.id
        AND u.raw_user_meta_data ->> 'role' = 'worker'
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Profile phone changes require a verified account session'
      USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'You may only set the phone number for your own profile'
      USING ERRCODE = '42501';
  END IF;

  -- For updates, this new guard is scoped to customer phone identity.
  -- Worker phone-edit workflow will be audited and corrected in the worker phase.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM 'customer'::public.user_role THEN
      RETURN NEW;
    END IF;

    IF NEW.phone IS NOT DISTINCT FROM OLD.phone THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT u.phone, u.phone_confirmed_at
    INTO v_auth_phone, v_auth_phone_confirmed_at
  FROM auth.users u
  WHERE u.id = auth.uid();

  IF v_auth_phone IS NULL OR v_auth_phone_confirmed_at IS NULL THEN
    RAISE EXCEPTION 'Verify your mobile number before saving it to your profile'
      USING ERRCODE = '42501';
  END IF;

  v_auth_digits := pg_catalog.regexp_replace(v_auth_phone, '[^0-9]', '', 'g');

  -- This app currently supports Indian mobile numbers.
  IF pg_catalog.length(v_auth_digits) = 12
     AND pg_catalog.left(v_auth_digits, 2) = '91' THEN
    v_auth_digits := pg_catalog.right(v_auth_digits, 10);
  ELSIF pg_catalog.length(v_auth_digits) <> 10 THEN
    RAISE EXCEPTION 'The verified Auth phone is not a supported Indian mobile number'
      USING ERRCODE = '42501';
  END IF;

  v_profile_digits := pg_catalog.regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g');

  IF NOT (
    pg_catalog.length(v_profile_digits) = 10
    OR (
      pg_catalog.length(v_profile_digits) = 11
      AND pg_catalog.left(v_profile_digits, 1) = '0'
    )
    OR (
      pg_catalog.length(v_profile_digits) = 12
      AND pg_catalog.left(v_profile_digits, 2) = '91'
    )
  ) THEN
    RAISE EXCEPTION 'Enter a valid Indian mobile number'
      USING ERRCODE = '22023';
  END IF;

  v_profile_digits := pg_catalog.right(v_profile_digits, 10);

  IF v_profile_digits !~ '^[6-9][0-9]{9}$'
     OR v_profile_digits IS DISTINCT FROM v_auth_digits THEN
    RAISE EXCEPTION 'The profile phone must match the mobile number verified by Supabase Auth'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER profiles_enforce_customer_phone_identity
BEFORE INSERT OR UPDATE OF phone
ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_customer_profile_phone_identity();
;
