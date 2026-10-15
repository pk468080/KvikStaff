-- Do not recycle the same workers when an instant-booking offer expires.
--
-- dispatch_booking_worker_offers_internal() already excludes workers who
-- have a pending or declined offer for this booking. Expired offers must be
-- excluded as well, otherwise the retry loop can keep selecting the same
-- nearest batch every time the offer-expiry worker runs.
--
-- Fail closed if the live function body differs from the audited clause.
-- This protects against silently patching an unexpected dispatcher version.

DO $migration$
DECLARE
  v_function_oid oid :=
    'public.dispatch_booking_worker_offers_internal(uuid)'::regprocedure::oid;
  v_definition text;
  v_original_clause constant text :=
    $old$and bwo.status in ('pending', 'declined')$old$;
  v_corrected_clause constant text :=
    $new$and bwo.status in ('pending', 'declined', 'expired')$new$;
  v_occurrences integer;
BEGIN
  SELECT pg_get_functiondef(v_function_oid)
  INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION
      'Cannot patch instant-booking dispatcher: function definition is missing';
  END IF;

  v_occurrences :=
    (
      char_length(v_definition)
      - char_length(replace(v_definition, v_original_clause, ''))
    ) / char_length(v_original_clause);

  IF v_occurrences = 0 THEN
    IF position(v_corrected_clause IN v_definition) > 0 THEN
      RAISE NOTICE
        'Expired-offer exclusion is already present; no change required';
      RETURN;
    END IF;

    RAISE EXCEPTION
      'Cannot patch instant-booking dispatcher: expected candidate exclusion clause was not found';
  END IF;

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION
      'Cannot patch instant-booking dispatcher: expected one candidate exclusion clause, found %',
      v_occurrences;
  END IF;

  EXECUTE replace(
    v_definition,
    v_original_clause,
    v_corrected_clause
  );

  SELECT pg_get_functiondef(v_function_oid)
  INTO v_definition;

  IF position(v_corrected_clause IN v_definition) = 0 THEN
    RAISE EXCEPTION
      'Dispatcher patch verification failed: expired offers are not excluded';
  END IF;
END;
$migration$;
