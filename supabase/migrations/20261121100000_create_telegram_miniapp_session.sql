
BEGIN;

-- Создание сессии существующего пользователя PongLab
-- после проверки Telegram Mini App initData на стороне сервера.
--
-- Функция:
-- 1. Принимает Telegram ID и SHA-256 хеш токена сессии.
-- 2. Проверяет активную привязку Telegram.
-- 3. Создаёт запись в существующей public.user_sessions.
-- 4. Возвращает срок действия сессии.
--
-- Сам Telegram initData проверяется в Next.js API.
-- Эта функция не заменяет проверку подписи Telegram.

CREATE OR REPLACE FUNCTION public.create_telegram_miniapp_session(
    p_telegram_user_id bigint,
    p_session_token_hash text
)
RETURNS TABLE (
    user_id uuid,
    session_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_user_id uuid;
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_session_expires_at timestamptz;
BEGIN
    -- Проверяем Telegram ID.
    IF p_telegram_user_id IS NULL
       OR p_telegram_user_id <= 0 THEN
        RAISE EXCEPTION 'Invalid Telegram user ID';
    END IF;

    -- Принимаем только SHA-256 хеш в hex-формате.
    IF p_session_token_hash IS NULL
       OR p_session_token_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'Invalid session token hash';
    END IF;

    -- Ищем только действующую привязку.
    -- Блокировка строки исключает параллельное изменение
    -- привязки во время создания сессии.
    SELECT ta.user_id
    INTO v_user_id
    FROM public.telegram_accounts AS ta
    WHERE ta.telegram_user_id = p_telegram_user_id
      AND ta.private_chat_id IS NOT NULL
      AND ta.unlinked_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active Telegram account not found';
    END IF;

    -- Срок сессии совпадает с существующей системой PongLab.
    v_session_expires_at :=
        v_now + interval '30 days';

    -- Используем существующую таблицу сессий.
    -- Сам секретный токен в базу не передаётся.
    INSERT INTO public.user_sessions (
        user_id,
        token_hash,
        expires_at
    )
    VALUES (
        v_user_id,
        p_session_token_hash,
        v_session_expires_at
    );

    RETURN QUERY
    SELECT
        v_user_id,
        v_session_expires_at;
END;
$function$;


-- Запрещаем прямой вызов публичным ролям.
REVOKE ALL ON FUNCTION public.create_telegram_miniapp_session(
    bigint,
    text
)
FROM PUBLIC, anon, authenticated;

-- Вызывать функцию сможет только сервер с service_role.
GRANT EXECUTE ON FUNCTION public.create_telegram_miniapp_session(
    bigint,
    text
)
TO service_role;

COMMIT;
