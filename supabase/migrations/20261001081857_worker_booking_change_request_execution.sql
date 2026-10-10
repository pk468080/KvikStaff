
create unique index if not exists
worker_booking_change_requests_open_unique
on public.worker_booking_change_requests(
  worker_id,
  booking_id,
  coalesce(
    occurrence_id,
    '00000000-0000-0000-0000-000000000000'::uuid
  )
)
where status = 'open';

create or replace function public.worker_create_booking_change_request(
  p_booking_id uuid,
  p_request_type text,
  p_reason text,
  p_requested_start timestamptz default null,
  p_requested_end timestamptz default null,
  p_occurrence_id uuid default null
)
returns public.worker_booking_change_requests
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_worker_id uuid := (select auth.uid());
  v_booking public.bookings%rowtype;
  v_occurrence public.booking_schedule_occurrences%rowtype;
  v_request public.worker_booking_change_requests%rowtype;
  v_request_type text := lower(btrim(coalesce(p_request_type, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_timezone text := 'Asia/Kolkata';
  v_current_start timestamptz;
  v_current_end timestamptz;
  v_new_start_local timestamp;
  v_new_end_local timestamp;
  v_new_date date;
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

  if v_request_type not in ('cancel', 'reschedule') then
    raise exception 'Invalid booking change request type';
  end if;

  if length(v_reason) < 1 or length(v_reason) > 2000 then
    raise exception 'Request reason must be between 1 and 2000 characters';
  end if;

  select coalesce(
    nullif(trim(value->>'value'), ''),
    'Asia/Kolkata'
  )
  into v_timezone
  from public.platform_settings
  where key = 'operations.timezone'
    and is_active = true
  order by updated_at desc
  limit 1;

  v_timezone := coalesce(v_timezone, 'Asia/Kolkata');

  select *
  into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if p_occurrence_id is not null then
    select *
    into v_occurrence
    from public.booking_schedule_occurrences
    where id = p_occurrence_id
      and booking_id = p_booking_id
    for update;

    if not found then
      raise exception 'Booking occurrence not found';
    end if;

    if v_occurrence.worker_id <> v_worker_id then
      raise exception 'Worker is not assigned to this occurrence';
    end if;

    if v_occurrence.status not in ('scheduled', 'assigned') then
      raise exception 'This occurrence can no longer accept worker change requests';
    end if;

    v_current_start := v_occurrence.scheduled_start;
    v_current_end := v_occurrence.scheduled_end;
  else
    if v_booking.worker_id <> v_worker_id then
      raise exception 'Worker is not assigned to this booking';
    end if;

    if v_booking.status <> 'assigned' then
      raise exception 'This booking can no longer accept worker change requests';
    end if;

    v_current_start := v_booking.scheduled_start;
    v_current_end := v_booking.scheduled_end;
  end if;

  if v_request_type = 'cancel' then
    if p_requested_start is not null or p_requested_end is not null then
      raise exception 'Cancellation requests must not include new times';
    end if;
  else
    if p_requested_start is null
       or p_requested_end is null
       or p_requested_end <= p_requested_start then
      raise exception 'A valid requested start and end are required for reschedule requests';
    end if;

    if p_requested_start <= now() then
      raise exception 'Requested start must be in the future';
    end if;

    if v_current_start is null or v_current_end is null then
      raise exception 'Current booking schedule is missing';
    end if;

    if extract(epoch from (p_requested_end - p_requested_start))
       <> extract(epoch from (v_current_end - v_current_start))
    then
      raise exception 'Rescheduling must preserve the original booking duration';
    end if;

    v_new_start_local := p_requested_start at time zone v_timezone;
    v_new_end_local := p_requested_end at time zone v_timezone;
    v_new_date := v_new_start_local::date;

    if v_new_end_local::date <> v_new_date then
      raise exception 'Booking must start and end on the same local date';
    end if;

    if not public.is_booking_within_operating_hours(
      p_requested_start,
      p_requested_end
    ) then
      raise exception 'Requested working hours are outside configured operating hours';
    end if;
  end if;

  if exists (
    select 1
    from public.worker_booking_change_requests r
    where r.worker_id = v_worker_id
      and r.booking_id = p_booking_id
      and r.occurrence_id is not distinct from p_occurrence_id
      and r.status = 'open'
  ) then
    raise exception 'An open worker change request already exists for this booking';
  end if;

  insert into public.worker_booking_change_requests(
    worker_id,
    booking_id,
    occurrence_id,
    request_type,
    reason,
    requested_start,
    requested_end
  )
  values(
    v_worker_id,
    p_booking_id,
    p_occurrence_id,
    v_request_type,
    v_reason,
    p_requested_start,
    p_requested_end
  )
  returning * into v_request;

  return v_request;
end;
$function$;

revoke all on function public.worker_create_booking_change_request(
  uuid,text,text,timestamptz,timestamptz,uuid
) from public;

grant execute on function public.worker_create_booking_change_request(
  uuid,text,text,timestamptz,timestamptz,uuid
) to authenticated;

create or replace function public.admin_execute_worker_booking_change_request(
  p_request_id uuid,
  p_decision text,
  p_admin_notes text default null
)
returns public.worker_booking_change_requests
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_request public.worker_booking_change_requests%rowtype;
  v_booking public.bookings%rowtype;
  v_occurrence public.booking_schedule_occurrences%rowtype;
  v_payment public.payments%rowtype;
  v_refund public.payment_refunds%rowtype;
  v_before jsonb;
  v_status text := lower(btrim(coalesce(p_decision, '')));
  v_notes text := nullif(btrim(coalesce(p_admin_notes, '')), '');
  v_quote jsonb;
  v_timezone text := 'Asia/Kolkata';
  v_local_start timestamp;
  v_local_end timestamp;
  v_date date;
  v_old_date date;
  v_duration_seconds numeric;
  v_new_duration_seconds numeric;
  v_remaining integer;
  v_customer_id uuid;
begin
  if not (select public.is_admin()) then
    raise exception 'Admin access required';
  end if;

  if v_status not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select *
  into v_request
  from public.worker_booking_change_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Worker booking change request not found';
  end if;

  if v_request.status <> 'open' then
    raise exception 'Only open worker change requests can be reviewed';
  end if;

  select *
  into v_booking
  from public.bookings
  where id = v_request.booking_id
  for update;

  if not found then
    raise exception 'Parent booking not found';
  end if;

  v_customer_id := v_booking.customer_id;
  v_before := to_jsonb(v_request);

  if v_status = 'rejected' then
    update public.worker_booking_change_requests
    set
      status = 'rejected',
      admin_notes = v_notes,
      reviewed_at = now(),
      reviewed_by = (select auth.uid()),
      updated_at = now()
    where id = v_request.id
    returning * into v_request;

    perform public.write_admin_audit(
      'admin_reject_worker_booking_change_request',
      'worker_booking_change_request',
      v_request.id,
      v_before,
      to_jsonb(v_request),
      jsonb_build_object('status', 'rejected')
    );

    perform public.admin_create_notification(
      v_request.worker_id,
      'Change request rejected',
      case
        when v_request.request_type = 'cancel'
          then 'Your booking cancellation request was not approved.'
        else 'Your booking reschedule request was not approved.'
      end,
      'worker_booking_change_request',
      v_request.booking_id
    );

    return v_request;
  end if;

  if v_request.occurrence_id is not null then
    select *
    into v_occurrence
    from public.booking_schedule_occurrences
    where id = v_request.occurrence_id
      and booking_id = v_request.booking_id
    for update;

    if not found then
      raise exception 'Booking occurrence not found';
    end if;

    if v_occurrence.worker_id is distinct from v_request.worker_id then
      raise exception 'Worker is no longer assigned to this occurrence';
    end if;
  elsif v_booking.worker_id is distinct from v_request.worker_id then
    raise exception 'Worker is no longer assigned to this booking';
  end if;

  if v_request.request_type = 'cancel' then
    if v_request.occurrence_id is not null then
      perform public.admin_cancel_booking_occurrence(
        v_request.occurrence_id,
        'Worker cancellation request approved: ' ||
        coalesce(v_request.reason, 'worker request')
      );
    else
      if v_booking.fulfillment_type = 'recurring'::public.booking_fulfillment_type then
        raise exception 'Recurring booking cancellations require an occurrence request';
      end if;

      if v_booking.status not in (
        'assigned'::public.booking_status
      ) then
        raise exception 'Booking can no longer be cancelled through this worker request';
      end if;

      select *
      into v_payment
      from public.payments
      where booking_id = v_booking.id
        and status in ('paid','partially_refunded')
      order by updated_at desc
      limit 1
      for update;

      v_quote := public.calculate_cancellation_refund(
        coalesce(v_booking.total_amount, 0),
        v_booking.scheduled_start,
        now()
      );

      perform public.transition_booking_state(
        v_booking.id,
        'cancelled'::public.booking_status,
        null,
        false,
        true
      );

      if v_payment.id is not null
         and coalesce((v_quote->>'refund_amount')::numeric, 0) > 0 then
        if coalesce((
          select sum(pr.amount)
          from public.payment_refunds pr
          where pr.payment_id = v_payment.id
            and pr.status in ('pending','processing','succeeded')
        ), 0) + (v_quote->>'refund_amount')::numeric > v_payment.amount then
          raise exception 'Refund would exceed the remaining refundable amount';
        end if;

        insert into public.payment_refunds(
          payment_id,
          booking_id,
          amount,
          currency,
          reason,
          status,
          requested_by,
          requested_at
        )
        values(
          v_payment.id,
          v_booking.id,
          (v_quote->>'refund_amount')::numeric,
          v_payment.currency,
          'Worker cancellation request approved',
          'pending',
          (select auth.uid()),
          now()
        )
        returning * into v_refund;
      end if;
    end if;
  else
    select coalesce(
      nullif(trim(value->>'value'), ''),
      'Asia/Kolkata'
    )
    into v_timezone
    from public.platform_settings
    where key = 'operations.timezone'
      and is_active = true
    order by updated_at desc
    limit 1;

    v_timezone := coalesce(v_timezone, 'Asia/Kolkata');

    if v_request.requested_start is null
       or v_request.requested_end is null
       or v_request.requested_end <= v_request.requested_start
       or v_request.requested_start <= now() then
      raise exception 'Requested reschedule time is invalid or already passed';
    end if;

    if v_request.occurrence_id is null
       and v_booking.fulfillment_type <> 'scheduled'::public.booking_fulfillment_type then
      raise exception 'Only scheduled bookings can be rescheduled';
    end if;

    if v_request.occurrence_id is not null
       and v_occurrence.status not in ('scheduled','assigned') then
      raise exception 'Occurrence can no longer be rescheduled';
    end if;

    if v_request.occurrence_id is null
       and v_booking.status <> 'assigned'::public.booking_status then
      raise exception 'Booking can no longer be rescheduled';
    end if;

    v_duration_seconds := extract(
      epoch from (
        case
          when v_request.occurrence_id is null
            then v_booking.scheduled_end
          else v_occurrence.scheduled_end
        end
        -
        case
          when v_request.occurrence_id is null
            then v_booking.scheduled_start
          else v_occurrence.scheduled_start
        end
      )
    );

    v_new_duration_seconds := extract(
      epoch from (
        v_request.requested_end -
        v_request.requested_start
      )
    );

    if v_duration_seconds <> v_new_duration_seconds then
      raise exception 'Rescheduling must preserve the original booking duration';
    end if;

    v_local_start := v_request.requested_start at time zone v_timezone;
    v_local_end := v_request.requested_end at time zone v_timezone;
    v_date := v_local_start::date;

    if v_local_end::date <> v_date then
      raise exception 'Booking must start and end on the same local date';
    end if;

    if not public.is_booking_within_operating_hours(
      v_request.requested_start,
      v_request.requested_end
    ) then
      raise exception 'Requested working hours are outside configured operating hours';
    end if;

    if v_request.occurrence_id is null then
      v_old_date :=
        (v_booking.scheduled_start at time zone v_timezone)::date;

      update public.booking_worker_offers
      set
        status = 'cancelled',
        responded_at = coalesce(responded_at, now()),
        updated_at = now()
      where booking_id = v_booking.id
        and status = 'pending';

      perform public.transition_booking_state(
        v_booking.id,
        'searching_worker'::public.booking_status,
        null,
        false,
        true
      );

      update public.bookings
      set
        scheduled_start = v_request.requested_start,
        scheduled_end = v_request.requested_end,
        schedule_start_date = v_date,
        schedule_end_date = v_date,
        daily_start_time = v_local_start::time,
        daily_end_time = v_local_end::time,
        selected_weekdays = array[
          extract(dow from v_date)::smallint
        ],
        off_dates = '{}'::date[],
        updated_at = now()
      where id = v_booking.id;

      update public.booking_schedule_occurrences
      set
        occurrence_date = v_date,
        scheduled_start = v_request.requested_start,
        scheduled_end = v_request.requested_end,
        original_occurrence_date =
          coalesce(original_occurrence_date, v_old_date),
        worker_id = null,
        status = 'scheduled',
        last_modified_at = now(),
        last_modified_by = (select auth.uid()),
        updated_at = now()
      where id = (
        select o.id
        from public.booking_schedule_occurrences o
        where o.booking_id = v_booking.id
        order by o.occurrence_index
        limit 1
      );
    else
      v_old_date := (
        v_occurrence.scheduled_start at time zone v_timezone
      )::date;

      update public.booking_schedule_occurrences
      set
        occurrence_date = v_date,
        scheduled_start = v_request.requested_start,
        scheduled_end = v_request.requested_end,
        original_occurrence_date =
          coalesce(original_occurrence_date, v_old_date),
        worker_id = null,
        status = 'scheduled',
        last_modified_at = now(),
        last_modified_by = (select auth.uid()),
        updated_at = now()
      where id = v_occurrence.id;

      select count(*)
      into v_remaining
      from public.booking_schedule_occurrences o
      where o.booking_id = v_booking.id
        and o.status <> 'cancelled';

      if v_remaining > 0 then
        update public.bookings
        set
          scheduled_start = (
            select min(o.scheduled_start)
            from public.booking_schedule_occurrences o
            where o.booking_id = v_booking.id
              and o.status <> 'cancelled'
          ),
          scheduled_end = (
            select max(o.scheduled_end)
            from public.booking_schedule_occurrences o
            where o.booking_id = v_booking.id
              and o.status <> 'cancelled'
          ),
          updated_at = now()
        where id = v_booking.id;
      end if;
    end if;
  end if;

  update public.worker_booking_change_requests
  set
    status = 'approved',
    admin_notes = v_notes,
    reviewed_at = now(),
    reviewed_by = (select auth.uid()),
    updated_at = now()
  where id = v_request.id
  returning * into v_request;

  perform public.write_admin_audit(
    'admin_approve_worker_booking_change_request',
    'worker_booking_change_request',
    v_request.id,
    v_before,
    to_jsonb(v_request),
    jsonb_build_object(
      'request_type', v_request.request_type,
      'booking_id', v_request.booking_id,
      'occurrence_id', v_request.occurrence_id
    )
  );

  perform public.admin_create_notification(
    v_request.worker_id,
    'Change request approved',
    case
      when v_request.request_type = 'cancel'
        then 'Your booking cancellation request was approved.'
      else 'Your booking reschedule request was approved.'
    end,
    'worker_booking_change_request',
    v_request.booking_id
  );

  if v_customer_id is not null then
    perform public.admin_create_notification(
      v_customer_id,
      case
        when v_request.request_type = 'cancel'
          then 'Booking cancelled'
        else 'Booking rescheduled'
      end,
      case
        when v_request.request_type = 'cancel'
          then 'Your booking was cancelled after a worker change request was approved.'
        when v_request.occurrence_id is not null
          then 'One scheduled occurrence was rescheduled after a worker change request was approved.'
        else
          'Your scheduled booking was rescheduled after a worker change request was approved.'
      end,
      'worker_booking_change_request',
      v_request.booking_id
    );
  end if;

  return v_request;
end;
$function$;

revoke all on function public.admin_execute_worker_booking_change_request(uuid,text,text)
from public;

grant execute on function public.admin_execute_worker_booking_change_request(uuid,text,text)
to authenticated;
;
