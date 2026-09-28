create or replace function public.worker_set_presence(p_available boolean)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_status public.worker_status;
  v_is_verified boolean;
  v_expires timestamptz;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  select
    worker_status,
    is_verified
  into
    v_status,
    v_is_verified
  from public.worker_profiles
  where id = v_worker_id
  for update;

  if not found then
    raise exception 'Worker profile not found';
  end if;

  if v_status = 'suspended'::public.worker_status then
    raise exception 'Worker account is suspended';
  end if;

  if p_available then
    if coalesce(v_is_verified, false) is not true then
      raise exception 'Worker account must be verified before going online';
    end if;

    if v_status = 'busy'::public.worker_status then
      raise exception 'Worker is busy';
    end if;

    v_expires := now() + interval '3 minutes';

    insert into public.worker_presence(
      worker_id,
      is_available,
      last_seen_at,
      expires_at,
      updated_at
    )
    values(
      v_worker_id,
      true,
      now(),
      v_expires,
      now()
    )
    on conflict(worker_id) do update
      set
        is_available = true,
        last_seen_at = now(),
        expires_at = excluded.expires_at,
        updated_at = now();

    perform set_config(
      'app.worker_profile_internal_mutation',
      'presence',
      true
    );

    update public.worker_profiles
    set
      worker_status = 'available'::public.worker_status,
      updated_at = now()
    where id = v_worker_id;
  else
    update public.worker_presence
    set
      is_available = false,
      expires_at = now(),
      updated_at = now()
    where worker_id = v_worker_id;

    insert into public.worker_presence(
      worker_id,
      is_available,
      last_seen_at,
      expires_at,
      updated_at
    )
    values(
      v_worker_id,
      false,
      now(),
      now(),
      now()
    )
    on conflict(worker_id) do nothing;

    perform set_config(
      'app.worker_profile_internal_mutation',
      'presence',
      true
    );

    update public.worker_profiles
    set
      worker_status = 'offline'::public.worker_status,
      updated_at = now()
    where
      id = v_worker_id
      and worker_status <> 'busy'::public.worker_status;

    v_expires := now();
  end if;

  return jsonb_build_object(
    'success', true,
    'worker_id', v_worker_id,
    'is_available', p_available,
    'expires_at', v_expires
  );
end;
$function$;


create or replace function public.worker_presence_heartbeat(
  p_latitude double precision,
  p_longitude double precision
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_status public.worker_status;
  v_is_verified boolean;
  v_expires timestamptz;
begin
  if v_worker_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    raise exception 'Worker account is inactive';
  end if;

  if p_latitude < -90
     or p_latitude > 90
     or p_longitude < -180
     or p_longitude > 180 then
    raise exception 'Invalid coordinates';
  end if;

  select
    worker_status,
    is_verified
  into
    v_status,
    v_is_verified
  from public.worker_profiles
  where id = v_worker_id
  for update;

  if not found then
    raise exception 'Worker profile not found';
  end if;

  if coalesce(v_is_verified, false) is not true then
    raise exception 'Worker account must be verified before sending a presence heartbeat';
  end if;

  if v_status <> 'available'::public.worker_status then
    raise exception 'Worker is not available';
  end if;

  v_expires := now() + interval '3 minutes';

  insert into public.worker_presence(
    worker_id,
    is_available,
    last_seen_at,
    expires_at,
    updated_at
  )
  values(
    v_worker_id,
    true,
    now(),
    v_expires,
    now()
  )
  on conflict(worker_id) do update
    set
      is_available = true,
      last_seen_at = now(),
      expires_at = excluded.expires_at,
      updated_at = now();

  insert into public.worker_locations(
    worker_id,
    latitude,
    longitude,
    location,
    recorded_at
  )
  values(
    v_worker_id,
    p_latitude,
    p_longitude,
    public.st_setsrid(
      public.st_makepoint(
        p_longitude,
        p_latitude
      ),
      4326
    )::public.geography,
    now()
  );

  perform set_config(
    'app.worker_profile_internal_mutation',
    'location',
    true
  );

  update public.worker_profiles
  set
    current_location =
      public.st_setsrid(
        public.st_makepoint(
          p_longitude,
          p_latitude
        ),
        4326
      )::public.geography,
    updated_at = now()
  where id = v_worker_id;

  return jsonb_build_object(
    'success', true,
    'worker_id', v_worker_id,
    'expires_at', v_expires
  );
end;
$function$;


create or replace function public.set_worker_services(
  p_service_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_worker_id uuid := auth.uid();
  v_service_count integer;
begin
  if v_worker_id is null then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Authentication required'
    );
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_worker_id
      and p.role = 'worker'::public.user_role
      and p.is_active = true
  ) then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Worker account is inactive'
    );
  end if;

  if not exists (
    select 1
    from public.worker_profiles wp
    where wp.id = v_worker_id
  ) then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Worker profile not found'
    );
  end if;

  if p_service_ids is null
     or array_length(p_service_ids, 1) is null
     or array_length(p_service_ids, 1) = 0 then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'Select at least one service'
    );
  end if;

  select count(*)
  into v_service_count
  from unnest(p_service_ids) as service_id(id)
  join public.services s
    on s.id = service_id.id
  where s.is_active = true;

  if v_service_count <> array_length(p_service_ids, 1) then
    return jsonb_build_object(
      'success',
      false,
      'error',
      'One or more selected services are invalid'
    );
  end if;

  delete from public.worker_services
  where worker_id = v_worker_id;

  insert into public.worker_services (
    worker_id,
    service_id
  )
  select
    v_worker_id,
    service_id.id
  from unnest(p_service_ids) as service_id(id)
  on conflict (worker_id, service_id) do nothing;

  return jsonb_build_object(
    'success',
    true,
    'worker_id',
    v_worker_id,
    'service_count',
    array_length(p_service_ids, 1)
  );
end;
$function$;