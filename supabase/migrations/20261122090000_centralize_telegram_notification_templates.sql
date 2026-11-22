
BEGIN;

-- ============================================================
-- 1. CENTRALIZED TELEGRAM TEMPLATES FOR ACCOUNT NOTIFICATIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.enqueue_telegram_account_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_chat_id bigint;
    v_enabled boolean;
    v_event_type text;

    v_template_key text;
    v_variables jsonb;
    v_payload jsonb;

    v_studio_name text;
    v_table_name text;
    v_booking_start text;

    v_operation_id uuid;
    v_offer_price integer;
    v_duration integer;

    v_inserted integer;
BEGIN
    -- Preserve the existing Telegram account checks.
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

    -- Preserve the extension-specific preference mapping.
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

    -- Resolve the template using the existing notification fields.
    v_template_key := CASE
        WHEN NEW.event_key LIKE 'extension-offer:%'
            THEN 'extension_offer'

        WHEN NEW.type = 'booking'
             AND NEW.title = 'Временный резерв создан'
            THEN 'booking_pending'

        WHEN NEW.type = 'booking'
             AND NEW.title = 'Бронирование подтверждено'
             AND NEW.message LIKE 'Оплата прошла, бронирование подтверждено.%'
            THEN 'booking_confirmed'

        WHEN NEW.type = 'booking'
             AND NEW.title = 'Бронирование подтверждено'
            THEN 'booking_confirmed_update'

        WHEN NEW.type = 'payment'
             AND NEW.title = 'Оплата прошла'
            THEN 'payment_succeeded'

        WHEN NEW.type = 'payment'
             AND NEW.title = 'Платёж не завершён'
            THEN 'payment_failed'

        WHEN NEW.type = 'payment'
             AND NEW.title = 'Платёж возвращён'
            THEN 'payment_refunded'

        WHEN NEW.type = 'schedule'
            THEN 'schedule_changed'

        WHEN NEW.type = 'training'
            THEN 'training_completed'

        WHEN NEW.type = 'booking'
             AND NEW.title = 'Временный резерв истёк'
            THEN 'booking_expired'

        WHEN NEW.type = 'booking'
             AND NEW.title = 'Бронирование отменено'
            THEN 'booking_cancelled'

        ELSE NULL
    END;

    -- Collect booking details without changing account_notifications.
    IF NEW.booking_id IS NOT NULL THEN
        SELECT
            s.name,
            st.name,
            b.start_at::text
        INTO
            v_studio_name,
            v_table_name,
            v_booking_start
        FROM public.bookings AS b
        JOIN public.studio_tables AS st
          ON st.id = b.table_id
        JOIN public.studios AS s
          ON s.id = st.studio_id
        WHERE b.id = NEW.booking_id;
    END IF;

    v_variables := pg_catalog.jsonb_strip_nulls(
        pg_catalog.jsonb_build_object(
            'studio_name', v_studio_name,
            'table_name', v_table_name,
            'booking_start', v_booking_start
        )
    );

    -- Extension offers use structured operation data, not message parsing.
    IF v_template_key = 'extension_offer' THEN

        IF NEW.event_key ~
           '^extension-offer:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        THEN
            v_operation_id := pg_catalog.substr(
                NEW.event_key,
                pg_catalog.length('extension-offer:') + 1
            )::uuid;

            SELECT
                bo.price_difference_rub,
                CASE
                    WHEN bo.metadata ->> 'duration_minutes' ~ '^[0-9]+$'
                    THEN (bo.metadata ->> 'duration_minutes')::integer
                    ELSE NULL
                END
            INTO
                v_offer_price,
                v_duration
            FROM public.booking_operations AS bo
            WHERE bo.id = v_operation_id
              AND bo.operation_type = 'extension_offer';
        END IF;

        -- If structured data is incomplete, retain the old message format.
        IF v_offer_price IS NULL
           OR v_offer_price < 1
           OR v_duration IS NULL
           OR v_duration < 1
        THEN
            v_template_key := NULL;
        ELSE
            v_variables := v_variables ||
                pg_catalog.jsonb_build_object(
                    'offer_price', v_offer_price,
                    'duration_minutes', v_duration
                );
        END IF;
    END IF;

    -- Build either the new template payload or the legacy text payload.
    IF v_template_key IS NOT NULL THEN
        v_payload := pg_catalog.jsonb_build_object(
            'template_key', v_template_key,
            'variables', v_variables,
            'disable_web_page_preview', true
        );
    ELSE
        v_payload := pg_catalog.jsonb_build_object(
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
        );
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
        v_payload,
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


-- ============================================================
-- 2. CENTRALIZED TELEGRAM DOOR COMMAND RESULT TEMPLATES
-- ============================================================

CREATE OR REPLACE FUNCTION public.enqueue_telegram_door_command_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_chat_id bigint;
    v_template_key text;
BEGIN
    -- Preserve the existing request channel and status filters.
    IF NEW.request_channel <> 'telegram'
       OR OLD.status IS NOT DISTINCT FROM NEW.status
       OR NEW.status NOT IN ('completed', 'failed', 'expired')
    THEN
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

    v_template_key := CASE NEW.status
        WHEN 'completed' THEN 'door_completed'
        WHEN 'failed' THEN 'door_failed'
        WHEN 'expired' THEN 'door_expired'
        ELSE NULL
    END;

    IF v_template_key IS NULL THEN
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
            'template_key', v_template_key,
            'variables', '{}'::jsonb
        ),
        'telegram-door-result:' || NEW.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;

    PERFORM public.dispatch_messaging_outbox();

    RETURN NEW;
END;
$function$;

COMMIT;
