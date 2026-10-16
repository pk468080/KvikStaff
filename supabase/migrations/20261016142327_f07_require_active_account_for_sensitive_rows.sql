BEGIN;

-- Inactive accounts may read their own profile to understand their account
-- state, but may not mutate that profile.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() = 'service_role' OR public.is_admin() THEN
    NEW.email := (SELECT u.email FROM auth.users u WHERE u.id = NEW.id);
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = NEW.id
        AND u.email IS NOT DISTINCT FROM NEW.email
    ) THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = NEW.id
        AND u.raw_user_meta_data->>'role' = 'worker'
    ) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION
      'Profile changes must originate from an authenticated account';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.id <> auth.uid() THEN
      RAISE EXCEPTION 'You may only create your own profile';
    END IF;

    NEW.role := 'customer'::public.user_role;
    NEW.is_active := true;
    NEW.email := (SELECT u.email FROM auth.users u WHERE u.id = NEW.id);
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_active = true
  ) THEN
    RAISE EXCEPTION 'Active account required';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Profile id cannot be changed';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Role cannot be changed by the account owner';
  END IF;

  IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    RAISE EXCEPTION 'Account status cannot be changed by the account owner';
  END IF;

  NEW.email := (SELECT u.email FROM auth.users u WHERE u.id = NEW.id);
  RETURN NEW;
END;
$function$;

-- Addresses: CRUD is limited to the active owner.
DROP POLICY IF EXISTS addresses_select_own ON public.addresses;
CREATE POLICY addresses_select_own ON public.addresses
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS addresses_insert_own ON public.addresses;
CREATE POLICY addresses_insert_own ON public.addresses
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.is_active = true
        AND p.role = 'customer'::public.user_role
    )
  );

DROP POLICY IF EXISTS addresses_update_own ON public.addresses;
CREATE POLICY addresses_update_own ON public.addresses
  FOR UPDATE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.is_active = true
    )
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS addresses_delete_own ON public.addresses;
CREATE POLICY addresses_delete_own ON public.addresses
  FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid()) AND p.is_active = true
    )
  );

-- Booking rows are available to active participants or active admins.
DROP POLICY IF EXISTS bookings_select_authenticated ON public.bookings;
CREATE POLICY bookings_select_authenticated ON public.bookings
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      (customer_id = (SELECT auth.uid()) OR worker_id = (SELECT auth.uid()))
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.is_active = true
      )
    )
  );

-- Worker applications and documents are private to active workers and admins.
DROP POLICY IF EXISTS worker_applications_select ON public.worker_applications;
CREATE POLICY worker_applications_select ON public.worker_applications
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      worker_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'worker'::public.user_role
          AND p.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS worker_documents_select ON public.worker_documents;
CREATE POLICY worker_documents_select ON public.worker_documents
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      worker_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'worker'::public.user_role
          AND p.is_active = true
      )
    )
  );

DROP POLICY IF EXISTS worker_documents_insert ON public.worker_documents;
CREATE POLICY worker_documents_insert ON public.worker_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    worker_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'worker'::public.user_role
        AND p.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.worker_applications a
      WHERE a.id = worker_documents.application_id
        AND a.worker_id = (SELECT auth.uid())
    )
    AND file_path LIKE ((SELECT auth.uid())::text || '/%')
    AND status = 'pending'::public.worker_document_status
  );

DROP POLICY IF EXISTS worker_documents_update ON public.worker_documents;
CREATE POLICY worker_documents_update ON public.worker_documents
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      worker_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'worker'::public.user_role
          AND p.is_active = true
      )
    )
  )
  WITH CHECK (
    (SELECT public.is_admin())
    OR (
      worker_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'worker'::public.user_role
          AND p.is_active = true
      )
      AND file_path LIKE ((SELECT auth.uid())::text || '/%')
      AND status = 'pending'::public.worker_document_status
    )
  );

-- Location rows require an active worker or active customer with a current
-- assignment. Location inserts remain limited to the assigned worker.
DROP POLICY IF EXISTS worker_locations_insert_own_active_booking
  ON public.worker_locations;
CREATE POLICY worker_locations_insert_own_active_booking
  ON public.worker_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    worker_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (SELECT auth.uid())
        AND p.role = 'worker'::public.user_role
        AND p.is_active = true
    )
    AND EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.id = worker_locations.booking_id
        AND b.worker_id = (SELECT auth.uid())
        AND b.status = ANY (ARRAY[
          'on_the_way'::public.booking_status,
          'arrived'::public.booking_status,
          'in_progress'::public.booking_status
        ])
    )
    AND latitude >= -90 AND latitude <= 90
    AND longitude >= -180 AND longitude <= 180
  );

DROP POLICY IF EXISTS worker_locations_select_scoped
  ON public.worker_locations;
CREATE POLICY worker_locations_select_scoped
  ON public.worker_locations
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      worker_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid())
          AND p.role = 'worker'::public.user_role
          AND p.is_active = true
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.profiles p ON p.id = (SELECT auth.uid())
      WHERE b.id = worker_locations.booking_id
        AND b.customer_id = (SELECT auth.uid())
        AND b.worker_id = worker_locations.worker_id
        AND b.status = ANY (ARRAY[
          'assigned'::public.booking_status,
          'on_the_way'::public.booking_status,
          'arrived'::public.booking_status,
          'in_progress'::public.booking_status
        ])
        AND p.role = 'customer'::public.user_role
        AND p.is_active = true
    )
  );

-- Payments inherit access from active booking participants.
DROP POLICY IF EXISTS payments_select ON public.payments;
CREATE POLICY payments_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.is_active = true
      )
      AND EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.id = payments.booking_id
          AND (b.customer_id = (SELECT auth.uid())
            OR b.worker_id = (SELECT auth.uid()))
      )
    )
  );

-- Ticket contents are private to active owners and active admins.
DROP POLICY IF EXISTS support_tickets_select_owner_or_admin
  ON public.support_tickets;
CREATE POLICY support_tickets_select_owner_or_admin
  ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_admin())
    OR (
      user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = (SELECT auth.uid()) AND p.is_active = true
      )
    )
  );

COMMIT;
