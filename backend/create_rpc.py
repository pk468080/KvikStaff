import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

SQL = """
CREATE OR REPLACE FUNCTION admin_get_live_map_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'Admin or service-role access required';
  end if;

  select jsonb_build_object(
    'workers', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'worker_id', w.id,
          'name', p.full_name,
          'status', w.worker_status,
          'latitude', wl.latitude,
          'longitude', wl.longitude,
          'last_seen', wl.recorded_at
        )
      ), '[]'::jsonb)
      from public.worker_profiles w
      join public.profiles p on p.id = w.id
      join (
        select distinct on (worker_id) worker_id, latitude, longitude, recorded_at
        from public.worker_locations
        order by worker_id, recorded_at desc
      ) wl on wl.worker_id = w.id
    ),
    'bookings', (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'booking_id', b.id,
          'status', b.status,
          'latitude', a.latitude,
          'longitude', a.longitude,
          'worker_id', b.worker_id,
          'service_name', s.name
        )
      ), '[]'::jsonb)
      from public.bookings b
      join public.addresses a on a.id = b.address_id
      left join public.services s on s.id = b.service_id
      where b.status in ('assigned', 'on_the_way', 'arrived', 'in_progress')
    )
  ) into v_result;

  return v_result;
END;
$$;
"""

async def main():
    conn = await asyncpg.connect(os.getenv("DATABASE_URL").replace("+asyncpg", ""))
    await conn.execute(SQL)
    print("RPC created successfully!")
    await conn.close()

asyncio.run(main())
