BEGIN;

ALTER TABLE public.api_rate_limits
  DROP CONSTRAINT api_rate_limits_route_key_check;

ALTER TABLE public.api_rate_limits
  ADD CONSTRAINT api_rate_limits_route_key_check
  CHECK (
    route_key IN (
      'availability',
      'booking_hold',
      'telegram_link',
      'telegram_webhook',
      'support_message',
      'max_link',
      'max_webhook'
    )
  );

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_route_key text,
  p_subject_hash text
)
RETURNS TABLE(
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_limit integer;
    v_now timestamptz := clock_timestamp();
    v_window_started_at timestamptz;
    v_request_count integer;
BEGIN
    IF p_route_key NOT IN (
        'availability',
        'booking_hold',
        'telegram_link',
        'telegram_webhook',
        'support_message',
        'max_link',
        'max_webhook'
    ) THEN
        RAISE EXCEPTION 'Unsupported rate limit route';
    END IF;

    IF p_subject_hash IS NULL OR p_subject_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid subject hash';
    END IF;

    v_limit := CASE p_route_key
        WHEN 'availability' THEN 30
        WHEN 'booking_hold' THEN 5
        WHEN 'telegram_link' THEN 5
        WHEN 'telegram_webhook' THEN 60
        WHEN 'support_message' THEN 5
        WHEN 'max_link' THEN 5
        WHEN 'max_webhook' THEN 60
    END;

    UPDATE public.api_rate_limit_maintenance
    SET last_cleanup_at = v_now
    WHERE singleton_id = 1
      AND last_cleanup_at <= v_now - interval '1 hour';

    IF FOUND THEN
        WITH stale_rows AS (
            SELECT ctid
            FROM public.api_rate_limits
            WHERE updated_at < v_now - interval '24 hours'
            ORDER BY updated_at ASC
            LIMIT 500
        )
        DELETE FROM public.api_rate_limits AS target
        USING stale_rows
        WHERE target.ctid = stale_rows.ctid;
    END IF;

    INSERT INTO public.api_rate_limits AS current_row (
        route_key,
        subject_hash,
        window_started_at,
        request_count,
        updated_at
    )
    VALUES (
        p_route_key,
        p_subject_hash,
        v_now,
        1,
        v_now
    )
    ON CONFLICT (route_key, subject_hash)
    DO UPDATE SET
        window_started_at = CASE
            WHEN current_row.window_started_at <= v_now - interval '60 seconds'
                THEN v_now
            ELSE current_row.window_started_at
        END,
        request_count = CASE
            WHEN current_row.window_started_at <= v_now - interval '60 seconds'
                THEN 1
            WHEN current_row.request_count < v_limit
                THEN current_row.request_count + 1
            ELSE current_row.request_count
        END,
        updated_at = v_now
    RETURNING
        current_row.window_started_at,
        current_row.request_count
    INTO
        v_window_started_at,
        v_request_count;

    RETURN QUERY
    SELECT
        (v_request_count <= v_limit),
        GREATEST(0, v_limit - v_request_count),
        CASE
            WHEN v_request_count <= v_limit THEN 0
            ELSE GREATEST(
                1,
                CEIL(
                    EXTRACT(
                        EPOCH FROM (
                            v_window_started_at + interval '60 seconds' - v_now
                        )
                    )
                )::integer
            )
        END;
END;
$function$;

COMMIT;
