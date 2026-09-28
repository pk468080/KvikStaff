-- Persist Expo push tickets/receipts and process delayed delivery failures.

create table if not exists public.worker_push_deliveries (
  id uuid primary key default gen_random_uuid(),

  notification_id uuid not null
    references public.notifications(id)
    on delete cascade,

  user_id uuid not null
    references public.profiles(id)
    on delete cascade,

  push_token_id uuid
    references public.push_tokens(id)
    on delete set null,

  token_hash text not null,

  expo_ticket_id text,

  ticket_status text not null default 'pending'
    check (
      ticket_status in (
        'pending',
        'ok',
        'error'
      )
    ),

  ticket_error text,

  receipt_status text
    check (
      receipt_status in (
        'pending',
        'ok',
        'error',
        'expired',
        'not_applicable'
      )
    ),

  receipt_error text,

  sent_at timestamptz not null
    default now(),

  receipt_checked_at timestamptz,

  created_at timestamptz not null
    default now(),

  unique (
    notification_id,
    push_token_id
  )
);

create unique index if not exists
worker_push_deliveries_ticket_id_key
  on public.worker_push_deliveries (
    expo_ticket_id
  )
  where expo_ticket_id is not null;

create index if not exists
idx_worker_push_deliveries_receipt_queue
  on public.worker_push_deliveries (
    sent_at
  )
  where expo_ticket_id is not null
    and receipt_status = 'pending';

alter table
  public.worker_push_deliveries
enable row level security;

revoke all
on table public.worker_push_deliveries
from anon;

revoke all
on table public.worker_push_deliveries
from authenticated;

select cron.unschedule(
  'process_worker_push_receipts_every_5_minutes'
)
where exists (
  select 1
  from cron.job
  where jobname =
    'process_worker_push_receipts_every_5_minutes'
);

select cron.schedule(
  'process_worker_push_receipts_every_5_minutes',
  '*/5 * * * *',

  $job$
    select net.http_post(
      url :=
        'https://gfzlsxlevzezfjoaaghb.supabase.co/functions/v1/process-worker-push-receipts',

      headers :=
        jsonb_build_object(
          'Content-Type',
          'application/json',

          'apikey',
          (
            select decrypted_secret
            from vault.decrypted_secrets
            where name =
              'tempstaff_worker_push_secret'
            limit 1
          )
        ),

      body :=
        '{}'::jsonb,

      timeout_milliseconds :=
        10000

    ) as request_id;
  $job$
);