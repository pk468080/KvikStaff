create or replace function public.register_worker_push_token(
  p_token text,
  p_platform text default null
)
returns public.push_tokens
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_worker_id uuid := auth.uid();
  v_row public.push_tokens%rowtype;
  v_token text := trim(coalesce(p_token, ''));
  v_platform text := nullif(lower(trim(coalesce(p_platform, ''))), '');
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

  if v_token = ''
     or length(v_token) > 255
     or v_token !~ '^ExponentPushToken\[[^\]]+\]$' then
    raise exception 'Invalid Expo push token';
  end if;

  if v_platform is not null
     and v_platform not in ('android','ios','web') then
    raise exception 'Invalid push token platform';
  end if;

  select *
  into v_row
  from public.push_tokens
  where token = v_token
  for update;

  if found then
    update public.push_tokens
    set user_id = v_worker_id,
        platform = v_platform,
        is_active = true,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;
  else
    insert into public.push_tokens (
      user_id,
      token,
      platform,
      is_active
    )
    values (
      v_worker_id,
      v_token,
      v_platform,
      true
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$function$;

revoke all on function public.register_worker_push_token(text,text) from public;
grant execute on function public.register_worker_push_token(text,text) to authenticated;
