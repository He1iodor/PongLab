
BEGIN;

-- ============================================================
-- 1. TELEGRAM ACCOUNT LINKING
-- ============================================================

CREATE TABLE public.telegram_accounts (
    user_id uuid PRIMARY KEY
        REFERENCES public.users(id) ON DELETE CASCADE,

    telegram_user_id bigint UNIQUE,
    private_chat_id bigint,

    username text,
    first_name text,

    notifications_enabled boolean NOT NULL DEFAULT true,

    linked_at timestamptz,
    unlinked_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT telegram_accounts_link_state_check CHECK (
        (
            telegram_user_id IS NOT NULL
            AND private_chat_id IS NOT NULL
            AND linked_at IS NOT NULL
            AND unlinked_at IS NULL
        )
        OR
        (
            telegram_user_id IS NULL
            AND private_chat_id IS NULL
            AND unlinked_at IS NOT NULL
        )
    )
);

CREATE INDEX telegram_accounts_active_user_idx
ON public.telegram_accounts (telegram_user_id)
WHERE telegram_user_id IS NOT NULL
  AND unlinked_at IS NULL;


CREATE TABLE public.telegram_link_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,

    code_hash text NOT NULL UNIQUE,

    expires_at timestamptz NOT NULL,
    used_at timestamptz,

    attempts integer NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT telegram_link_codes_attempts_check
        CHECK (attempts >= 0)
);

CREATE UNIQUE INDEX telegram_link_codes_one_active_per_user
ON public.telegram_link_codes (user_id)
WHERE used_at IS NULL;

CREATE INDEX telegram_link_codes_expiration_idx
ON public.telegram_link_codes (expires_at)
WHERE used_at IS NULL;


CREATE TABLE public.telegram_updates (
    update_id bigint PRIMARY KEY,

    payload jsonb NOT NULL,

    status text NOT NULL DEFAULT 'received',

    attempts integer NOT NULL DEFAULT 0,

    received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    processed_at timestamptz,

    last_error text,

    CONSTRAINT telegram_updates_status_check
        CHECK (status IN ('received', 'processing', 'processed', 'failed')),

    CONSTRAINT telegram_updates_attempts_check
        CHECK (attempts >= 0)
);

CREATE INDEX telegram_updates_pending_idx
ON public.telegram_updates (received_at)
WHERE status IN ('received', 'failed');


CREATE TABLE public.telegram_conversations (
    telegram_user_id bigint PRIMARY KEY,

    chat_id bigint NOT NULL,

    state text NOT NULL,

    context jsonb NOT NULL DEFAULT '{}'::jsonb,

    expires_at timestamptz NOT NULL,

    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);


CREATE TABLE public.telegram_notification_preferences (
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,

    event_type text NOT NULL,

    enabled boolean NOT NULL DEFAULT true,

    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    PRIMARY KEY (user_id, event_type),

    CONSTRAINT telegram_notification_preferences_type_check
        CHECK (
            event_type IN (
                'booking',
                'payment',
                'training',
                'schedule',
                'system',
                'extension_offer',
                'door'
            )
        )
);


-- ============================================================
-- 2. CUSTOMER SUPPORT
-- ============================================================

CREATE TABLE public.support_tickets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    ticket_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,

    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE RESTRICT,

    booking_id uuid
        REFERENCES public.bookings(id) ON DELETE SET NULL,

    assigned_to uuid
        REFERENCES public.users(id) ON DELETE SET NULL,

    topic text NOT NULL,

    status text NOT NULL DEFAULT 'new',

    source text NOT NULL DEFAULT 'telegram',

    last_message_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    closed_at timestamptz,

    CONSTRAINT support_tickets_topic_check
        CHECK (
            topic IN (
                'booking',
                'payment',
                'access',
                'technical',
                'other'
            )
        ),

    CONSTRAINT support_tickets_status_check
        CHECK (
            status IN (
                'new',
                'in_progress',
                'waiting_customer',
                'resolved',
                'closed'
            )
        ),

    CONSTRAINT support_tickets_source_check
        CHECK (source IN ('telegram', 'web'))
);

CREATE INDEX support_tickets_user_idx
ON public.support_tickets (user_id, created_at DESC);

CREATE INDEX support_tickets_status_idx
ON public.support_tickets (status, updated_at DESC);

CREATE INDEX support_tickets_assignee_idx
ON public.support_tickets (assigned_to, status);


CREATE TABLE public.support_ticket_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    ticket_id uuid NOT NULL
        REFERENCES public.support_tickets(id) ON DELETE CASCADE,

    sender_type text NOT NULL,

    sender_user_id uuid
        REFERENCES public.users(id) ON DELETE SET NULL,

    source text NOT NULL,

    content text NOT NULL,

    telegram_message_id bigint,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT support_ticket_messages_sender_check
        CHECK (sender_type IN ('customer', 'staff', 'system')),

    CONSTRAINT support_ticket_messages_source_check
        CHECK (source IN ('telegram', 'admin_panel', 'system')),

    CONSTRAINT support_ticket_messages_content_check
        CHECK (
            char_length(btrim(content)) BETWEEN 1 AND 4000
        )
);

CREATE INDEX support_ticket_messages_history_idx
ON public.support_ticket_messages (ticket_id, created_at ASC);


-- ============================================================
-- 3. STAFF PERMISSIONS
-- ============================================================

CREATE TABLE public.staff_permissions (
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,

    permission_key text NOT NULL,

    granted_by uuid
        REFERENCES public.users(id) ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    PRIMARY KEY (user_id, permission_key),

    CONSTRAINT staff_permissions_key_check
        CHECK (
            permission_key IN (
                'support.view',
                'support.reply',
                'support.manage',
                'bookings.view',
                'payments.view',
                'refunds.view',
                'equipment.view',
                'extensions.view',
                'notifications.view'
            )
        )
);

CREATE INDEX staff_permissions_lookup_idx
ON public.staff_permissions (permission_key, user_id);


CREATE TABLE public.staff_studio_access (
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,

    studio_id uuid NOT NULL
        REFERENCES public.studios(id) ON DELETE CASCADE,

    granted_by uuid
        REFERENCES public.users(id) ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    PRIMARY KEY (user_id, studio_id)
);

CREATE INDEX staff_studio_access_studio_idx
ON public.staff_studio_access (studio_id, user_id);


CREATE TABLE public.staff_notification_grants (
    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE CASCADE,

    event_type text NOT NULL,

    channel text NOT NULL,

    enabled boolean NOT NULL DEFAULT true,

    granted_by uuid
        REFERENCES public.users(id) ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    PRIMARY KEY (user_id, event_type, channel),

    CONSTRAINT staff_notification_grants_event_check
        CHECK (
            event_type IN (
                'booking',
                'payment',
                'support',
                'equipment',
                'system',
                'extension_offer',
                'training',
                'schedule'
            )
        ),

    CONSTRAINT staff_notification_grants_channel_check
        CHECK (channel IN ('panel', 'telegram'))
);


-- ============================================================
-- 4. OUTGOING MESSAGE QUEUE
-- ============================================================

CREATE TABLE public.messaging_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    channel text NOT NULL DEFAULT 'telegram',

    recipient_chat_id bigint NOT NULL,

    payload jsonb NOT NULL,

    idempotency_key text NOT NULL UNIQUE,

    status text NOT NULL DEFAULT 'pending',

    attempts integer NOT NULL DEFAULT 0,

    next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    locked_at timestamptz,
    lock_token uuid,

    sent_at timestamptz,

    last_error text,

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT messaging_outbox_channel_check
        CHECK (channel = 'telegram'),

    CONSTRAINT messaging_outbox_status_check
        CHECK (
            status IN (
                'pending',
                'processing',
                'sent',
                'dead'
            )
        ),

    CONSTRAINT messaging_outbox_attempts_check
        CHECK (attempts >= 0)
);

CREATE INDEX messaging_outbox_pending_idx
ON public.messaging_outbox (next_attempt_at, created_at)
WHERE status = 'pending';

CREATE INDEX messaging_outbox_processing_idx
ON public.messaging_outbox (locked_at)
WHERE status = 'processing';


-- ============================================================
-- 5. TELEGRAM DOOR REQUEST CHANNEL
-- ============================================================

-- Existing command_source values and authorization rules remain unchanged.
-- This column only records which interface initiated the command.

ALTER TABLE public.device_commands
ADD COLUMN request_channel text NOT NULL DEFAULT 'web';

ALTER TABLE public.device_commands
ADD CONSTRAINT device_commands_request_channel_check
CHECK (request_channel IN ('web', 'telegram'));


-- ============================================================
-- 6. EXTEND EXISTING RATE LIMITER
-- ============================================================

-- Existing api_rate_limits table and cleanup mechanism are preserved.
-- Only the supported route keys and their limits are extended.

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
SET search_path = ''
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
        'support_message'
    ) THEN
        RAISE EXCEPTION 'Unsupported rate limit route';
    END IF;

    IF p_subject_hash IS NULL
       OR p_subject_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid subject hash';
    END IF;

    v_limit := CASE p_route_key
        WHEN 'availability' THEN 30
        WHEN 'booking_hold' THEN 5
        WHEN 'telegram_link' THEN 5
        WHEN 'telegram_webhook' THEN 60
        WHEN 'support_message' THEN 5
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
            WHEN current_row.window_started_at
                 <= v_now - interval '60 seconds'
            THEN v_now
            ELSE current_row.window_started_at
        END,

        request_count = CASE
            WHEN current_row.window_started_at
                 <= v_now - interval '60 seconds'
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
                            v_window_started_at
                            + interval '60 seconds'
                            - v_now
                        )
                    )
                )::integer
            )
        END;
END;
$function$;


-- ============================================================
-- 7. OUTBOX CLAIM AND COMPLETION
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
DECLARE
    v_limit integer := GREATEST(
        1,
        LEAST(COALESCE(p_limit, 20), 50)
    );
BEGIN
    -- Recover messages abandoned by a crashed worker.
    UPDATE public.messaging_outbox
    SET
        status = 'pending',
        locked_at = NULL,
        lock_token = NULL,
        next_attempt_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE status = 'processing'
      AND locked_at < clock_timestamp() - interval '5 minutes';

    RETURN QUERY
    WITH candidates AS (
        SELECT o.id
        FROM public.messaging_outbox AS o
        WHERE o.status = 'pending'
          AND o.next_attempt_at <= clock_timestamp()
        ORDER BY o.next_attempt_at, o.created_at
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
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


CREATE OR REPLACE FUNCTION public.complete_messaging_outbox(
    p_id uuid,
    p_lock_token uuid,
    p_success boolean,
    p_error text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_status text;
BEGIN
    UPDATE public.messaging_outbox AS o
    SET
        status = CASE
            WHEN p_success IS TRUE THEN 'sent'
            WHEN o.attempts >= 8 THEN 'dead'
            ELSE 'pending'
        END,

        sent_at = CASE
            WHEN p_success IS TRUE THEN clock_timestamp()
            ELSE NULL
        END,

        next_attempt_at = CASE
            WHEN p_success IS TRUE OR o.attempts >= 8
                THEN o.next_attempt_at
            ELSE clock_timestamp()
                 + make_interval(
                     secs => LEAST(
                         3600,
                         (5 * power(2, o.attempts))::integer
                     )
                 )
        END,

        last_error = CASE
            WHEN p_success IS TRUE THEN NULL
            ELSE left(COALESCE(p_error, 'Unknown delivery error'), 500)
        END,

        locked_at = NULL,
        lock_token = NULL,
        updated_at = clock_timestamp()

    WHERE o.id = p_id
      AND o.lock_token = p_lock_token
      AND o.status = 'processing'

    RETURNING o.status INTO v_status;

    RETURN v_status;
END;
$function$;


-- ============================================================
-- 8. OPTIONAL ASYNC WORKER DISPATCH THROUGH pg_net
-- ============================================================

-- pg_net is deliberately NOT installed by this migration.
-- If enabled later, the worker URL and secret are read from Vault.
-- If pg_net is unavailable, the function safely does nothing.

CREATE OR REPLACE FUNCTION public.dispatch_messaging_outbox()
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
    WHERE name = 'ponglab_messaging_worker_url'
    LIMIT 1;

    SELECT decrypted_secret
    INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'ponglab_messaging_worker_secret'
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
        RAISE LOG 'PongLab messaging dispatch failed: %', SQLERRM;
END;
$function$;


-- ============================================================
-- 9. DELIVER EXISTING ACCOUNT NOTIFICATIONS TO TELEGRAM
-- ============================================================

CREATE OR REPLACE FUNCTION public.enqueue_telegram_account_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_chat_id bigint;
    v_enabled boolean;
    v_event_type text;
    v_inserted integer;
BEGIN
    SELECT
        ta.private_chat_id,
        ta.notifications_enabled
    INTO
        v_chat_id,
        v_enabled
    FROM public.telegram_accounts AS ta
    WHERE ta.user_id = NEW.user_id
      AND ta.telegram_user_id IS NOT NULL
      AND ta.unlinked_at IS NULL
    LIMIT 1;

    IF NOT FOUND OR v_enabled IS NOT TRUE OR v_chat_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_event_type := CASE
        WHEN NEW.event_key LIKE 'extension-offer:%'
            THEN 'extension_offer'
        ELSE NEW.type
    END;

    IF EXISTS (
        SELECT 1
        FROM public.telegram_notification_preferences AS pref
        WHERE pref.user_id = NEW.user_id
          AND pref.event_type = v_event_type
          AND pref.enabled IS FALSE
    ) THEN
        RETURN NEW;
    END IF;

    INSERT INTO public.messaging_outbox (
        channel,
        recipient_chat_id,
        payload,
        idempotency_key
    )
    VALUES (
        'telegram',
        v_chat_id,
        pg_catalog.jsonb_build_object(
            'text',
            pg_catalog.left(
                pg_catalog.concat_ws(
                    E'\n\n',
                    COALESCE(NEW.title, 'Уведомление PongLab'),
                    COALESCE(NEW.message, '')
                ),
                3900
            ),
            'disable_web_page_preview',
            true
        ),
        'account-notification:' || NEW.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted > 0 THEN
        PERFORM public.dispatch_messaging_outbox();
    END IF;

    RETURN NEW;
END;
$function$;


CREATE TRIGGER telegram_account_notification_delivery
AFTER INSERT ON public.account_notifications
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_telegram_account_notification();


-- ============================================================
-- 10. TELEGRAM DOOR COMMAND RESULT NOTIFICATIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.enqueue_telegram_door_command_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_chat_id bigint;
    v_text text;
BEGIN
    IF NEW.request_channel <> 'telegram'
       OR OLD.status IS NOT DISTINCT FROM NEW.status
       OR NEW.status NOT IN ('completed', 'failed', 'expired') THEN
        RETURN NEW;
    END IF;

    SELECT ta.private_chat_id
    INTO v_chat_id
    FROM public.telegram_accounts AS ta
    WHERE ta.user_id = NEW.requested_by
      AND ta.telegram_user_id IS NOT NULL
      AND ta.unlinked_at IS NULL
    LIMIT 1;

    IF NOT FOUND OR v_chat_id IS NULL THEN
        RETURN NEW;
    END IF;

    v_text := CASE NEW.status
        WHEN 'completed'
            THEN 'Контроллер подтвердил успешное выполнение команды открытия двери.'
        WHEN 'failed'
            THEN 'Контроллер сообщил, что не смог выполнить команду открытия двери. Обратитесь к администрации PongLab.'
        ELSE
            'Команда открытия двери истекла или не была выполнена. Попробуйте отправить запрос повторно во время оплаченного занятия.'
    END;

    INSERT INTO public.messaging_outbox (
        channel,
        recipient_chat_id,
        payload,
        idempotency_key
    )
    VALUES (
        'telegram',
        v_chat_id,
        pg_catalog.jsonb_build_object('text', v_text),
        'telegram-door-result:' || NEW.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    PERFORM public.dispatch_messaging_outbox();

    RETURN NEW;
END;
$function$;


CREATE TRIGGER telegram_door_command_result_delivery
AFTER UPDATE OF status ON public.device_commands
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.enqueue_telegram_door_command_result();


-- ============================================================
-- 11. RLS AND PRIVILEGES
-- ============================================================

ALTER TABLE public.telegram_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_notification_preferences ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_studio_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_notification_grants ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messaging_outbox ENABLE ROW LEVEL SECURITY;


REVOKE ALL ON TABLE public.telegram_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.telegram_link_codes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.telegram_updates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.telegram_conversations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.telegram_notification_preferences FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.support_tickets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.support_ticket_messages FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.staff_permissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_studio_access FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.staff_notification_grants FROM PUBLIC, anon, authenticated;

REVOKE ALL ON TABLE public.messaging_outbox FROM PUBLIC, anon, authenticated;


GRANT ALL ON TABLE public.telegram_accounts TO service_role;
GRANT ALL ON TABLE public.telegram_link_codes TO service_role;
GRANT ALL ON TABLE public.telegram_updates TO service_role;
GRANT ALL ON TABLE public.telegram_conversations TO service_role;
GRANT ALL ON TABLE public.telegram_notification_preferences TO service_role;

GRANT ALL ON TABLE public.support_tickets TO service_role;
GRANT ALL ON TABLE public.support_ticket_messages TO service_role;

GRANT ALL ON TABLE public.staff_permissions TO service_role;
GRANT ALL ON TABLE public.staff_studio_access TO service_role;
GRANT ALL ON TABLE public.staff_notification_grants TO service_role;

GRANT ALL ON TABLE public.messaging_outbox TO service_role;

GRANT USAGE, SELECT
ON SEQUENCE public.support_tickets_ticket_number_seq
TO service_role;


REVOKE ALL ON FUNCTION public.consume_api_rate_limit(text, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(text, text)
TO service_role;


REVOKE ALL ON FUNCTION public.claim_messaging_outbox(integer)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_messaging_outbox(integer)
TO service_role;


REVOKE ALL ON FUNCTION public.complete_messaging_outbox(uuid, uuid, boolean, text)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_messaging_outbox(uuid, uuid, boolean, text)
TO service_role;


REVOKE ALL ON FUNCTION public.dispatch_messaging_outbox()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dispatch_messaging_outbox()
TO service_role;


REVOKE ALL ON FUNCTION public.enqueue_telegram_account_notification()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.enqueue_telegram_door_command_result()
FROM PUBLIC, anon, authenticated;


COMMIT;
