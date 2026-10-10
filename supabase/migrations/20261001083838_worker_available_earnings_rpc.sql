
create or replace function public.worker_get_available_earnings()
returns jsonb
language sql
security definer
set search_path to ''
as $function$
  with worker_net as (
    select coalesce(sum(e.net_amount), 0)::numeric as net_earnings
    from public.worker_earnings e
    where e.worker_id = (select auth.uid())
  ),
  allocated as (
    select coalesce(sum(i.amount), 0)::numeric as allocated_amount
    from public.worker_payout_items i
    join public.worker_payouts p on p.id = i.payout_id
    join public.worker_earnings e on e.id = i.earning_id
    where e.worker_id = (select auth.uid())
      and p.status in ('queued','pending','processing','processed')
  )
  select jsonb_build_object(
    'gross_earnings',
      coalesce((
        select sum(e.gross_amount)
        from public.worker_earnings e
        where e.worker_id = (select auth.uid())
      ), 0),
    'platform_fees',
      coalesce((
        select sum(e.platform_fee)
        from public.worker_earnings e
        where e.worker_id = (select auth.uid())
      ), 0),
    'net_earnings',
      (select net_earnings from worker_net),
    'allocated_amount',
      (select allocated_amount from allocated),
    'available_amount',
      greatest(
        0,
        (select net_earnings from worker_net)
        - (select allocated_amount from allocated)
      )
  );
$function$;

revoke all on function public.worker_get_available_earnings()
from public;

grant execute on function public.worker_get_available_earnings()
to authenticated;
;
