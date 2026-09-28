create index if not exists worker_push_deliveries_push_token_id_idx
  on public.worker_push_deliveries (push_token_id)
  where push_token_id is not null;

create index if not exists worker_push_deliveries_user_id_idx
  on public.worker_push_deliveries (user_id);