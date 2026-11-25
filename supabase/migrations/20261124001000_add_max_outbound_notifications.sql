
BEGIN;

-- ============================================================
-- 1. ALLOW TELEGRAM AND MAX IN THE EXISTING OUTBOX
-- ============================================================

ALTER TABLE public.messaging_outbox
    DROP CONSTRAINT IF EXISTS messaging_outbox_channel_check;

ALTER TABLE public.messaging_outbox
    ADD CONSTRAINT messaging_outbox_channel_check
    CHECK (channel IN ('telegram', 'max'));


-- ============================================================
-- 2. CHANNEL-SCOPED MESSAGE CLAIMING
-- MAX: no more than one message per recipient per worker run.
-- TELEGRAM: preserve the existing batch behavior.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_messaging_outbox_for_channel(
    p_channel text,
    p_limit integer DEFAULT 20
)
RETURNS TABLE(
    id uuid,
    recipient_chat_id bigint,
    payload jsonb,
    attempts integer,
    lock_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_limit integer := GREATEST(
        1,
        LEAST(COALESCE(p_limit, 20), 50)
    );
BEGIN
    IF p_channel IS NULL
       OR p_channel NOT IN ('telegram', 'max') THEN
        RAISE EXCEPTION 'Unsupported messaging channel';
    END IF;

    -- Recover only messages belonging to this channel.
    UPDATE public.messaging_outbox
    SET
        status = 'pending',
        locked_at = NULL,
        lock_token = NULL,
        next_attempt_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE channel = p_channel
      AND status = 'processing'
      AND locked_at < clock_timestamp() - interval '5 minutes';

    RETURN QUERY
    WITH ranked_candidates AS (
        SELECT
            o.id,
            o.recipient_chat_id,
            o.next_attempt_at,
            o.created_at,
            CASE
                WHEN p_channel = 'max' THEN
                    row_number() OVER (
                        PARTITION BY o.recipient_chat_id
                        ORDER BY
                            o.next_attempt_at,
                            o.created_at,
                            o.id
                    )
                ELSE 1
            END AS recipient_rank
        FROM public.messaging_outbox AS o
        WHERE o.channel = p_channel
          AND o.status = 'pending'
          AND o.next_attempt_at <= clock_timestamp()
    ),
    candidates AS (
        SELECT o.id
        FROM public.messaging_outbox AS o
        JOIN ranked_candidates AS rc
          ON rc.id = o.id
        WHERE rc.recipient_rank = 1
        ORDER BY
            o.next_attempt_at,
            o.created_at,
            o.id
        LIMIT v_limit
        FOR UPDATE OF o SKIP LOCKED
    ),
    claimed AS (
        UPDATE public.messaging_outbox AS o
        SET
            status = 'processing',
            attempts = o.attempts + 1,
            locked_at = clock_timestamp(),
            lock_token = gen_random_uuid(),
            updated_at = clock_timestamp()
        FROM candidates AS c
        WHERE o.id = c.id
        RETURNING
            o.id,
            o.recipient_chat_id,
            o.payload,
            o.attempts,
            o.lock_token
    )
    SELECT
        c.id,
        c.recipient_chat_id,
        c.payload,
        c.attempts,
        c.lock_token
    FROM claimed AS c;
END;
$function$;


-- ============================================================
-- 3. PRESERVE TELEGRAM RPC, CLAIM TELEGRAM ONLY
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_messaging_outbox(
    p_limit integer DEFAULT 20
)
RETURNS TABLE(
    id uuid,
    recipient_chat_id bigint,
    payload jsonb,
    attempts integer,
    lock_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.claim_messaging_outbox_for_channel(
        'telegram',
        p_limit
    );
END;
$function$;


-- ============================================================
-- 4. DISPATCH MAX WORKER THROUGH VAULT AND pg_net
-- ============================================================

CREATE OR REPLACE FUNCTION public.dispatch_max_messaging_outbox()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_url text;
    v_secret text;
    v_request_id bigint;
BEGIN
    IF pg_catalog.to_regprocedure(
        'net.http_post(text,jsonb,jsonb,jsonb,integer)'
    ) IS NULL THEN
        RETURN;
    END IF;

    SELECT decrypted_secret
    INTO v_url
    FROM vault.decrypted_secrets
    WHERE name = 'ponglab_max_messaging_worker_url'
    LIMIT 1;

    SELECT decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'ponglab_max_messaging_worker_secret'
    LIMIT 1;

    IF COALESCE(v_url, '') = ''
       OR COALESCE(v_secret, '') = '' THEN
        RETURN;
    END IF;

    EXECUTE
        'SELECT net.http_post($1, $2, $3, $4, $5)'
    INTO v_request_id
    USING
        v_url,
        '{"limit":20}'::jsonb,
        '{}'::jsonb,
        pg_catalog.jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_secret
        ),
        5000;

EXCEPTION
    WHEN OTHERS THEN
        RAISE LOG 'PongLab MAX messaging dispatch failed: %', SQLERRM;
END;
$function$;


-- ============================================================
-- 5. ENQUEUE ACCOUNT NOTIFICATIONS FOR MAX
-- recipient_chat_id stores MAX user_id for direct messages.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enqueue_max_account_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_user_id bigint;
    v_enabled boolean;
    v_inserted integer;
BEGIN
    SELECT
        ma.max_user_id,
        ma.notifications_enabled
    INTO
        v_user_id,
        v_enabled
    FROM public.max_accounts AS ma
    WHERE ma.user_id = NEW.user_id
      AND ma.max_user_id IS NOT NULL
      AND ma.unlinked_at IS NULL
    LIMIT 1;

    IF NOT FOUND
       OR v_enabled IS NOT TRUE
       OR v_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.messaging_outbox (
        channel,
        recipient_chat_id,
        payload,
        idempotency_key
    )
    VALUES (
        'max',
        v_user_id,
        pg_catalog.jsonb_build_object(
            'text',
            pg_catalog.left(
                pg_catalog.concat_ws(
                    E'\n\n',
                    COALESCE(NEW.title, 'Уведомление PongLab'),
                    COALESCE(NEW.message, '')
                ),
                3900
            )
        ),
        'account-notification:max:' || NEW.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
        PERFORM public.dispatch_max_messaging_outbox();
    END IF;

    RETURN NEW;
END;
$function$;


DROP TRIGGER IF EXISTS max_account_notification_delivery
ON public.account_notifications;

CREATE TRIGGER max_account_notification_delivery
AFTER INSERT ON public.account_notifications
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_max_account_notification();


-- ============================================================
-- 6. FUNCTION PRIVILEGES
-- ============================================================

REVOKE ALL ON FUNCTION
    public.claim_messaging_outbox_for_channel(text, integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.claim_messaging_outbox_for_channel(text, integer)
TO service_role;


REVOKE ALL ON FUNCTION
    public.claim_messaging_outbox(integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.claim_messaging_outbox(integer)
TO service_role;


REVOKE ALL ON FUNCTION
    public.dispatch_max_messaging_outbox()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.dispatch_max_messaging_outbox()
TO service_role;


REVOKE ALL ON FUNCTION
    public.enqueue_max_account_notification()
FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 7. SCHEDULE MAX DISPATCH EVERY 10 SECONDS
-- ============================================================

DO $block$
DECLARE
    v_job_id bigint;
BEGIN
    FOR v_job_id IN
        SELECT jobid
        FROM cron.job
        WHERE jobname = 'dispatch-max-messaging-outbox'
    LOOP
        PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
        'dispatch-max-messaging-outbox',
        '10 seconds',
        'SELECT public.dispatch_max_messaging_outbox();'
    );
END;
$block$;

COMMIT;
