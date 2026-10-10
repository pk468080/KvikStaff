CREATE OR REPLACE FUNCTION public.admin_update_worker(
  p_worker_id uuid,
  p_full_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_worker_status public.worker_status DEFAULT NULL,
  p_is_verified boolean DEFAULT NULL,
  p_service_radius_km numeric DEFAULT NULL,
  p_is_featured boolean DEFAULT NULL,
  p_service_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_profile public.profiles%rowtype;
  v_worker public.worker_profiles%rowtype;
  v_service_count integer;
  v_requested_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  SELECT *
  INTO v_worker
  FROM public.worker_profiles
  WHERE id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worker not found';
  END IF;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Worker profile not found';
  END IF;

  IF p_service_ids IS NULL
     OR array_length(p_service_ids, 1) IS NULL
     OR array_length(p_service_ids, 1) = 0 THEN
    RAISE EXCEPTION 'Select at least one service';
  END IF;

  SELECT count(*)
  INTO v_requested_count
  FROM (
    SELECT DISTINCT service_id
    FROM unnest(p_service_ids) AS service_id
  ) requested;

  IF v_requested_count <> array_length(p_service_ids, 1) THEN
    RAISE EXCEPTION 'Duplicate services are not allowed';
  END IF;

  SELECT count(*)
  INTO v_service_count
  FROM unnest(p_service_ids) AS service_id
  JOIN public.services s
    ON s.id = service_id
   AND s.is_active = true;

  IF v_service_count <> array_length(p_service_ids, 1) THEN
    RAISE EXCEPTION 'One or more selected services are invalid or inactive';
  END IF;

  v_before := jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'worker', to_jsonb(v_worker),
    'services', COALESCE(
      (
        SELECT jsonb_agg(ws.service_id ORDER BY ws.service_id)
        FROM public.worker_services ws
        WHERE ws.worker_id = p_worker_id
      ),
      '[]'::jsonb
    )
  );

  UPDATE public.profiles
  SET
    full_name = COALESCE(p_full_name, full_name),
    phone = COALESCE(p_phone, phone),
    updated_at = now()
  WHERE id = p_worker_id;

  UPDATE public.worker_profiles
  SET
    worker_status = COALESCE(p_worker_status, worker_status),
    is_verified = COALESCE(p_is_verified, is_verified),
    service_radius_km = COALESCE(
      p_service_radius_km,
      service_radius_km
    ),
    is_featured = COALESCE(
      p_is_featured,
      is_featured
    ),
    updated_at = now()
  WHERE id = p_worker_id;

  DELETE FROM public.worker_services
  WHERE worker_id = p_worker_id;

  INSERT INTO public.worker_services (
    worker_id,
    service_id,
    created_at
  )
  SELECT
    p_worker_id,
    service_id,
    now()
  FROM unnest(p_service_ids) AS service_id;

  SELECT *
  INTO v_worker
  FROM public.worker_profiles
  WHERE id = p_worker_id;

  SELECT *
  INTO v_profile
  FROM public.profiles
  WHERE id = p_worker_id;

  v_after := jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'worker', to_jsonb(v_worker),
    'services', COALESCE(
      (
        SELECT jsonb_agg(ws.service_id ORDER BY ws.service_id)
        FROM public.worker_services ws
        WHERE ws.worker_id = p_worker_id
      ),
      '[]'::jsonb
    )
  );

  PERFORM public.write_admin_audit(
    'admin_update_worker',
    'worker',
    p_worker_id,
    v_before,
    v_after,
    jsonb_build_object(
      'services_updated', true
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'worker_id', p_worker_id,
    'service_count', array_length(p_service_ids, 1)
  );
END;
$function$;;
