CREATE OR REPLACE FUNCTION public.issue_booking_invoice(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings%rowtype;
  v_invoice public.invoices%rowtype;
  v_payment public.payments%rowtype;
  v_number text;
  v_is_admin boolean := public.is_admin();
  v_expected_currency text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.customer_id IS DISTINCT FROM auth.uid()
     AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Booking access denied';
  END IF;

  IF v_booking.status NOT IN (
    'paid'::public.booking_status,
    'assigned'::public.booking_status,
    'on_the_way'::public.booking_status,
    'arrived'::public.booking_status,
    'in_progress'::public.booking_status,
    'completed'::public.booking_status
  ) THEN
    RAISE EXCEPTION 'Booking is not invoiceable';
  END IF;

  -- Customers can only create/retrieve a receipt after service completion.
  -- The admin operations workflow retains its existing ability to issue earlier.
  IF NOT v_is_admin
     AND v_booking.status <> 'completed'::public.booking_status THEN
    RAISE EXCEPTION 'A payment receipt is available only for completed bookings';
  END IF;

  SELECT *
  INTO v_payment
  FROM public.payments
  WHERE booking_id = v_booking.id
    AND status IN (
      'paid'::public.payment_status,
      'partially_refunded'::public.payment_status,
      'refunded'::public.payment_status
    )
  ORDER BY
    CASE WHEN status = 'paid'::public.payment_status THEN 0 ELSE 1 END,
    paid_at DESC NULLS LAST,
    updated_at DESC,
    id DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No successful payment was found for this booking';
  END IF;

  IF v_payment.amount IS DISTINCT FROM v_booking.total_amount THEN
    RAISE EXCEPTION 'Payment amount does not match the booking total';
  END IF;

  v_expected_currency := upper(trim(coalesce(
    v_booking.pricing_snapshot->>'currency',
    'INR'
  )));

  IF upper(trim(v_payment.currency)) IS DISTINCT FROM v_expected_currency THEN
    RAISE EXCEPTION 'Payment currency does not match the booking currency';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices
    WHERE booking_id = v_booking.id
  ) THEN
    SELECT *
    INTO v_invoice
    FROM public.invoices
    WHERE booking_id = v_booking.id;

    RETURN jsonb_build_object(
      'success', true,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'total_amount', v_invoice.total_amount,
      'status', v_invoice.status,
      'idempotent', true
    );
  END IF;

  v_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' ||
    upper(substr(replace(v_booking.id::text, '-', ''), 1, 10));

  INSERT INTO public.invoices (
    booking_id,
    invoice_number,
    currency,
    base_amount,
    platform_fee,
    tax_amount,
    total_amount,
    pricing_snapshot
  )
  VALUES (
    v_booking.id,
    v_number,
    v_payment.currency,
    v_booking.base_amount,
    v_booking.platform_fee,
    v_booking.tax_amount,
    v_booking.total_amount,
    coalesce(v_booking.pricing_snapshot, '{}'::jsonb)
  )
  RETURNING * INTO v_invoice;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'total_amount', v_invoice.total_amount,
    'status', v_invoice.status,
    'idempotent', false
  );
END;
$function$;
