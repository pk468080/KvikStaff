-- Customer account deletion with a pseudonymous profile for required historical records.
-- Applied manually in Supabase on 2026-10-10; migration history synchronization is pending.

ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT IF EXISTS account_deletion_requests_status_check;

ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'processing'::text,
    'approved'::text,
    'rejected'::text,
    'cancelled'::text
  ]));

ALTER TABLE public.account_deletion_requests
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT IF EXISTS account_deletion_auth_user_id_only_while_processing;
ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_auth_user_id_only_while_processing
  CHECK (auth_user_id IS NULL OR status = 'processing');

-- A processing request reserves the original Auth ID for safe retry until completion.
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_one_auth_retry_per_user
  ON public.account_deletion_requests (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Treat processing as an active request; do not let a user submit a duplicate request.
DROP INDEX IF EXISTS public.account_deletion_requests_one_pending_per_user;

-- The previous approval RPC only deactivated customer profiles. Re-queue any such
-- "approved" requests whose Auth identity still exists, so the bug is not preserved
-- after this migration. Keep only the newest request pending for each affected user.
WITH legacy_approvals AS (
  SELECT r.id,
         row_number() OVER (
           PARTITION BY r.user_id
           ORDER BY r.requested_at DESC, r.id DESC
         ) AS request_rank,
         EXISTS (
           SELECT 1
           FROM public.account_deletion_requests active_request
           WHERE active_request.user_id = r.user_id
             AND active_request.status = 'pending'
         ) AS has_pending_request
  FROM public.account_deletion_requests r
  JOIN public.profiles p ON p.id = r.user_id
  JOIN auth.users u ON u.id = r.user_id
  WHERE r.status = 'approved'
    AND p.role = 'customer'::public.user_role
)
UPDATE public.account_deletion_requests r
SET status = CASE
      WHEN legacy.request_rank = 1 AND NOT legacy.has_pending_request THEN 'pending'
      ELSE 'cancelled'
    END,
    reason = NULL,
    reviewed_at = CASE
      WHEN legacy.request_rank = 1 AND NOT legacy.has_pending_request THEN NULL
      ELSE r.reviewed_at
    END,
    reviewed_by = CASE
      WHEN legacy.request_rank = 1 AND NOT legacy.has_pending_request THEN NULL
      ELSE r.reviewed_by
    END
FROM legacy_approvals legacy
WHERE r.id = legacy.id;

CREATE UNIQUE INDEX account_deletion_requests_one_active_per_user
  ON public.account_deletion_requests (user_id)
  WHERE status IN ('pending', 'processing');

-- Once a customer is deactivated for deletion, even a still-valid JWT must not allow
-- a direct RLS insert to recreate a deletion request while Auth deletion is retrying.
DROP POLICY IF EXISTS account_deletion_requests_insert_own
  ON public.account_deletion_requests;
CREATE POLICY account_deletion_requests_insert_own
ON public.account_deletion_requests
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'customer'::public.user_role
      AND p.is_active = true
  )
);

-- The profile->Auth FK normally cascades profile deletion. Customer history needs a
-- separate pseudonymous profile, so the FK is removed and its delete behavior is restored
-- here. prepare_customer_account_deletion rekeys all retained FKs to a new profile ID
-- before deleting the original Auth user. Other Auth deletions still delete their profile.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  DELETE FROM public.profiles WHERE id = OLD.id;
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_auth_user_deleted_profile() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS on_auth_user_deleted_profile ON auth.users;
CREATE TRIGGER on_auth_user_deleted_profile
AFTER DELETE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_deleted_profile();

-- Direct use of the legacy RPC must not label a customer/admin account as deleted
-- while the Auth identity still exists. Only worker deactivation may use the legacy path.
CREATE OR REPLACE FUNCTION public.guard_customer_deletion_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NEW.status = 'approved'
     AND EXISTS (
       SELECT 1
       FROM public.profiles p
       JOIN auth.users u ON u.id = p.id
       WHERE p.id = NEW.user_id
         AND p.role <> 'worker'::public.user_role
     ) THEN
    RAISE EXCEPTION
      'Non-worker account deletion must be completed through the admin-action Edge Function'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_customer_deletion_approval() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_customer_deletion_approval
  ON public.account_deletion_requests;
CREATE TRIGGER guard_customer_deletion_approval
BEFORE UPDATE OF status ON public.account_deletion_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_deletion_approval();

CREATE OR REPLACE FUNCTION public.admin_list_account_deletion_requests()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  reason text,
  status text,
  requested_at timestamptz,
  reviewed_at timestamptz,
  full_name text,
  email text,
  phone text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.id, r.user_id, r.reason, r.status, r.requested_at, r.reviewed_at,
         p.full_name, p.email, p.phone
  FROM public.account_deletion_requests r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  ORDER BY
    CASE r.status WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END,
    r.requested_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_account_deletion_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_account_deletion_requests() TO authenticated;

-- Recursively remove common direct-identifier and free-text fields from JSON snapshots,
-- while preserving amounts, currencies, transaction IDs, statuses, and event identifiers.
CREATE OR REPLACE FUNCTION public.redact_customer_pii_jsonb(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF jsonb_typeof(p_value) = 'object' THEN
    SELECT COALESCE(
      jsonb_object_agg(e.key, public.redact_customer_pii_jsonb(e.value)),
      '{}'::jsonb
    )
    INTO v_result
    FROM jsonb_each(p_value) AS e(key, value)
    WHERE lower(e.key) NOT IN (
      'email', 'contact', 'phone', 'phone_number', 'mobile', 'name',
      'full_name', 'first_name', 'last_name', 'username', 'address',
      'billing_address', 'shipping_address', 'address_line', 'address_line_1',
      'address_line_2', 'addresses', 'latitude', 'longitude', 'location', 'coordinates',
      'avatar_url', 'customer', 'customer_details', 'customer_name', 'customer_email',
      'customer_phone', 'customer_id', 'customer_user_id', 'user_id', 'user_uuid',
      'profile_id', 'user_name', 'user_email', 'user_phone', 'recipient', 'recipient_name',
      'recipient_email', 'recipient_phone', 'receiver_name', 'contact_name', 'shipping',
      'billing', 'email_address', 'billing_email', 'billing_name', 'shipping_name',
      'notes', 'customer_note', 'customer_notes', 'delivery_instruction', 'reason',
      'review_reason', 'moderation_reason', 'admin_notes', 'subject', 'comment', 'message',
      'body', 'text', 'vpa', 'upi_id', 'description', 'company_name', 'device_token',
      'push_token', 'access_token', 'refresh_token', 'authorization', 'account_number',
      'ifsc', 'bank_account', 'account_holder_name', 'contact_email', 'contact_phone'
    );
    RETURN v_result;
  ELSIF jsonb_typeof(p_value) = 'array' THEN
    SELECT COALESCE(
      jsonb_agg(public.redact_customer_pii_jsonb(e.value) ORDER BY e.ordinality),
      '[]'::jsonb
    )
    INTO v_result
    FROM jsonb_array_elements(p_value) WITH ORDINALITY AS e(value, ordinality);
    RETURN v_result;
  END IF;

  RETURN p_value;
END;
$function$;

REVOKE ALL ON FUNCTION public.redact_customer_pii_jsonb(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_customer_account_deletion(
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_request public.account_deletion_requests%ROWTYPE;
  v_role public.user_role;
  v_auth_user_id uuid;
  v_profile_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
  INTO v_request
  FROM public.account_deletion_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found';
  END IF;

  -- Once preparation committed, all PII scrubbing and FK rekeying committed atomically.
  -- Retry returns the original Auth ID and pseudonymous profile ID without repeating work.
  IF v_request.status = 'processing' THEN
    IF v_request.auth_user_id IS NULL THEN
      RAISE EXCEPTION 'Processing request is missing its Auth retry identifier';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_request.user_id
        AND p.role = 'customer'::public.user_role
        AND p.is_active = false
        AND p.full_name = 'Deleted customer'
        AND p.company_name = 'Deleted customer'
        AND p.email IS NULL
        AND p.phone IS NULL
        AND p.avatar_url IS NULL
    ) THEN
      RAISE EXCEPTION 'Pseudonymous customer profile is missing or not fully scrubbed';
    END IF;

    RETURN jsonb_build_object(
      'requires_erasure', true,
      'auth_user_id', v_request.auth_user_id,
      'profile_id', v_request.user_id,
      'status', 'processing'
    );
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Deletion request is no longer pending or processing';
  END IF;

  v_auth_user_id := v_request.user_id;

  SELECT p.role
  INTO v_role
  FROM public.profiles p
  WHERE p.id = v_auth_user_id
  FOR UPDATE;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Account profile not found';
  END IF;

  -- Preserve the existing worker account deactivation workflow, but never route an
  -- administrator account through the legacy profile-deactivation-only RPC.
  IF v_role = 'worker'::public.user_role THEN
    RETURN jsonb_build_object(
      'requires_erasure', false,
      'role', v_role::text,
      'status', v_request.status
    );
  END IF;

  IF v_role <> 'customer'::public.user_role THEN
    RAISE EXCEPTION 'Only customer accounts can use the account-erasure workflow'
      USING ERRCODE = '42501';
  END IF;

  -- Never erase a customer account while a current/future service remains active.
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.customer_id = v_auth_user_id
      AND b.status IN (
        'pending_payment'::public.booking_status,
        'paid'::public.booking_status,
        'searching_worker'::public.booking_status,
        'assigned'::public.booking_status,
        'on_the_way'::public.booking_status,
        'arrived'::public.booking_status,
        'in_progress'::public.booking_status
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.booking_schedule_occurrences o
    JOIN public.bookings b ON b.id = o.booking_id
    WHERE b.customer_id = v_auth_user_id
      AND o.status IN ('scheduled', 'assigned', 'on_the_way', 'arrived', 'in_progress')
  ) THEN
    RAISE EXCEPTION
      'Customer has active bookings or service occurrences; resolve them before deletion'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.addresses a
    JOIN public.bookings b ON b.address_id = a.id
    WHERE a.user_id = v_auth_user_id
      AND b.customer_id <> v_auth_user_id
  ) THEN
    RAISE EXCEPTION
      'A saved address is referenced by another customer booking; manual review is required'
      USING ERRCODE = '55000';
  END IF;

  v_profile_id := gen_random_uuid();

  INSERT INTO public.profiles (
    id, full_name, phone, email, role, avatar_url, is_active,
    created_at, updated_at, company_name
  ) VALUES (
    v_profile_id, 'Deleted customer', NULL, NULL, 'customer'::public.user_role,
    NULL, false, now(), now(), 'Deleted customer'
  );

  -- Deactivate and scrub the original profile. Its email is cleared automatically when
  -- that old profile is removed by the Auth-delete trigger after FK references are rekeyed.
  UPDATE public.profiles
  SET full_name = 'Deleted customer',
      phone = NULL,
      avatar_url = NULL,
      company_name = 'Deleted customer',
      is_active = false,
      updated_at = now()
  WHERE id = v_auth_user_id;

  -- Preserve address rows only when required by historic bookings; remove their location.
  UPDATE public.addresses a
  SET user_id = v_profile_id,
      label = NULL,
      address_line = 'Address removed following account deletion',
      latitude = 0,
      longitude = 0,
      location = public.ST_SetSRID(public.ST_MakePoint(0, 0), 4326)::public.geography
  WHERE a.user_id = v_auth_user_id
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.address_id = a.id AND b.customer_id = v_auth_user_id
    );

  DELETE FROM public.addresses a
  WHERE a.user_id = v_auth_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.bookings b WHERE b.address_id = a.id
    );

  DELETE FROM public.customer_favourite_services WHERE customer_id = v_auth_user_id;
  DELETE FROM public.notifications WHERE user_id = v_auth_user_id;
  DELETE FROM public.push_tokens WHERE user_id = v_auth_user_id;
  DELETE FROM public.worker_push_deliveries WHERE user_id = v_auth_user_id;
  DELETE FROM public.message_read_receipts WHERE user_id = v_auth_user_id;
  DELETE FROM public.messages WHERE sender_id = v_auth_user_id;
  DELETE FROM public.idempotency_keys WHERE user_id = v_auth_user_id;
  DELETE FROM public.service_availability_requests WHERE customer_id = v_auth_user_id;

  DELETE FROM public.worker_locations wl
  WHERE wl.booking_id IN (
    SELECT b.id FROM public.bookings b WHERE b.customer_id = v_auth_user_id
  );

  DELETE FROM public.booking_otps bo
  WHERE bo.booking_id IN (
    SELECT b.id FROM public.bookings b WHERE b.customer_id = v_auth_user_id
  )
  OR bo.occurrence_id IN (
    SELECT o.id
    FROM public.booking_schedule_occurrences o
    JOIN public.bookings b ON b.id = o.booking_id
    WHERE b.customer_id = v_auth_user_id
  );

  DELETE FROM public.conversations c
  WHERE c.customer_id = v_auth_user_id
     OR EXISTS (
       SELECT 1 FROM public.bookings b
       WHERE b.id = c.booking_id AND b.customer_id = v_auth_user_id
     );

  UPDATE public.bookings
  SET notes = NULL,
      pricing_snapshot = CASE
        WHEN pricing_snapshot IS NULL THEN NULL
        ELSE public.redact_customer_pii_jsonb(pricing_snapshot)
      END,
      updated_at = now()
  WHERE customer_id = v_auth_user_id;

  UPDATE public.booking_schedule_occurrences o
  SET pricing_snapshot = public.redact_customer_pii_jsonb(o.pricing_snapshot),
      updated_at = now()
  WHERE EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = o.booking_id AND b.customer_id = v_auth_user_id
  );

  UPDATE public.invoices i
  SET pricing_snapshot = public.redact_customer_pii_jsonb(i.pricing_snapshot)
  WHERE EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = i.booking_id AND b.customer_id = v_auth_user_id
  );

  UPDATE public.reviews r
  SET customer_id = CASE WHEN r.customer_id = v_auth_user_id THEN v_profile_id ELSE r.customer_id END,
      moderated_by = CASE WHEN r.moderated_by = v_auth_user_id THEN v_profile_id ELSE r.moderated_by END,
      comment = CASE WHEN r.customer_id = v_auth_user_id THEN NULL ELSE r.comment END,
      moderation_reason = CASE WHEN r.customer_id = v_auth_user_id THEN NULL ELSE r.moderation_reason END
  WHERE r.customer_id = v_auth_user_id OR r.moderated_by = v_auth_user_id;

  UPDATE public.support_tickets
  SET user_id = v_profile_id,
      subject = 'Content removed following account deletion',
      description = 'Content removed following account deletion',
      admin_notes = NULL,
      updated_at = now()
  WHERE user_id = v_auth_user_id;

  UPDATE public.worker_booking_incidents i
  SET description = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = i.booking_id AND b.customer_id = v_auth_user_id
        ) THEN 'Content removed following account deletion'
        ELSE i.description
      END,
      admin_notes = CASE
        WHEN EXISTS (
          SELECT 1 FROM public.bookings b
          WHERE b.id = i.booking_id AND b.customer_id = v_auth_user_id
        ) THEN NULL
        ELSE i.admin_notes
      END,
      resolved_by = CASE WHEN i.resolved_by = v_auth_user_id THEN v_profile_id ELSE i.resolved_by END,
      updated_at = now()
  WHERE i.resolved_by = v_auth_user_id
     OR EXISTS (
       SELECT 1 FROM public.bookings b
       WHERE b.id = i.booking_id AND b.customer_id = v_auth_user_id
     );

  UPDATE public.worker_booking_change_requests cr
  SET reason = 'Content removed following account deletion',
      admin_notes = NULL,
      updated_at = now()
  WHERE EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.id = cr.booking_id AND b.customer_id = v_auth_user_id
  );

  UPDATE public.refund_requests rr
  SET reason = NULL,
      updated_at = now()
  WHERE rr.booking_id IN (
    SELECT b.id FROM public.bookings b WHERE b.customer_id = v_auth_user_id
  );

  UPDATE public.payment_refunds pr
  SET requested_by = CASE WHEN pr.requested_by = v_auth_user_id THEN v_profile_id ELSE pr.requested_by END,
      reason = NULL,
      failure_reason = NULL,
      updated_at = now()
  WHERE pr.requested_by = v_auth_user_id
     OR pr.booking_id IN (
       SELECT b.id FROM public.bookings b WHERE b.customer_id = v_auth_user_id
     );

  UPDATE public.payment_webhook_events e
  SET payload = public.redact_customer_pii_jsonb(e.payload),
      error_message = CASE
        WHEN e.error_message IS NULL THEN NULL
        ELSE 'Details redacted following account deletion'
      END,
      updated_at = now()
  WHERE EXISTS (
    SELECT 1
    FROM public.payments p
    JOIN public.bookings b ON b.id = p.booking_id
    WHERE b.customer_id = v_auth_user_id
      AND (
        (p.provider_order_id IS NOT NULL
          AND e.payload::text LIKE '%' || p.provider_order_id || '%')
        OR (p.provider_payment_id IS NOT NULL
          AND e.payload::text LIKE '%' || p.provider_payment_id || '%')
      )
  );

  -- Remove historical request reasons and old user IDs from prior audit snapshots.
  UPDATE public.admin_audit_logs al
  SET before_data = CASE
        WHEN jsonb_typeof(al.before_data) = 'object'
          THEN public.redact_customer_pii_jsonb(al.before_data) - 'id'
        ELSE al.before_data
      END,
      after_data = CASE
        WHEN jsonb_typeof(al.after_data) = 'object'
          THEN public.redact_customer_pii_jsonb(al.after_data) - 'id'
        ELSE al.after_data
      END,
      metadata = public.redact_customer_pii_jsonb(al.metadata)
  WHERE al.entity_type = 'account_deletion_request'
    AND al.entity_id IN (
      SELECT r.id FROM public.account_deletion_requests r WHERE r.user_id = v_auth_user_id
    );

  -- Keep any legacy audit actor references valid when the original profile is removed.
  UPDATE public.admin_audit_logs
  SET admin_id = v_profile_id
  WHERE admin_id = v_auth_user_id;

  -- Move profile-oriented audit entries to the pseudonymous profile and redact snapshots.
  UPDATE public.admin_audit_logs al
  SET entity_id = v_profile_id,
      before_data = CASE
        WHEN jsonb_typeof(al.before_data) = 'object'
          THEN public.redact_customer_pii_jsonb(al.before_data) - 'id'
        ELSE al.before_data
      END,
      after_data = CASE
        WHEN jsonb_typeof(al.after_data) = 'object'
          THEN public.redact_customer_pii_jsonb(al.after_data) - 'id'
        ELSE al.after_data
      END,
      metadata = public.redact_customer_pii_jsonb(al.metadata)
  WHERE al.entity_id = v_auth_user_id;

  -- Rekey all direct FK references before deleting the original Auth-backed profile.
  UPDATE public.booking_status_history
  SET changed_by = v_profile_id
  WHERE changed_by = v_auth_user_id;

  UPDATE public.booking_schedule_occurrences
  SET last_modified_by = v_profile_id
  WHERE last_modified_by = v_auth_user_id;

  UPDATE public.bookings
  SET customer_id = CASE WHEN customer_id = v_auth_user_id THEN v_profile_id ELSE customer_id END,
      journey_started_by = CASE WHEN journey_started_by = v_auth_user_id THEN v_profile_id ELSE journey_started_by END,
      started_by = CASE WHEN started_by = v_auth_user_id THEN v_profile_id ELSE started_by END,
      updated_at = now()
  WHERE customer_id = v_auth_user_id
     OR journey_started_by = v_auth_user_id
     OR started_by = v_auth_user_id;

  UPDATE public.account_deletion_requests
  SET user_id = v_profile_id,
      auth_user_id = CASE WHEN id = p_request_id THEN v_auth_user_id ELSE NULL END,
      reason = NULL,
      status = CASE WHEN id = p_request_id THEN 'processing' ELSE status END,
      reviewed_at = CASE WHEN id = p_request_id THEN COALESCE(reviewed_at, now()) ELSE reviewed_at END,
      reviewed_by = CASE WHEN id = p_request_id THEN COALESCE(reviewed_by, auth.uid()) ELSE reviewed_by END
  WHERE user_id = v_auth_user_id;

  PERFORM public.write_admin_audit(
    'prepare_account_deletion',
    'account_deletion_request',
    p_request_id,
    jsonb_build_object('status', v_request.status),
    jsonb_build_object(
      'status', 'processing',
      'identity_fields_scrubbed', true,
      'profile_rekeyed', true,
      'prior_request_reasons_redacted', true
    )
  );

  RETURN jsonb_build_object(
    'requires_erasure', true,
    'auth_user_id', v_auth_user_id,
    'profile_id', v_profile_id,
    'status', 'processing'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_customer_account_deletion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_customer_account_deletion(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_customer_account_deletion(
  p_request_id uuid,
  p_auth_user_id uuid,
  p_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_request public.account_deletion_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
  END IF;

  SELECT r.*
  INTO v_request
  FROM public.account_deletion_requests r
  WHERE r.id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Deletion request not found';
  END IF;

  IF v_request.user_id <> p_profile_id THEN
    RAISE EXCEPTION 'Deletion request does not match the retained profile';
  END IF;

  IF v_request.status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', true,
      'request_id', p_request_id,
      'status', 'approved'
    );
  END IF;

  IF v_request.status <> 'processing' THEN
    RAISE EXCEPTION 'Deletion request is not being processed';
  END IF;

  IF v_request.auth_user_id IS DISTINCT FROM p_auth_user_id THEN
    RAISE EXCEPTION 'Deletion request does not match the Auth identity being removed';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_auth_user_id) THEN
    RAISE EXCEPTION 'Supabase Auth identity still exists; deletion is not complete';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_profile_id) THEN
    RAISE EXCEPTION 'Retained pseudonymous profile ID unexpectedly has an Auth identity';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_profile_id
      AND p.role = 'customer'::public.user_role
      AND p.is_active = false
      AND p.full_name = 'Deleted customer'
      AND p.company_name = 'Deleted customer'
      AND p.email IS NULL
      AND p.phone IS NULL
      AND p.avatar_url IS NULL
  ) THEN
    RAISE EXCEPTION 'Pseudonymous customer profile is missing or not fully scrubbed';
  END IF;

  UPDATE public.account_deletion_requests
  SET status = 'approved',
      auth_user_id = NULL,
      reason = NULL,
      reviewed_at = COALESCE(reviewed_at, now()),
      reviewed_by = COALESCE(reviewed_by, auth.uid())
  WHERE id = p_request_id;

  PERFORM public.write_admin_audit(
    'complete_account_deletion',
    'account_deletion_request',
    p_request_id,
    jsonb_build_object('status', 'processing'),
    jsonb_build_object('status', 'approved', 'auth_identity_deleted', true)
  );

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'status', 'approved'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_customer_account_deletion(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_customer_account_deletion(uuid, uuid, uuid) TO authenticated;
