
BEGIN;

CREATE OR REPLACE FUNCTION public.process_telegram_link_update(
    p_update_id bigint,
    p_payload jsonb,
    p_code_hash text,
    p_telegram_user_id bigint,
    p_chat_id bigint,
    p_username text,
    p_first_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_code public.telegram_link_codes%ROWTYPE;
    v_account_user_id uuid;
BEGIN
    IF p_update_id IS NULL OR p_update_id < 0 THEN
        RAISE EXCEPTION 'Invalid Telegram update ID';
    END IF;

    IF p_payload IS NULL
       OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
        RAISE EXCEPTION 'Invalid Telegram update payload';
    END IF;

    IF p_code_hash IS NOT NULL
       AND p_code_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid Telegram link code hash';
    END IF;

    IF p_code_hash IS NOT NULL
       AND (
           p_telegram_user_id IS NULL
           OR p_telegram_user_id <= 0
           OR p_chat_id IS NULL
           OR p_chat_id <= 0
       ) THEN
        RAISE EXCEPTION 'Invalid Telegram account identifiers';
    END IF;

    -- Сохраняем update_id для защиты от повторной обработки.
    INSERT INTO public.telegram_updates (
        update_id,
        payload,
        status,
        attempts
    )
    VALUES (
        p_update_id,
        p_payload,
        'processing',
        1
    )
    ON CONFLICT (update_id) DO NOTHING;

    IF NOT FOUND THEN
        RETURN 'duplicate';
    END IF;

    -- Не относящиеся к привязке обновления сохраняются,
    -- но не запускают никаких дополнительных действий.
    IF p_code_hash IS NULL THEN
        UPDATE public.telegram_updates
        SET
            status = 'processed',
            processed_at = v_now,
            last_error = NULL
        WHERE update_id = p_update_id;

        RETURN 'ignored';
    END IF;

    -- Блокируем одноразовый код на время проверки и привязки.
    SELECT *
    INTO v_code
    FROM public.telegram_link_codes
    WHERE code_hash = p_code_hash
      AND used_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.telegram_updates
        SET
            status = 'failed',
            processed_at = v_now,
            last_error = 'invalid_or_used_link_code'
        WHERE update_id = p_update_id;

        RETURN 'invalid_code';
    END IF;

    IF v_code.expires_at <= v_now THEN
        UPDATE public.telegram_link_codes
        SET used_at = v_now
        WHERE id = v_code.id
          AND used_at IS NULL;

        UPDATE public.telegram_updates
        SET
            status = 'failed',
            processed_at = v_now,
            last_error = 'expired_link_code'
        WHERE update_id = p_update_id;

        RETURN 'expired';
    END IF;

    -- Один аккаунт PongLab может иметь только одну активную
    -- привязку Telegram.
    PERFORM 1
    FROM public.telegram_accounts
    WHERE user_id = v_code.user_id
      AND telegram_user_id IS NOT NULL
      AND unlinked_at IS NULL;

    IF FOUND THEN
        UPDATE public.telegram_link_codes
        SET used_at = v_now
        WHERE id = v_code.id
          AND used_at IS NULL;

        UPDATE public.telegram_updates
        SET
            status = 'failed',
            processed_at = v_now,
            last_error = 'ponglab_account_already_linked'
        WHERE update_id = p_update_id;

        RETURN 'account_already_linked';
    END IF;

    -- Один Telegram ID нельзя привязать к нескольким аккаунтам.
    PERFORM 1
    FROM public.telegram_accounts
    WHERE telegram_user_id = p_telegram_user_id
      AND unlinked_at IS NULL;

    IF FOUND THEN
        UPDATE public.telegram_link_codes
        SET used_at = v_now
        WHERE id = v_code.id
          AND used_at IS NULL;

        UPDATE public.telegram_updates
        SET
            status = 'failed',
            processed_at = v_now,
            last_error = 'telegram_account_already_linked'
        WHERE update_id = p_update_id;

        RETURN 'telegram_already_linked';
    END IF;

    -- Повторно используем существующую запись пользователя,
    -- если ранее Telegram был отвязан.
    BEGIN
        INSERT INTO public.telegram_accounts (
            user_id,
            telegram_user_id,
            private_chat_id,
            username,
            first_name,
            notifications_enabled,
            linked_at,
            unlinked_at,
            updated_at
        )
        VALUES (
            v_code.user_id,
            p_telegram_user_id,
            p_chat_id,
            p_username,
            p_first_name,
            true,
            v_now,
            NULL,
            v_now
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
            telegram_user_id = EXCLUDED.telegram_user_id,
            private_chat_id = EXCLUDED.private_chat_id,
            username = EXCLUDED.username,
            first_name = EXCLUDED.first_name,
            linked_at = EXCLUDED.linked_at,
            unlinked_at = NULL,
            updated_at = EXCLUDED.updated_at
        WHERE public.telegram_accounts.telegram_user_id IS NULL
           OR public.telegram_accounts.unlinked_at IS NOT NULL
        RETURNING user_id INTO v_account_user_id;

    EXCEPTION
        WHEN unique_violation THEN
            UPDATE public.telegram_link_codes
            SET used_at = v_now
            WHERE id = v_code.id
              AND used_at IS NULL;

            UPDATE public.telegram_updates
            SET
                status = 'failed',
                processed_at = v_now,
                last_error = 'telegram_account_already_linked'
            WHERE update_id = p_update_id;

            RETURN 'telegram_already_linked';
    END;

    IF v_account_user_id IS NULL THEN
        UPDATE public.telegram_link_codes
        SET used_at = v_now
        WHERE id = v_code.id
          AND used_at IS NULL;

        UPDATE public.telegram_updates
        SET
            status = 'failed',
            processed_at = v_now,
            last_error = 'ponglab_account_already_linked'
        WHERE update_id = p_update_id;

        RETURN 'account_already_linked';
    END IF;

    -- Код становится использованным только после успешной привязки.
    UPDATE public.telegram_link_codes
    SET used_at = v_now
    WHERE id = v_code.id
      AND used_at IS NULL;

    UPDATE public.telegram_updates
    SET
        status = 'processed',
        processed_at = v_now,
        last_error = NULL
    WHERE update_id = p_update_id;

    RETURN 'linked';
END;
$function$;

REVOKE ALL ON FUNCTION public.process_telegram_link_update(
    bigint,
    jsonb,
    text,
    bigint,
    bigint,
    text,
    text
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_telegram_link_update(
    bigint,
    jsonb,
    text,
    bigint,
    bigint,
    text,
    text
)
TO service_role;

COMMIT;
