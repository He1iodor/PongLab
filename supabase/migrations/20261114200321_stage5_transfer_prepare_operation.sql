CREATE OR REPLACE FUNCTION public.prepare_customer_booking_transfer(
  p_booking_id uuid,
  p_user_id uuid,
  p_target_table_id uuid,
  p_target_start_at timestamptz,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_operation public.booking_operations%ROWTYPE;
  v_source_studio record;
  v_target record;
  v_target_settings record;
  v_target_local_start timestamp without time zone;
  v_target_local_end timestamp without time zone;
  v_target_date date;
  v_target_weekday integer;
  v_working_interval_count integer := 0;
  v_matching_rule_count integer := 0;
  v_target_price integer;
  v_difference integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_operation_status text;
  v_payment_group_id uuid;
  v_placeholder_price integer;
  v_existing_operation public.booking_operations%ROWTYPE;
BEGIN
  IF p_booking_id IS NULL
     OR p_user_id IS NULL
     OR p_target_table_id IS NULL
     OR p_target_start_at IS NULL
     OR p_idempotency_key IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 1
     OR pg_catalog.length(p_idempotency_key) > 200
  THEN
    RAISE EXCEPTION 'Invalid transfer parameters';
  END IF;

  IF pg_catalog.date_trunc('minute', p_target_start_at) <> p_target_start_at THEN
    RAISE EXCEPTION 'Transfer start must be aligned to a whole minute';
  END IF;

  SELECT *
  INTO v_existing_operation
  FROM public.booking_operations
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_operation.operation_type <> 'transfer'
       OR v_existing_operation.booking_id <> p_booking_id
       OR v_existing_operation.user_id <> p_user_id
       OR v_existing_operation.target_table_id <> p_target_table_id
       OR v_existing_operation.target_start_at <> p_target_start_at
    THEN
      RAISE EXCEPTION 'Idempotency key was already used for another operation';
    END IF;

    v_payment_group_id := v_existing_operation.adjustment_payment_group_id;

    RETURN pg_catalog.jsonb_build_object(
      'state', v_existing_operation.status,
      'operation_id', v_existing_operation.id,
      'payment_group_id', v_payment_group_id,
      'price_difference_rub', v_existing_operation.price_difference_rub,
      'target_price_rub', v_existing_operation.target_price_rub
    );
  END IF;

  SELECT *
  INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  IF v_booking.status <> 'confirmed'
     OR v_booking.payment_status <> 'succeeded'
  THEN
    RAISE EXCEPTION 'Only paid and confirmed bookings can be transferred';
  END IF;

  IF v_booking.start_at <= v_now + interval '2 hours' THEN
    RAISE EXCEPTION 'Self-service transfer is unavailable less than two hours before start';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_operations bo
    WHERE bo.booking_id = p_booking_id
      AND bo.operation_type = 'transfer'
      AND bo.status IN ('requested', 'offered', 'awaiting_payment', 'processing')
  ) THEN
    RAISE EXCEPTION 'Another transfer operation is already active';
  END IF;

  SELECT s.id, s.timezone
  INTO v_source_studio
  FROM public.studio_tables st
  JOIN public.studios s ON s.id = st.studio_id
  WHERE st.id = v_booking.table_id;

  IF NOT FOUND OR v_source_studio.timezone IS NULL THEN
    RAISE EXCEPTION 'Source studio or timezone was not found';
  END IF;

  IF v_booking.start_at <= v_now + interval '24 hours'
     AND (p_target_start_at AT TIME ZONE v_source_studio.timezone)::date
         <> (v_booking.start_at AT TIME ZONE v_source_studio.timezone)::date
  THEN
    RAISE EXCEPTION 'Within 24 hours, transfer is limited to the source studio calendar day';
  END IF;

  SELECT
    st.id AS table_id,
    st.studio_id,
    st.is_active AS table_is_active,
    s.name AS studio_name,
    s.timezone,
    s.is_active AS studio_is_active
  INTO v_target
  FROM public.studio_tables st
  JOIN public.studios s ON s.id = st.studio_id
  WHERE st.id = p_target_table_id;

  IF NOT FOUND OR NOT v_target.table_is_active OR NOT v_target.studio_is_active THEN
    RAISE EXCEPTION 'Target table or studio is inactive or missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_timezone_names tz
    WHERE tz.name = v_target.timezone
  ) THEN
    RAISE EXCEPTION 'Target studio timezone is invalid';
  END IF;

  v_target_local_start := p_target_start_at AT TIME ZONE v_target.timezone;
  v_target_local_end := (p_target_start_at + interval '60 minutes') AT TIME ZONE v_target.timezone;
  v_target_date := v_target_local_start::date;
  v_target_weekday := extract(isodow FROM v_target_local_start)::integer;

  IF v_target_local_end::date <> v_target_date
     OR extract(epoch FROM (v_target_local_end - v_target_local_start)) <> 3600
  THEN
    RAISE EXCEPTION 'The selected one-hour slot crosses a local date or daylight-saving boundary';
  END IF;

  SELECT
    COALESCE(sbs.booking_horizon_days, 30) AS booking_horizon_days,
    COALESCE(sbs.minimum_notice_minutes, 0) AS minimum_notice_minutes,
    COALESCE(sbs.hold_minutes, 10) AS hold_minutes,
    COALESCE(sbs.allow_same_day_booking, true) AS allow_same_day_booking
  INTO v_target_settings
  FROM public.studios s
  LEFT JOIN public.studio_booking_settings sbs ON sbs.studio_id = s.id
  WHERE s.id = v_target.studio_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target studio settings could not be loaded';
  END IF;

  IF v_target_settings.booking_horizon_days < 1
     OR v_target_settings.booking_horizon_days > 365
     OR v_target_settings.minimum_notice_minutes < 0
     OR v_target_settings.minimum_notice_minutes > 10080
     OR v_target_settings.hold_minutes < 1
     OR v_target_settings.hold_minutes > 60
  THEN
    RAISE EXCEPTION 'Target studio booking settings are invalid';
  END IF;

  IF v_target_date < (v_now AT TIME ZONE v_target.timezone)::date
     OR v_target_date > (v_now AT TIME ZONE v_target.timezone)::date
                           + v_target_settings.booking_horizon_days
     OR (
       v_target_date = (v_now AT TIME ZONE v_target.timezone)::date
       AND NOT v_target_settings.allow_same_day_booking
     )
     OR p_target_start_at < v_now
          + pg_catalog.make_interval(mins => v_target_settings.minimum_notice_minutes)
  THEN
    RAISE EXCEPTION 'Target slot is outside the studio booking window';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.studio_date_exceptions de
    WHERE de.studio_id = v_target.studio_id
      AND de.exception_date = v_target_date
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.studio_date_exceptions de
      WHERE de.studio_id = v_target.studio_id
        AND de.exception_date = v_target_date
        AND de.is_closed
    ) THEN
      RAISE EXCEPTION 'Target studio is closed on the selected date';
    END IF;

    SELECT count(*)::integer
    INTO v_working_interval_count
    FROM public.studio_date_exceptions de
    JOIN public.studio_date_exception_intervals dei
      ON dei.exception_id = de.id
    WHERE de.studio_id = v_target.studio_id
      AND de.exception_date = v_target_date
      AND NOT de.is_closed
      AND dei.opens_at <= v_target_local_start::time
      AND dei.closes_at >= v_target_local_end::time;
  ELSE
    SELECT count(*)::integer
    INTO v_working_interval_count
    FROM public.studio_weekly_schedule ws
    JOIN public.studio_weekly_schedule_intervals wsi
      ON wsi.schedule_id = ws.id
    WHERE ws.studio_id = v_target.studio_id
      AND ws.weekday = v_target_weekday
      AND ws.is_open
      AND wsi.opens_at <= v_target_local_start::time
      AND wsi.closes_at >= v_target_local_end::time;
  END IF;

  IF v_working_interval_count <> 1 THEN
    RAISE EXCEPTION 'Target slot is outside studio opening hours or schedule is ambiguous';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT wsi.opens_at
      FROM public.studio_weekly_schedule ws
      JOIN public.studio_weekly_schedule_intervals wsi ON wsi.schedule_id = ws.id
      WHERE ws.studio_id = v_target.studio_id
        AND ws.weekday = v_target_weekday
        AND ws.is_open
        AND NOT EXISTS (
          SELECT 1 FROM public.studio_date_exceptions de
          WHERE de.studio_id = v_target.studio_id
            AND de.exception_date = v_target_date
        )
      UNION ALL
      SELECT dei.opens_at
      FROM public.studio_date_exceptions de
      JOIN public.studio_date_exception_intervals dei ON dei.exception_id = de.id
      WHERE de.studio_id = v_target.studio_id
        AND de.exception_date = v_target_date
        AND NOT de.is_closed
    ) opening
    WHERE v_target_local_start::time >= opening.opens_at
      AND mod(
        (extract(epoch FROM (v_target_local_start::time - opening.opens_at))::integer / 60),
        60
      ) = 0
  ) THEN
    RAISE EXCEPTION 'Target start does not match the studio 60-minute slot grid';
  END IF;

  SELECT count(*)::integer, min(r.price_rub)::integer
  INTO v_matching_rule_count, v_target_price
  FROM public.studio_slot_price_rules r
  WHERE r.studio_id = v_target.studio_id
    AND r.weekday = v_target_weekday
    AND r.duration_minutes = 60
    AND r.is_active
    AND (r.effective_from IS NULL OR r.effective_from <= v_target_date)
    AND (r.effective_to IS NULL OR r.effective_to >= v_target_date)
    AND r.starts_at <= v_target_local_start::time
    AND r.ends_at >= v_target_local_end::time;

  IF v_matching_rule_count <> 1 OR v_target_price IS NULL OR v_target_price <= 0 THEN
    RAISE EXCEPTION 'Target slot has no unique active 60-minute tariff';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.user_id = p_user_id
      AND b.id <> p_booking_id
      AND b.status IN ('pending_payment', 'confirmed')
      AND tstzrange(b.start_at, b.end_at, '[)')
          && tstzrange(p_target_start_at, p_target_start_at + interval '60 minutes', '[)')
      AND (
        b.booking_operation_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.booking_operations bo
          WHERE bo.id = b.booking_operation_id
            AND bo.status IN ('requested', 'offered', 'awaiting_payment', 'processing')
        )
      )
  ) THEN
    RAISE EXCEPTION 'Target slot overlaps another active booking of this customer';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.table_id = p_target_table_id
      AND b.id <> p_booking_id
      AND b.status IN ('pending_payment', 'confirmed')
      AND tstzrange(b.start_at, b.end_at, '[)')
          && tstzrange(p_target_start_at, p_target_start_at + interval '60 minutes', '[)')
  ) THEN
    RAISE EXCEPTION 'Target table is no longer available';
  END IF;

  IF v_booking.table_id = p_target_table_id
     AND v_booking.start_at = p_target_start_at
  THEN
    RAISE EXCEPTION 'Source and target booking are identical';
  END IF;

  v_difference := v_target_price - v_booking.price_rub;

  IF v_difference > 0 THEN
    v_operation_status := 'awaiting_payment';
    v_placeholder_price := v_difference;
  ELSIF v_difference < 0 THEN
    v_operation_status := 'processing';
    v_placeholder_price := v_target_price;
  ELSE
    v_operation_status := 'completed';
    v_placeholder_price := NULL;
  END IF;

  INSERT INTO public.booking_operations (
    idempotency_key, booking_id, user_id, operation_type, status,
    actor_type, actor_user_id, source_payment_group_id,
    source_start_at, source_end_at, target_table_id,
    target_start_at, target_end_at, source_price_rub,
    target_price_rub, price_difference_rub
  )
  VALUES (
    p_idempotency_key, p_booking_id, p_user_id, 'transfer', v_operation_status,
    'customer', p_user_id, v_booking.payment_group_id,
    v_booking.start_at, v_booking.end_at, p_target_table_id,
    p_target_start_at, p_target_start_at + interval '60 minutes',
    v_booking.price_rub, v_target_price, v_difference
  )
  RETURNING * INTO v_operation;

  IF v_difference = 0 THEN
    UPDATE public.bookings
    SET table_id = p_target_table_id,
        start_at = p_target_start_at,
        end_at = p_target_start_at + interval '60 minutes',
        price_rub = v_target_price,
        updated_at = v_now
    WHERE id = p_booking_id;

    UPDATE public.booking_operations
    SET completed_at = v_now,
        updated_at = v_now
    WHERE id = v_operation.id;

    RETURN pg_catalog.jsonb_build_object(
      'state', 'completed',
      'operation_id', v_operation.id,
      'price_difference_rub', 0,
      'target_price_rub', v_target_price
    );
  END IF;

  IF v_difference > 0 THEN
    INSERT INTO public.payment_groups (
      user_id, provider, status, amount_rub, currency,
      hold_expires_at, created_at, updated_at
    )
    VALUES (
      p_user_id, 'yookassa', 'pending', v_difference, 'RUB',
      v_now + pg_catalog.make_interval(mins => v_target_settings.hold_minutes),
      v_now, v_now
    )
    RETURNING id INTO v_payment_group_id;

    UPDATE public.booking_operations
    SET adjustment_payment_group_id = v_payment_group_id,
        updated_at = v_now
    WHERE id = v_operation.id;
  END IF;

  INSERT INTO public.bookings (
    user_id, table_id, start_at, end_at, status, price_rub,
    payment_status, payment_group_id, hold_expires_at,
    booking_operation_id, created_at, updated_at
  )
  VALUES (
    p_user_id, p_target_table_id, p_target_start_at,
    p_target_start_at + interval '60 minutes',
    'pending_payment', v_placeholder_price, 'pending',
    v_payment_group_id,
    CASE
      WHEN v_difference > 0
        THEN v_now + pg_catalog.make_interval(mins => v_target_settings.hold_minutes)
      ELSE p_target_start_at
    END,
    v_operation.id, v_now, v_now
  );

  RETURN pg_catalog.jsonb_build_object(
    'state', v_operation_status,
    'operation_id', v_operation.id,
    'payment_group_id', v_payment_group_id,
    'price_difference_rub', v_difference,
    'target_price_rub', v_target_price
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_customer_booking_transfer(uuid, uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_customer_booking_transfer(uuid, uuid, uuid, timestamptz, text)
  TO service_role;

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
  IF NEW.booking_operation_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

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
    user_id, event_key, type, title, message, booking_id, payment_group_id
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
