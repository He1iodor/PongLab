BEGIN;

CREATE OR REPLACE FUNCTION public.create_telegram_link_code(
    p_user_id uuid,
    p_code_hash text,
    p_expires_at timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    v_code_id uuid;
    v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'Invalid user ID';
    END IF;

    IF p_code_hash IS NULL
       OR p_code_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid Telegram link code hash';
    END IF;

    IF p_expires_at IS NULL
       OR p_expires_at <= v_now + interval '1 minute'
       OR p_expires_at > v_now + interval '15 minutes' THEN
        RAISE EXCEPTION 'Invalid Telegram link code expiration';
    END IF;

    -- Блокировка строки пользователя сериализует параллельные
    -- запросы создания кода для одного аккаунта.
    PERFORM 1
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User not found';
    END IF;

    -- Отзываем все ранее созданные, но ещё не использованные коды.
    UPDATE public.telegram_link_codes
    SET used_at = v_now
    WHERE user_id = p_user_id
      AND used_at IS NULL;

    INSERT INTO public.telegram_link_codes (
        user_id,
        code_hash,
        expires_at
    )
    VALUES (
        p_user_id,
        p_code_hash,
        p_expires_at
    )
    RETURNING id INTO v_code_id;

    RETURN v_code_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_telegram_link_code(uuid, text, timestamptz)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_telegram_link_code(uuid, text, timestamptz)
TO service_role;

COMMIT;
