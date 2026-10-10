
alter table public.worker_payouts
  add column if not exists last_reconciled_at timestamptz,
  add column if not exists reconciliation_attempts integer not null default 0,
  add column if not exists reconciliation_error text;

create or replace function public.verify_worker_payout_processor_secret(
  p_secret text
)
returns boolean
language sql
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'tempstaff_payout_processor_secret'
      and decrypted_secret = p_secret
  );
$function$;

revoke all on function public.verify_worker_payout_processor_secret(text) from public;
grant execute on function public.verify_worker_payout_processor_secret(text) to service_role;
;
