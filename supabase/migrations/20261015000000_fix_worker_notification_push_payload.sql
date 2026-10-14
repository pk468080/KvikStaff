-- Ensure the notification trigger includes the booking_worker_offer_id

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

  BEGIN
    PERFORM net.http_post(
      url :=
        'https://gfzlsxlevzezfjoaaghb.supabase.co/functions/v1/send-worker-push',

      body :=
        jsonb_build_object(
          'type',
          'INSERT',

          'table',
          'notifications',

          'schema',
          'public',

          'record',
          jsonb_build_object(
            'id',
            NEW.id,

            'user_id',
            NEW.user_id,

            'booking_id',
            NEW.booking_id,

            'booking_worker_offer_id',
            NEW.booking_worker_offer_id,

            'title',
            NEW.title,

            'message',
            NEW.message,

            'notification_type',
            NEW.notification_type,

            'created_at',
            NEW.created_at
          ),

          'old_record',
          NULL
        ),

      params :=
        '{}'::jsonb,

      headers :=
        jsonb_build_object(
          'Content-Type',
          'application/json',

          'apikey',
          v_secret
        ),

      timeout_milliseconds := 5000
    );

  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING
        'TempStaff push dispatch failed: %',
        SQLERRM;
  END;

  RETURN NEW;
END;
$function$;
