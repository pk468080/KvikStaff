CREATE OR REPLACE FUNCTION public.tempstaff_worker_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT decrypted_secret
  INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'tempstaff_worker_push_secret';

  IF v_secret IS NULL THEN
    RAISE WARNING
      'TempStaff worker push secret is not configured';

    RETURN NEW;
  END IF;

  /*
   * pg_net is the installed HTTP extension used by this
   * database. The previous implementation called
   * supabase_functions.http_request(url, method, headers,
   * body, timeout), but that function signature does not
   * exist in the current database.
   *
   * pg_net queues the HTTP request asynchronously.
   */
  BEGIN
    PERFORM net.http_post(
      url := 'https://gfzlsxlevzezfjoaaghb.supabase.co/functions/v1/send-worker-push',
      body := '{}'::jsonb,
      params := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type',
        'application/json',
        'apikey',
        v_secret
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION
    WHEN OTHERS THEN
      /*
       * Push delivery must never roll back the notification
       * insert, booking finalization, payment finalization,
       * or any other business transaction.
       */
      RAISE WARNING
        'TempStaff worker push dispatch failed: %',
        SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

ALTER FUNCTION public.tempstaff_worker_notification_push()
  SECURITY DEFINER;

ALTER FUNCTION public.tempstaff_worker_notification_push()
  SET search_path TO '';