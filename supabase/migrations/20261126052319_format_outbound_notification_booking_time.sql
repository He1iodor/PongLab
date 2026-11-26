
BEGIN;

CREATE OR REPLACE FUNCTION public.format_outbound_notification_booking_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_match text[];
    v_notification_id uuid;
    v_start_at timestamptz;
    v_timezone text;
    v_formatted text;
    v_text text;
BEGIN
    IF NEW.idempotency_key IS NULL THEN
        RETURN NEW;
    END IF;

    v_match := pg_catalog.regexp_match(
        NEW.idempotency_key,
        '^account-notification:(max:)?([0-9a-fA-F-]{36})$'
    );

    IF v_match IS NULL THEN
        RETURN NEW;
    END IF;

    v_notification_id := v_match[2]::uuid;

    SELECT
        b.start_at,
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM pg_catalog.pg_timezone_names AS tz
                WHERE tz.name = NULLIF(s.timezone, '')
            )
            THEN s.timezone
            ELSE 'Europe/Moscow'
        END
    INTO
        v_start_at,
        v_timezone
    FROM public.account_notifications AS an
    JOIN public.bookings AS b
      ON b.id = an.booking_id
    JOIN public.studio_tables AS st
      ON st.id = b.table_id
    JOIN public.studios AS s
      ON s.id = st.studio_id
    WHERE an.id = v_notification_id;

    IF NOT FOUND OR v_start_at IS NULL THEN
        RETURN NEW;
    END IF;

    v_formatted := pg_catalog.to_char(
        v_start_at AT TIME ZONE v_timezone,
        'HH24:MI, DD-MM-YYYY'
    );

    IF NEW.payload ? 'variables'
       AND NEW.payload #>> '{variables,booking_start}' IS NOT NULL
    THEN
        NEW.payload := pg_catalog.jsonb_set(
            NEW.payload,
            '{variables,booking_start}',
            pg_catalog.to_jsonb(v_formatted),
            true
        );
    END IF;

    IF NEW.payload ? 'text'
       AND pg_catalog.jsonb_typeof(NEW.payload -> 'text') = 'string'
    THEN
        v_text := NEW.payload ->> 'text';

        v_text := pg_catalog.regexp_replace(
            v_text,
            'Начало:[[:space:]]*[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]]+[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?([+-][0-9]{2}(:[0-9]{2})?|Z)',
            'Начало: ' || v_formatted
        );

        NEW.payload := pg_catalog.jsonb_set(
            NEW.payload,
            '{text}',
            pg_catalog.to_jsonb(v_text),
            true
        );
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.format_outbound_notification_booking_time()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS messaging_outbox_format_booking_time
ON public.messaging_outbox;

CREATE TRIGGER messaging_outbox_format_booking_time
BEFORE INSERT ON public.messaging_outbox
FOR EACH ROW
EXECUTE FUNCTION public.format_outbound_notification_booking_time();

COMMIT;
