-- Keep customer cancellation/refund RPCs explicitly scoped to authenticated users.
-- The functions already validate the signed-in customer inside their bodies.
revoke all on function public.cancel_customer_booking(uuid, text) from public;
revoke all on function public.cancel_customer_booking_series(uuid, text) from public;
revoke all on function public.cancel_customer_booking_occurrence(uuid, text) from public;
revoke all on function public.get_customer_booking_refunds(uuid) from public;

grant execute on function public.cancel_customer_booking(uuid, text) to authenticated;
grant execute on function public.cancel_customer_booking_series(uuid, text) to authenticated;
grant execute on function public.cancel_customer_booking_occurrence(uuid, text) to authenticated;
grant execute on function public.get_customer_booking_refunds(uuid) to authenticated;

alter function public.get_customer_booking_refunds(uuid)
  security invoker;;
