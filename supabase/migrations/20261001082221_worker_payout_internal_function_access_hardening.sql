
revoke all on function public.create_worker_payout_internal(uuid, uuid, numeric, text, text)
from public, anon, authenticated, service_role;
grant execute on function public.create_worker_payout_internal(uuid, uuid, numeric, text, text)
to service_role;

revoke all on function public.apply_worker_payout_provider_update(
  uuid,text,text,bigint,text,text,text,bigint,bigint,jsonb,text,timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_worker_payout_provider_update(
  uuid,text,text,bigint,text,text,text,bigint,bigint,jsonb,text,timestamptz
) to service_role;

revoke all on function public.verify_worker_payout_processor_secret(text)
from public, anon, authenticated;
grant execute on function public.verify_worker_payout_processor_secret(text)
to service_role;
;
