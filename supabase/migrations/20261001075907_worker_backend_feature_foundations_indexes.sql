
create index if not exists
idx_worker_booking_change_requests_occurrence
on public.worker_booking_change_requests(occurrence_id);

create index if not exists
idx_worker_booking_change_requests_reviewed_by
on public.worker_booking_change_requests(reviewed_by);

create index if not exists
idx_worker_booking_incidents_occurrence
on public.worker_booking_incidents(occurrence_id);

create index if not exists
idx_worker_payouts_payout_account
on public.worker_payouts(payout_account_id);

drop trigger if exists worker_payout_accounts_set_updated_at
on public.worker_payout_accounts;
create trigger worker_payout_accounts_set_updated_at
before update on public.worker_payout_accounts
for each row execute function public.set_updated_at();

drop trigger if exists worker_payouts_set_updated_at
on public.worker_payouts;
create trigger worker_payouts_set_updated_at
before update on public.worker_payouts
for each row execute function public.set_updated_at();

drop trigger if exists worker_booking_incidents_set_updated_at
on public.worker_booking_incidents;
create trigger worker_booking_incidents_set_updated_at
before update on public.worker_booking_incidents
for each row execute function public.set_updated_at();

drop trigger if exists worker_booking_change_requests_set_updated_at
on public.worker_booking_change_requests;
create trigger worker_booking_change_requests_set_updated_at
before update on public.worker_booking_change_requests
for each row execute function public.set_updated_at();
;
