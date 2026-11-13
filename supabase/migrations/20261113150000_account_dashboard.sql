-- PongLab account dashboard: profile, real training statistics and notifications.
-- This migration does not alter booking/payment/access business logic and does not
-- add automatic booking completion or a new cron job.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND conname = 'users_full_name_length_check'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_full_name_length_check
      CHECK (
        full_name IS NULL
        OR char_length(btrim(full_name)) BETWEEN 2 AND 80
      );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.account_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  type text NOT NULL
    CHECK (type IN ('booking', 'payment', 'training', 'schedule', 'system')),
  title text NOT NULL
    CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  message text NOT NULL
    CHECK (char_length(btrim(message)) BETWEEN 1 AND 500),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  payment_group_id uuid REFERENCES public.payment_groups(id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_notifications_user_event_key
    UNIQUE (user_id, event_key),
  CONSTRAINT account_notifications_event_key_length
    CHECK (char_length(event_key) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS account_notifications_user_created_idx
  ON public.account_notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_notifications_user_unread_idx
  ON public.account_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.account_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.account_notifications
  FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.account_notifications TO service_role;
GRANT UPDATE (read_at) ON TABLE public.account_notifications TO service_role;

-- The server-side profile API can update only the display-name column.
GRANT UPDATE (full_name) ON TABLE public.users TO service_role;

-- Returns only completed, paid sessions. Confirmed bookings are deliberately
-- excluded: passing end_at does not prove that a customer actually attended.
CREATE OR REPLACE FUNCTION public.get_account_stats(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH completed AS (
    SELECT
      b.id,
      b.start_at,
      b.end_at,
      b.price_rub,
      pg_catalog.floor(
        extract(epoch FROM (b.end_at - b.start_at)) / 60
      )::bigint AS minutes
    FROM public.bookings AS b
    WHERE b.user_id = p_user_id
      AND b.status = 'completed'
      AND b.payment_status = 'succeeded'
      AND b.end_at <= pg_catalog.now()
  ),
  months AS (
    SELECT pg_catalog.generate_series(
      pg_catalog.date_trunc('month', pg_catalog.now()) - interval '5 months',
      pg_catalog.date_trunc('month', pg_catalog.now()),
      interval '1 month'
    ) AS month_start
  ),
  monthly_totals AS (
    SELECT
      pg_catalog.date_trunc('month', c.start_at) AS month_start,
      count(*)::integer AS sessions,
      coalesce(sum(c.minutes), 0)::bigint AS minutes,
      coalesce(sum(c.price_rub), 0)::bigint AS spent_rub
    FROM completed AS c
    WHERE c.start_at >= (
      pg_catalog.date_trunc('month', pg_catalog.now()) - interval '5 months'
    )
    GROUP BY 1
  )
  SELECT pg_catalog.jsonb_build_object(
    'completed_count',
      (SELECT count(*)::integer FROM completed),
    'total_minutes',
      (SELECT coalesce(sum(c.minutes), 0)::bigint FROM completed AS c),
    'total_spent_rub',
      (SELECT coalesce(sum(c.price_rub), 0)::bigint FROM completed AS c),
    'last_training_at',
      (SELECT max(c.end_at) FROM completed AS c),
    'monthly',
      coalesce(
        (
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'month', pg_catalog.to_char(m.month_start, 'YYYY-MM'),
              'sessions', coalesce(mt.sessions, 0),
              'minutes', coalesce(mt.minutes, 0),
              'spent_rub', coalesce(mt.spent_rub, 0)
            )
            ORDER BY m.month_start
          )
          FROM months AS m
          LEFT JOIN monthly_totals AS mt
            ON mt.month_start = m.month_start
        ),
        '[]'::jsonb
      )
  );
$function$;

REVOKE ALL ON FUNCTION public.get_account_stats(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_stats(uuid)
  TO service_role;

-- Exposes payment failure reasons only for the supplied, session-derived user
-- and only for payment groups that belong to that user.
CREATE OR REPLACE FUNCTION public.get_account_payment_failure_reasons(
  p_user_id uuid,
  p_payment_group_ids uuid[]
)
RETURNS TABLE (
  payment_group_id uuid,
  failure_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT pg.id, pg.failure_reason
  FROM public.payment_groups AS pg
  WHERE pg.user_id = p_user_id
    AND pg.id = ANY(coalesce(p_payment_group_ids, ARRAY[]::uuid[]));
$function$;

REVOKE ALL ON FUNCTION public.get_account_payment_failure_reasons(uuid, uuid[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_payment_failure_reasons(uuid, uuid[])
  TO service_role;

-- One event notification per real booking-state transition. The trigger does
-- not change bookings or payment groups; it only appends a notification.
CREATE OR REPLACE FUNCTION public.create_account_booking_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_type text;
  v_title text;
  v_message text;
  v_studio_name text;
  v_table_name text;
  v_details text;
  v_event_key text;
  v_event_time timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'pending_payment' THEN
      v_type := 'booking';
      v_title := 'Временный резерв создан';
      v_message := 'Место зарезервировано на время оплаты.';
    ELSIF NEW.status = 'confirmed' AND NEW.payment_status = 'succeeded' THEN
      v_type := 'booking';
      v_title := 'Бронирование подтверждено';
      v_message := 'Оплата прошла, бронирование подтверждено.';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    IF OLD.start_at IS DISTINCT FROM NEW.start_at
       OR OLD.end_at IS DISTINCT FROM NEW.end_at
    THEN
      v_type := 'schedule';
      v_title := 'Изменилось время бронирования';
      v_message := 'Проверьте новое время посещения в личном кабинете.';
    ELSIF OLD.payment_status IS DISTINCT FROM NEW.payment_status
          AND NEW.payment_status = 'succeeded'
    THEN
      v_type := 'payment';
      v_title := 'Оплата прошла';
      v_message := 'Платёж подтверждён, бронирование оплачено.';
    ELSIF OLD.payment_status IS DISTINCT FROM NEW.payment_status
          AND NEW.payment_status IN ('cancelled', 'failed', 'refunded')
    THEN
      v_type := 'payment';
      v_title := CASE
        WHEN NEW.payment_status = 'refunded' THEN 'Платёж возвращён'
        ELSE 'Платёж не завершён'
      END;
      v_message := CASE
        WHEN NEW.payment_status = 'refunded' THEN 'Для этой брони зафиксирован возврат средств.'
        ELSE 'Оплата отменена или не прошла. Проверьте статус бронирования.'
      END;
    ELSIF OLD.status IS DISTINCT FROM NEW.status
          AND NEW.status = 'completed'
    THEN
      v_type := 'training';
      v_title := 'Тренировка завершена';
      v_message := 'Завершённая тренировка добавлена в статистику.';
    ELSIF OLD.status IS DISTINCT FROM NEW.status
          AND NEW.status = 'expired'
    THEN
      v_type := 'booking';
      v_title := 'Временный резерв истёк';
      v_message := 'Время удержания места закончилось, бронь закрыта.';
    ELSIF OLD.status IS DISTINCT FROM NEW.status
          AND NEW.status = 'cancelled'
    THEN
      v_type := 'booking';
      v_title := 'Бронирование отменено';
      v_message := 'Статус бронирования изменён на «отменено».';
    ELSIF OLD.status IS DISTINCT FROM NEW.status
          AND NEW.status = 'confirmed'
    THEN
      v_type := 'booking';
      v_title := 'Бронирование подтверждено';
      v_message := 'Ваше бронирование подтверждено.';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  SELECT st.name, s.name
  INTO v_table_name, v_studio_name
  FROM public.studio_tables AS st
  JOIN public.studios AS s ON s.id = st.studio_id
  WHERE st.id = NEW.table_id;

  v_details := pg_catalog.concat_ws(
    ' · ',
    nullif(v_studio_name, ''),
    nullif(v_table_name, ''),
    'Начало: ' || NEW.start_at::text
  );

  v_event_time := coalesce(NEW.updated_at, pg_catalog.clock_timestamp());
  v_event_key := pg_catalog.concat(
    'booking:',
    NEW.id::text,
    ':',
    pg_catalog.to_char(v_event_time AT TIME ZONE 'UTC', 'YYYYMMDDHH24MISS.US'),
    ':',
    NEW.status,
    ':',
    NEW.payment_status,
    ':',
    v_type
  );

  INSERT INTO public.account_notifications (
    user_id,
    event_key,
    type,
    title,
    message,
    booking_id,
    payment_group_id
  )
  VALUES (
    NEW.user_id,
    v_event_key,
    v_type,
    v_title,
    pg_catalog.left(
      pg_catalog.concat_ws(' ', v_message, nullif(v_details, '')),
      500
    ),
    NEW.id,
    NEW.payment_group_id
  )
  ON CONFLICT (user_id, event_key) DO NOTHING;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_account_booking_notification()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS account_booking_notification_on_insert
  ON public.bookings;
CREATE TRIGGER account_booking_notification_on_insert
AFTER INSERT ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.create_account_booking_notification();

DROP TRIGGER IF EXISTS account_booking_notification_on_update
  ON public.bookings;
CREATE TRIGGER account_booking_notification_on_update
AFTER UPDATE OF status, payment_status, start_at, end_at
ON public.bookings
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.payment_status IS DISTINCT FROM NEW.payment_status
  OR OLD.start_at IS DISTINCT FROM NEW.start_at
  OR OLD.end_at IS DISTINCT FROM NEW.end_at
)
EXECUTE FUNCTION public.create_account_booking_notification();
