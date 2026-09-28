create or replace function public.admin_set_customer_active(
  p_customer_id uuid,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_profile public.profiles%rowtype;
  v_sessions_invalidated integer := 0;
  v_refresh_tokens_revoked integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_customer_id
    and role = 'customer'::public.user_role
  for update;

  if not found then
    raise exception 'Customer not found';
  end if;

  v_before := to_jsonb(v_profile);

  update public.profiles
  set is_active = p_is_active,
      updated_at = now()
  where id = p_customer_id;

  if p_is_active = false then
    update auth.refresh_tokens
    set revoked = true,
        updated_at = now()
    where user_id = p_customer_id::text
      and coalesce(revoked, false) = false;

    get diagnostics v_refresh_tokens_revoked = row_count;

    update auth.sessions
    set not_after = least(coalesce(not_after, now()), now()),
        updated_at = now()
    where user_id = p_customer_id
      and (not_after is null or not_after > now());

    get diagnostics v_sessions_invalidated = row_count;
  end if;

  select to_jsonb(p)
  into v_after
  from public.profiles p
  where p.id = p_customer_id;

  perform public.write_admin_audit(
    'admin_set_customer_active',
    'customer',
    p_customer_id,
    v_before,
    v_after,
    jsonb_build_object(
      'is_active', p_is_active,
      'refresh_tokens_revoked', v_refresh_tokens_revoked,
      'sessions_invalidated', v_sessions_invalidated
    )
  );

  return jsonb_build_object(
    'success', true,
    'customer_id', p_customer_id,
    'is_active', p_is_active,
    'refresh_tokens_revoked', v_refresh_tokens_revoked,
    'sessions_invalidated', v_sessions_invalidated
  );
end;
$function$;

create or replace function public.admin_remove_worker(
  p_worker_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_before jsonb;
  v_after jsonb;
  v_worker public.worker_profiles%rowtype;
  v_profile public.profiles%rowtype;
  v_sessions_invalidated integer := 0;
  v_refresh_tokens_revoked integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required';
  end if;

  select *
  into v_worker
  from public.worker_profiles
  where id = p_worker_id
  for update;

  if not found then
    raise exception 'Worker not found';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_worker_id
  for update;

  if not found then
    raise exception 'Worker profile not found';
  end if;

  v_before := jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'worker', to_jsonb(v_worker)
  );

  update public.profiles
  set is_active = false,
      updated_at = now()
  where id = p_worker_id;

  update public.worker_profiles
  set worker_status = 'suspended'::public.worker_status,
      is_verified = false,
      updated_at = now()
  where id = p_worker_id;

  update auth.refresh_tokens
  set revoked = true,
      updated_at = now()
  where user_id = p_worker_id::text
    and coalesce(revoked, false) = false;

  get diagnostics v_refresh_tokens_revoked = row_count;

  update auth.sessions
  set not_after = least(coalesce(not_after, now()), now()),
      updated_at = now()
  where user_id = p_worker_id
    and (not_after is null or not_after > now());

  get diagnostics v_sessions_invalidated = row_count;

  select *
  into v_worker
  from public.worker_profiles
  where id = p_worker_id;

  select *
  into v_profile
  from public.profiles
  where id = p_worker_id;

  v_after := jsonb_build_object(
    'profile', to_jsonb(v_profile),
    'worker', to_jsonb(v_worker)
  );

  perform public.write_admin_audit(
    'admin_remove_worker',
    'worker',
    p_worker_id,
    v_before,
    v_after,
    jsonb_build_object(
      'refresh_tokens_revoked', v_refresh_tokens_revoked,
      'sessions_invalidated', v_sessions_invalidated
    )
  );

  return jsonb_build_object(
    'success', true,
    'worker_id', p_worker_id,
    'refresh_tokens_revoked', v_refresh_tokens_revoked,
    'sessions_invalidated', v_sessions_invalidated
  );
end;
$function$;
