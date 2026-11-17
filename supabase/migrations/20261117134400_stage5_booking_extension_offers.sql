-- PongLab: automatic 60-minute extension offer with configurable discount.
-- Add this migration to feature and apply it to the Preview database first.

ALTER TABLE public.studio_booking_settings
  ADD COLUMN IF NOT EXISTS extension_offer_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS extension_offer_discount_percent integer NOT NULL DEFAULT 50;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.studio_booking_settings'::regclass
      AND conname = 'studio_booking_settings_extension_discount_check'
  ) THEN
    ALTER TABLE public.studio_booking_settings
      ADD CONSTRAINT studio_booking_settings_extension_discount_check
      CHECK (extension_offer_discount_percent BETWEEN 1 AND 90);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_due_booking_extension_offers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_candidate record;
  v_booking public.bookings%ROWTYPE;
  v_operation_id uuid;
  v_studio_id uuid;
  v_timezone text;
  v_enabled boolean;
  v_discount integer;
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_local_date date;
  v_weekday integer;
  v_interval_count integer;
  v_tariff_count integer;
  v_base_price integer;
  v_offer_price integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_created integer := 0;
  v_hold record;
BEGIN
  -- Expire offers that were never accepted.
  UPDATE public.booking_operations bo
  SET status = 'expired',
      updated_at = v_now,
      metadata = coalesce(bo.metadata, '{}'::jsonb)
        || pg_catalog.jsonb_build_object('expired_at', v_now, 'expiration_reason', 'offer_window_elapsed')
  WHERE bo.operation_type = 'extension_offer'
    AND bo.status = 'offered'
    AND bo.expires_at IS NOT NULL
    AND bo.expires_at <= v_now;

  -- Release accepted extension holds for which payment initialization was
  -- never started. The ordinary payment timeout job only handles initialized
  -- payments, so this path is specific to extension offers.
  FOR v_hold IN
    SELECT pg.id
    FROM public.payment_groups pg
    WHERE pg.provider = 'yookassa'
      AND pg.status = 'pending'
      AND pg.payment_init_started_at IS NULL
      AND pg.hold_expires_at IS NOT NULL
      AND pg.hold_expires_at <= v_now
      AND EXISTS (
        SELECT 1
        FROM public.bookings b
        JOIN public.booking_operations bo ON bo.id = b.booking_operation_id
        WHERE b.payment_group_id = pg.id
          AND bo.operation_type = 'extension_offer'
          AND bo.status = 'awaiting_payment'
      )
    ORDER BY pg.hold_expires_at, pg.id
    LIMIT 200
    FOR UPDATE OF pg SKIP LOCKED
  LOOP
    UPDATE public.payment_groups
    SET status = 'cancelled',
        failure_reason = 'extension_offer_payment_hold_expired',
        last_checked_at = v_now,
        updated_at = v_now
    WHERE id = v_hold.id
      AND status = 'pending';

    UPDATE public.bookings
    SET status = 'expired',
        payment_status = 'cancelled',
        updated_at = v_now
    WHERE payment_group_id = v_hold.id
      AND status = 'pending_payment'
      AND payment_status = 'pending';
  END LOOP;

  -- Candidate scan is intentionally unlocked. Each studio and source booking
  -- is locked in the same order used by the acceptance workflow.
  FOR v_candidate IN
    SELECT b.id AS booking_id, st.studio_id
    FROM public.bookings b
    JOIN public.studio_tables st ON st.id = b.table_id
    JOIN public.studios s ON s.id = st.studio_id
    JOIN public.studio_booking_settings sbs ON sbs.studio_id = s.id
    WHERE b.status = 'confirmed'
      AND b.payment_status = 'succeeded'
      AND b.end_at > v_now
      AND b.end_at <= v_now + interval '15 minutes'
      AND st.is_active IS TRUE
      AND s.is_active IS TRUE
      AND sbs.extension_offer_enabled IS TRUE
    ORDER BY b.end_at, b.id
    LIMIT 200
  LOOP
    v_studio_id := v_candidate.studio_id;

    BEGIN
      PERFORM public.lock_ponglab_studio(v_studio_id);
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    SELECT b.*
    INTO v_booking
    FROM public.bookings b
    JOIN public.studio_tables st ON st.id = b.table_id
    JOIN public.studios s ON s.id = st.studio_id
    JOIN public.studio_booking_settings sbs ON sbs.studio_id = s.id
    WHERE b.id = v_candidate.booking_id
      AND b.status = 'confirmed'
      AND b.payment_status = 'succeeded'
      AND b.end_at > v_now
      AND b.end_at <= v_now + interval '15 minutes'
      AND st.is_active IS TRUE
      AND s.is_active IS TRUE
      AND sbs.extension_offer_enabled IS TRUE
    FOR UPDATE OF b;

    IF NOT FOUND OR v_booking.payment_group_id IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.booking_operations bo
      WHERE bo.booking_id = v_booking.id
        AND (
          (
            bo.status IN ('requested', 'offered', 'awaiting_payment', 'processing')
            AND bo.operation_type IN (
              'transfer', 'transfer_request', 'extension',
              'extension_offer', 'late_payment_refund', 'cancellation'
            )
          )
          OR (
            bo.status = 'failed'
            AND (
              bo.metadata ->> 'manual_resolution_required' = 'true'
              OR EXISTS (
                SELECT 1 FROM public.payment_refunds pr
                WHERE pr.booking_operation_id = bo.id
                  AND pr.status IN ('pending', 'succeeded')
              )
            )
          )
        )
    ) THEN
      CONTINUE;
    END IF;

    SELECT s.timezone, sbs.extension_offer_enabled,
           sbs.extension_offer_discount_percent
    INTO v_timezone, v_enabled, v_discount
    FROM public.studio_tables st
    JOIN public.studios s ON s.id = st.studio_id
    JOIN public.studio_booking_settings sbs ON sbs.studio_id = s.id
    WHERE st.id = v_booking.table_id
      AND st.is_active IS TRUE
      AND s.is_active IS TRUE;

    IF NOT FOUND OR NOT v_enabled THEN
      CONTINUE;
    END IF;

    v_timezone := coalesce(nullif(v_timezone, ''), 'Europe/Moscow');
    v_local_start := v_booking.end_at AT TIME ZONE v_timezone;
    v_local_end := (v_booking.end_at + interval '60 minutes') AT TIME ZONE v_timezone;
    v_local_date := v_local_start::date;
    v_weekday := extract(isodow FROM v_local_start)::integer;

    -- The offered hour must fit into one local calendar day and one exact
    -- opening interval. Date exceptions override the weekly schedule.
    IF v_local_end::date <> v_local_date THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.studio_date_exceptions de
      WHERE de.studio_id = v_studio_id
        AND de.exception_date = v_local_date
    ) THEN
      IF EXISTS (
        SELECT 1 FROM public.studio_date_exceptions de
        WHERE de.studio_id = v_studio_id
          AND de.exception_date = v_local_date
          AND de.is_closed IS TRUE
      ) THEN
        CONTINUE;
      END IF;

      SELECT count(*)::integer
      INTO v_interval_count
      FROM public.studio_date_exceptions de
      JOIN public.studio_date_exception_intervals dei
        ON dei.exception_id = de.id
      WHERE de.studio_id = v_studio_id
        AND de.exception_date = v_local_date
        AND de.is_closed IS FALSE
        AND dei.opens_at <= v_local_start::time
        AND dei.closes_at >= v_local_end::time;
    ELSE
      SELECT count(*)::integer
      INTO v_interval_count
      FROM public.studio_weekly_schedule ws
      JOIN public.studio_weekly_schedule_intervals wsi
        ON wsi.schedule_id = ws.id
      WHERE ws.studio_id = v_studio_id
        AND ws.weekday = v_weekday
        AND ws.is_open IS TRUE
        AND wsi.opens_at <= v_local_start::time
        AND wsi.closes_at >= v_local_end::time;
    END IF;

    IF v_interval_count <> 1 THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM (
        SELECT wsi.opens_at
        FROM public.studio_weekly_schedule ws
        JOIN public.studio_weekly_schedule_intervals wsi
          ON wsi.schedule_id = ws.id
        WHERE ws.studio_id = v_studio_id
          AND ws.weekday = v_weekday
          AND ws.is_open IS TRUE
          AND NOT EXISTS (
            SELECT 1 FROM public.studio_date_exceptions de
            WHERE de.studio_id = v_studio_id
              AND de.exception_date = v_local_date
          )
        UNION ALL
        SELECT dei.opens_at
        FROM public.studio_date_exceptions de
        JOIN public.studio_date_exception_intervals dei
          ON dei.exception_id = de.id
        WHERE de.studio_id = v_studio_id
          AND de.exception_date = v_local_date
          AND de.is_closed IS FALSE
      ) opening
      WHERE v_local_start::time >= opening.opens_at
        AND mod(
          (extract(epoch FROM (v_local_start::time - opening.opens_at))::integer / 60),
          60
        ) = 0
    ) THEN
      CONTINUE;
    END IF;

    -- Exactly one active 60-minute tariff must cover the next hour.
    SELECT count(*)::integer, min(r.price_rub)::integer
    INTO v_tariff_count, v_base_price
    FROM public.studio_slot_price_rules r
    WHERE r.studio_id = v_studio_id
      AND r.weekday = v_weekday
      AND r.duration_minutes = 60
      AND r.is_active IS TRUE
      AND (r.effective_from IS NULL OR r.effective_from <= v_local_date)
      AND (r.effective_to IS NULL OR r.effective_to >= v_local_date)
      AND r.starts_at <= v_local_start::time
      AND r.ends_at >= v_local_end::time;

    IF v_tariff_count <> 1 OR v_base_price IS NULL OR v_base_price <= 0 THEN
      CONTINUE;
    END IF;

    -- The same table and the same customer must both remain free.
    IF EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.table_id = v_booking.table_id
        AND b.id <> v_booking.id
        AND b.status IN ('pending_payment', 'confirmed')
        AND tstzrange(b.start_at, b.end_at, '[)')
            && tstzrange(v_booking.end_at, v_booking.end_at + interval '60 minutes', '[)')
    ) THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.user_id = v_booking.user_id
        AND b.id <> v_booking.id
        AND b.status IN ('pending_payment', 'confirmed')
        AND tstzrange(b.start_at, b.end_at, '[)')
            && tstzrange(v_booking.end_at, v_booking.end_at + interval '60 minutes', '[)')
    ) THEN
      CONTINUE;
    END IF;

    v_offer_price := round(
      v_base_price::numeric * (100 - v_discount)::numeric / 100
    )::integer;

    IF v_offer_price < 1 THEN
      CONTINUE;
    END IF;

    INSERT INTO public.booking_operations (
      idempotency_key,
      booking_id,
      user_id,
      operation_type,
      status,
      actor_type,
      source_payment_group_id,
      source_start_at,
      source_end_at,
      target_table_id,
      target_start_at,
      target_end_at,
      source_price_rub,
      target_price_rub,
      price_difference_rub,
      request_message,
      expires_at,
      metadata
    )
    VALUES (
      'extension-offer:' || v_booking.id::text || ':' ||
        extract(epoch FROM v_booking.end_at)::bigint::text,
      v_booking.id,
      v_booking.user_id,
      'extension_offer',
      'offered',
      'system',
      v_booking.payment_group_id,
      v_booking.start_at,
      v_booking.end_at,
      v_booking.table_id,
      v_booking.end_at,
      v_booking.end_at + interval '60 minutes',
      v_booking.price_rub,
      v_base_price,
      v_offer_price,
      'Автоматическое предложение продлить текущую сессию на 60 минут со скидкой.',
      v_booking.end_at,
      pg_catalog.jsonb_build_object(
        'base_price_rub', v_base_price,
        'discount_percent', v_discount,
        'offer_amount_rub', v_offer_price,
        'duration_minutes', 60,
        'offer_created_at', v_now,
        'rounding', 'nearest_ruble'
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_operation_id;

    IF v_operation_id IS NOT NULL THEN
      INSERT INTO public.account_notifications (
        user_id, event_key, type, title, message, booking_id, payment_group_id
      )
      VALUES (
        v_booking.user_id,
        'extension-offer:' || v_operation_id::text,
        'system',
        'Продлите игру со скидкой',
        'Следующий час на вашем столе свободен. Вы можете продлить текущую сессию ещё на 60 минут по специальной цене ' ||
          v_offer_price::text || ' ₽. Предложение действует до окончания текущей сессии.',
        v_booking.id,
        v_booking.payment_group_id
      )
      ON CONFLICT (user_id, event_key) DO NOTHING;

      v_created := v_created + 1;
    END IF;

    v_operation_id := NULL;
  END LOOP;

  RETURN v_created;
END;
$function$;

CREATE OR REPLACE FUNCTION public.accept_booking_extension_offer(
  p_operation_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_operation public.booking_operations%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_payment_group_id uuid;
  v_hold_expires_at timestamptz;
  v_amount integer;
  v_studio_id uuid;
  v_table_active boolean;
  v_studio_active boolean;
  v_timezone text;
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_local_date date;
  v_weekday integer;
  v_interval_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_operation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Extension operation and user are required';
  END IF;

  SELECT st.studio_id
  INTO v_studio_id
  FROM public.booking_operations bo
  JOIN public.studio_tables st ON st.id = bo.target_table_id
  WHERE bo.id = p_operation_id
    AND bo.user_id = p_user_id
    AND bo.operation_type = 'extension_offer';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extension offer not found';
  END IF;

  PERFORM public.lock_ponglab_studio(v_studio_id);

  SELECT b.*
  INTO v_booking
  FROM public.bookings b
  JOIN public.booking_operations bo ON bo.booking_id = b.id
  WHERE bo.id = p_operation_id
    AND bo.user_id = p_user_id
    AND b.user_id = p_user_id
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source booking not found';
  END IF;

  SELECT *
  INTO v_operation
  FROM public.booking_operations
  WHERE id = p_operation_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_operation.operation_type <> 'extension_offer' THEN
    RAISE EXCEPTION 'Extension offer not found';
  END IF;

  IF v_operation.status = 'awaiting_payment'
     AND v_operation.adjustment_payment_group_id IS NOT NULL
  THEN
    SELECT pg.id, pg.amount_rub
    INTO v_payment_group_id, v_amount
    FROM public.payment_groups pg
    WHERE pg.id = v_operation.adjustment_payment_group_id
      AND pg.user_id = p_user_id
      AND pg.status = 'pending'
      AND pg.hold_expires_at > v_now;

    IF FOUND THEN
      RETURN pg_catalog.jsonb_build_object(
        'state', 'awaiting_payment',
        'operation_id', v_operation.id,
        'payment_group_id', v_payment_group_id,
        'amount_rub', v_amount
      );
    END IF;

    RAISE EXCEPTION 'Extension payment hold has expired';
  END IF;

  IF v_operation.status <> 'offered' THEN
    RAISE EXCEPTION 'Extension offer is no longer available';
  END IF;

  IF v_operation.expires_at IS NULL OR v_operation.expires_at <= v_now THEN
    RAISE EXCEPTION 'Extension offer has expired';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.booking_operations bo
    WHERE bo.booking_id = v_booking.id
      AND bo.id <> v_operation.id
      AND (
        (
          bo.status IN ('requested', 'offered', 'awaiting_payment', 'processing')
          AND bo.operation_type IN (
            'transfer', 'transfer_request', 'extension',
            'extension_offer', 'late_payment_refund', 'cancellation'
          )
        )
        OR (
          bo.status = 'failed'
          AND (
            bo.metadata ->> 'manual_resolution_required' = 'true'
            OR EXISTS (
              SELECT 1 FROM public.payment_refunds pr
              WHERE pr.booking_operation_id = bo.id
                AND pr.status IN ('pending', 'succeeded')
            )
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Another booking operation is active or unresolved';
  END IF;

  IF v_booking.status <> 'confirmed'
     OR v_booking.payment_status <> 'succeeded'
     OR v_booking.table_id <> v_operation.target_table_id
     OR v_booking.start_at <> v_operation.source_start_at
     OR v_booking.end_at <> v_operation.source_end_at
     OR v_booking.price_rub IS DISTINCT FROM v_operation.source_price_rub
     OR v_booking.end_at <> v_operation.target_start_at
     OR v_operation.target_end_at <> v_operation.target_start_at + interval '60 minutes'
     OR v_booking.payment_group_id <> v_operation.source_payment_group_id
     OR v_operation.price_difference_rub IS NULL
     OR v_operation.price_difference_rub < 1
     OR (v_operation.metadata ->> 'offer_amount_rub')::integer
          IS DISTINCT FROM v_operation.price_difference_rub
  THEN
    RAISE EXCEPTION 'Source booking or extension offer changed';
  END IF;

  SELECT st.is_active, s.is_active, s.timezone
  INTO v_table_active, v_studio_active, v_timezone
  FROM public.studio_tables st
  JOIN public.studios s ON s.id = st.studio_id
  WHERE st.id = v_booking.table_id;

  IF NOT FOUND OR NOT v_table_active OR NOT v_studio_active THEN
    RAISE EXCEPTION 'Studio table is not active';
  END IF;

  v_timezone := coalesce(nullif(v_timezone, ''), 'Europe/Moscow');
  v_local_start := v_operation.target_start_at AT TIME ZONE v_timezone;
  v_local_end := v_operation.target_end_at AT TIME ZONE v_timezone;
  v_local_date := v_local_start::date;
  v_weekday := extract(isodow FROM v_local_start)::integer;

  IF v_local_end::date <> v_local_date THEN
    RAISE EXCEPTION 'Extension is outside one local calendar day';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.studio_date_exceptions de
    WHERE de.studio_id = v_studio_id
      AND de.exception_date = v_local_date
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.studio_date_exceptions de
      WHERE de.studio_id = v_studio_id
        AND de.exception_date = v_local_date
        AND de.is_closed IS TRUE
    ) THEN
      RAISE EXCEPTION 'Studio is closed during the extension';
    END IF;

    SELECT count(*)::integer
    INTO v_interval_count
    FROM public.studio_date_exceptions de
    JOIN public.studio_date_exception_intervals dei
      ON dei.exception_id = de.id
    WHERE de.studio_id = v_studio_id
      AND de.exception_date = v_local_date
      AND de.is_closed IS FALSE
      AND dei.opens_at <= v_local_start::time
      AND dei.closes_at >= v_local_end::time;
  ELSE
    SELECT count(*)::integer
    INTO v_interval_count
    FROM public.studio_weekly_schedule ws
    JOIN public.studio_weekly_schedule_intervals wsi
      ON wsi.schedule_id = ws.id
    WHERE ws.studio_id = v_studio_id
      AND ws.weekday = v_weekday
      AND ws.is_open IS TRUE
      AND wsi.opens_at <= v_local_start::time
      AND wsi.closes_at >= v_local_end::time;
  END IF;

  IF v_interval_count <> 1 THEN
    RAISE EXCEPTION 'Extension is outside studio opening hours';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT wsi.opens_at
      FROM public.studio_weekly_schedule ws
      JOIN public.studio_weekly_schedule_intervals wsi
        ON wsi.schedule_id = ws.id
      WHERE ws.studio_id = v_studio_id
        AND ws.weekday = v_weekday
        AND ws.is_open IS TRUE
        AND NOT EXISTS (
          SELECT 1 FROM public.studio_date_exceptions de
          WHERE de.studio_id = v_studio_id
            AND de.exception_date = v_local_date
        )
      UNION ALL
      SELECT dei.opens_at
      FROM public.studio_date_exceptions de
      JOIN public.studio_date_exception_intervals dei
        ON dei.exception_id = de.id
      WHERE de.studio_id = v_studio_id
        AND de.exception_date = v_local_date
        AND de.is_closed IS FALSE
    ) opening
    WHERE v_local_start::time >= opening.opens_at
      AND mod(
        (extract(epoch FROM (v_local_start::time - opening.opens_at))::integer / 60),
        60
      ) = 0
  ) THEN
    RAISE EXCEPTION 'Extension start does not match the studio 60-minute slot grid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.table_id = v_operation.target_table_id
      AND b.id <> v_booking.id
      AND b.status IN ('pending_payment', 'confirmed')
      AND tstzrange(b.start_at, b.end_at, '[)')
          && tstzrange(v_operation.target_start_at, v_operation.target_end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Next hour on this table is no longer available';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.user_id = p_user_id
      AND b.id <> v_booking.id
      AND b.status IN ('pending_payment', 'confirmed')
      AND tstzrange(b.start_at, b.end_at, '[)')
          && tstzrange(v_operation.target_start_at, v_operation.target_end_at, '[)')
  ) THEN
    RAISE EXCEPTION 'Customer has another booking during the extension';
  END IF;

  v_amount := v_operation.price_difference_rub;
  v_hold_expires_at := v_now + interval '5 minutes';

  INSERT INTO public.payment_groups (
    user_id, provider, status, amount_rub, currency, hold_expires_at
  )
  VALUES (
    p_user_id, 'yookassa', 'pending', v_amount, 'RUB', v_hold_expires_at
  )
  RETURNING id INTO v_payment_group_id;

  INSERT INTO public.bookings (
    user_id,
    table_id,
    start_at,
    end_at,
    status,
    price_rub,
    payment_status,
    payment_provider,
    hold_expires_at,
    payment_group_id,
    booking_operation_id
  )
  VALUES (
    p_user_id,
    v_operation.target_table_id,
    v_operation.target_start_at,
    v_operation.target_end_at,
    'pending_payment',
    v_amount,
    'pending',
    'yookassa',
    v_hold_expires_at,
    v_payment_group_id,
    v_operation.id
  );

  UPDATE public.booking_operations
  SET status = 'awaiting_payment',
      adjustment_payment_group_id = v_payment_group_id,
      expires_at = v_hold_expires_at,
      metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'accepted_at', v_now,
        'payment_hold_expires_at', v_hold_expires_at
      ),
      updated_at = v_now
  WHERE id = v_operation.id
    AND status = 'offered';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Extension offer could not be accepted';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'awaiting_payment',
    'operation_id', v_operation.id,
    'payment_group_id', v_payment_group_id,
    'amount_rub', v_amount,
    'hold_expires_at', v_hold_expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_payment_group_success(
  p_payment_group_id uuid,
  p_provider_payment_id text,
  p_amount_rub integer
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_group public.payment_groups%ROWTYPE;
  v_booking_count integer;
  v_invalid_count integer;
  v_timeout_minutes integer;
  v_now timestamptz;
  v_placeholder public.bookings%ROWTYPE;
  v_transfer public.booking_operations%ROWTYPE;
  v_source_booking public.bookings%ROWTYPE;
BEGIN
  IF p_payment_group_id IS NULL
     OR p_provider_payment_id IS NULL
     OR length(trim(p_provider_payment_id)) = 0
     OR p_amount_rub IS NULL
     OR p_amount_rub <= 0
  THEN
    RAISE EXCEPTION 'Invalid payment confirmation parameters';
  END IF;

  SELECT * INTO v_group
  FROM public.payment_groups
  WHERE id = p_payment_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment group not found';
  END IF;

  IF v_group.provider <> 'yookassa' THEN
    RAISE EXCEPTION 'Unsupported payment provider';
  END IF;

  IF v_group.amount_rub <> p_amount_rub THEN
    RAISE EXCEPTION 'Payment amount mismatch';
  END IF;

  IF v_group.provider_payment_id IS NOT NULL
     AND v_group.provider_payment_id <> p_provider_payment_id
  THEN
    RAISE EXCEPTION 'Provider payment ID mismatch';
  END IF;

  IF v_group.status = 'refunded' THEN
    RETURN 'already_refunded';
  END IF;

  IF v_group.status = 'succeeded' THEN
    RETURN 'already_processed';
  END IF;

  IF v_group.status = 'cancelled'
     AND v_group.failure_reason = 'payment_timeout_10m|late_success_refund_required'
  THEN
    RETURN 'late_success_refund_required';
  END IF;

  IF v_group.status = 'cancelled'
     AND v_group.failure_reason = 'payment_timeout_10m'
  THEN
    UPDATE public.payment_groups
    SET provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
        failure_reason = 'payment_timeout_10m|late_success_refund_required',
        paid_at = coalesce(paid_at, pg_catalog.clock_timestamp()),
        last_checked_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_payment_group_id;

    RETURN 'late_success_refund_required';
  END IF;

  IF v_group.status <> 'pending' THEN
    RETURN 'terminal_state_conflict';
  END IF;

  IF v_group.payment_init_started_at IS NULL THEN
    RETURN 'payment_not_initialized';
  END IF;

  SELECT LEAST(
    60,
    GREATEST(1, coalesce(pg_catalog.max(sbs.hold_minutes)::integer, 5))
  )
  INTO v_timeout_minutes
  FROM public.bookings b
  JOIN public.studio_tables st ON st.id = b.table_id
  JOIN public.studio_booking_settings sbs ON sbs.studio_id = st.studio_id
  WHERE b.payment_group_id = p_payment_group_id;

  v_timeout_minutes := coalesce(v_timeout_minutes, 5);
  v_now := pg_catalog.clock_timestamp();

  IF v_group.payment_init_started_at
     + pg_catalog.make_interval(mins => v_timeout_minutes) <= v_now
  THEN
    PERFORM b.id
    FROM public.bookings b
    WHERE b.payment_group_id = p_payment_group_id
    FOR UPDATE;

    UPDATE public.payment_groups
    SET status = 'cancelled',
        provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
        failure_reason = 'payment_timeout_10m|late_success_refund_required',
        paid_at = coalesce(paid_at, v_now),
        last_checked_at = v_now,
        updated_at = v_now
    WHERE id = p_payment_group_id
      AND status = 'pending';

    UPDATE public.bookings
    SET status = 'expired',
        payment_status = 'cancelled',
        updated_at = v_now
    WHERE payment_group_id = p_payment_group_id
      AND status = 'pending_payment'
      AND payment_status = 'pending';

    RETURN 'late_success_refund_required';
  END IF;

  PERFORM b.id
  FROM public.bookings b
  WHERE b.payment_group_id = p_payment_group_id
  FOR UPDATE;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE b.user_id <> v_group.user_id
         OR b.status <> 'pending_payment'
         OR b.payment_status <> 'pending'
         OR b.payment_init_started_at IS NULL
    )::integer
  INTO v_booking_count, v_invalid_count
  FROM public.bookings b
  WHERE b.payment_group_id = p_payment_group_id;

  IF v_booking_count = 0 THEN
    RAISE EXCEPTION 'Payment group has no bookings';
  END IF;

  IF v_invalid_count > 0 THEN
    RETURN 'booking_state_conflict';
  END IF;

  SELECT *
  INTO v_placeholder
  FROM public.bookings b
  WHERE b.payment_group_id = p_payment_group_id
    AND b.booking_operation_id IS NOT NULL
  LIMIT 1;

  IF FOUND THEN
    IF v_booking_count <> 1 THEN
      RAISE EXCEPTION 'Operation adjustment group must contain exactly one placeholder';
    END IF;

    SELECT *
    INTO v_transfer
    FROM public.booking_operations bo
    WHERE bo.id = v_placeholder.booking_operation_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Booking operation not found';
    END IF;

    -- Extension payment: keep the original table and booking row; extend only
    -- its end_at after the provider has confirmed the payment.
    IF v_transfer.operation_type = 'extension_offer' THEN
      SELECT *
      INTO v_source_booking
      FROM public.bookings b
      WHERE b.id = v_transfer.booking_id
      FOR UPDATE;

      SELECT *
      INTO v_transfer
      FROM public.booking_operations bo
      WHERE bo.id = v_placeholder.booking_operation_id
      FOR UPDATE;

      IF NOT FOUND
         OR v_transfer.status <> 'awaiting_payment'
         OR v_transfer.user_id <> v_group.user_id
         OR v_transfer.adjustment_payment_group_id <> p_payment_group_id
         OR v_transfer.source_payment_group_id IS NULL
         OR v_transfer.source_price_rub IS NULL
         OR v_transfer.price_difference_rub IS DISTINCT FROM v_group.amount_rub
         OR v_transfer.target_price_rub IS NULL
         OR v_transfer.target_start_at IS DISTINCT FROM v_transfer.source_end_at
         OR v_transfer.target_end_at IS DISTINCT FROM
              v_transfer.target_start_at + interval '60 minutes'
         OR (v_transfer.metadata ->> 'offer_amount_rub')::integer
              IS DISTINCT FROM v_group.amount_rub
      THEN
        RAISE EXCEPTION 'Extension operation is not eligible for payment completion';
      END IF;

      IF v_source_booking.id IS NULL
         OR v_source_booking.user_id <> v_transfer.user_id
         OR v_source_booking.status <> 'confirmed'
         OR v_source_booking.payment_status <> 'succeeded'
         OR v_source_booking.table_id IS DISTINCT FROM v_transfer.target_table_id
         OR v_source_booking.start_at IS DISTINCT FROM v_transfer.source_start_at
         OR v_source_booking.end_at IS DISTINCT FROM v_transfer.source_end_at
         OR v_source_booking.payment_group_id IS DISTINCT FROM v_transfer.source_payment_group_id
         OR v_source_booking.price_rub IS DISTINCT FROM v_transfer.source_price_rub
      THEN
        RAISE EXCEPTION 'Source booking changed before extension payment completion';
      END IF;

      IF v_placeholder.booking_operation_id <> v_transfer.id
         OR v_placeholder.user_id <> v_transfer.user_id
         OR v_placeholder.status <> 'pending_payment'
         OR v_placeholder.payment_status <> 'pending'
         OR v_placeholder.payment_group_id <> p_payment_group_id
         OR v_placeholder.price_rub <> v_group.amount_rub
         OR v_placeholder.table_id <> v_transfer.target_table_id
         OR v_placeholder.start_at <> v_transfer.target_start_at
         OR v_placeholder.end_at <> v_transfer.target_end_at
         OR v_group.currency <> 'RUB'
      THEN
        RAISE EXCEPTION 'Extension placeholder or payment amount mismatch';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.booking_payment_allocations a
        WHERE a.booking_id = v_source_booking.id
          AND a.payment_group_id = p_payment_group_id
          AND (a.amount_rub <> v_group.amount_rub OR a.currency <> v_group.currency)
      ) THEN
        RAISE EXCEPTION 'Existing extension payment allocation is inconsistent';
      END IF;

      UPDATE public.payment_groups
      SET status = 'succeeded',
          provider_payment_id = p_provider_payment_id,
          paid_at = v_now,
          last_checked_at = v_now,
          updated_at = v_now
      WHERE id = p_payment_group_id;

      UPDATE public.bookings
      SET status = 'cancelled',
          payment_status = 'succeeded',
          updated_at = v_now
      WHERE id = v_placeholder.id
        AND booking_operation_id = v_transfer.id
        AND status = 'pending_payment';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Extension placeholder could not be released';
      END IF;

      UPDATE public.bookings
      SET end_at = v_transfer.target_end_at,
          price_rub = price_rub + v_group.amount_rub,
          updated_at = v_now
      WHERE id = v_source_booking.id
        AND status = 'confirmed'
        AND payment_status = 'succeeded'
        AND end_at = v_transfer.source_end_at;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Source booking could not be extended';
      END IF;

      INSERT INTO public.booking_payment_allocations (
        booking_id, payment_group_id, amount_rub, currency
      )
      VALUES (
        v_source_booking.id, p_payment_group_id, v_group.amount_rub, v_group.currency
      )
      ON CONFLICT (payment_group_id, booking_id) DO NOTHING;

      UPDATE public.booking_operations
      SET status = 'completed',
          completed_at = v_now,
          metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
            'payment_completed_at', v_now,
            'provider_payment_id', p_provider_payment_id,
            'extension_completed_end_at', v_transfer.target_end_at
          ),
          updated_at = v_now
      WHERE id = v_transfer.id
        AND status = 'awaiting_payment';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Extension operation could not be completed';
      END IF;

      RETURN 'extension_completed';
    END IF;

    -- Existing transfer branch remains unchanged.
    SELECT *
    INTO v_source_booking
    FROM public.bookings b
    WHERE b.id = v_transfer.booking_id
    FOR UPDATE;

    SELECT *
    INTO v_transfer
    FROM public.booking_operations bo
    WHERE bo.id = v_placeholder.booking_operation_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_transfer.operation_type <> 'transfer'
       OR v_transfer.status <> 'awaiting_payment'
       OR v_transfer.user_id <> v_group.user_id
       OR v_transfer.adjustment_payment_group_id <> p_payment_group_id
       OR v_transfer.price_difference_rub IS NULL
       OR v_transfer.price_difference_rub <= 0
       OR v_transfer.source_price_rub IS NULL
       OR v_transfer.target_price_rub IS NULL
       OR v_transfer.target_price_rub - v_transfer.source_price_rub
            <> v_transfer.price_difference_rub
    THEN
      RAISE EXCEPTION 'Transfer operation is not eligible for payment completion';
    END IF;

    IF v_source_booking.id IS NULL
       OR v_source_booking.user_id <> v_transfer.user_id
       OR v_source_booking.status <> 'confirmed'
       OR v_source_booking.payment_status <> 'succeeded'
       OR v_source_booking.start_at <> v_transfer.source_start_at
       OR v_source_booking.end_at <> v_transfer.source_end_at
       OR v_source_booking.price_rub <> v_transfer.source_price_rub
    THEN
      RAISE EXCEPTION 'Source booking changed before transfer payment completion';
    END IF;

    IF v_placeholder.booking_operation_id <> v_transfer.id
       OR v_placeholder.user_id <> v_transfer.user_id
       OR v_placeholder.status <> 'pending_payment'
       OR v_placeholder.payment_status <> 'pending'
       OR v_placeholder.payment_group_id <> p_payment_group_id
       OR v_placeholder.price_rub <> v_transfer.price_difference_rub
       OR v_placeholder.table_id <> v_transfer.target_table_id
       OR v_placeholder.start_at <> v_transfer.target_start_at
       OR v_placeholder.end_at <> v_transfer.target_end_at
       OR v_transfer.target_end_at <> v_transfer.target_start_at + interval '60 minutes'
       OR v_group.amount_rub <> v_transfer.price_difference_rub
       OR v_group.currency <> 'RUB'
    THEN
      RAISE EXCEPTION 'Transfer placeholder or adjustment amount mismatch';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.booking_payment_allocations a
      WHERE a.booking_id = v_source_booking.id
        AND a.payment_group_id = p_payment_group_id
        AND (a.amount_rub <> v_group.amount_rub OR a.currency <> v_group.currency)
    ) THEN
      RAISE EXCEPTION 'Existing transfer payment allocation is inconsistent';
    END IF;

    UPDATE public.payment_groups
    SET status = 'succeeded',
        provider_payment_id = p_provider_payment_id,
        paid_at = v_now,
        last_checked_at = v_now,
        updated_at = v_now
    WHERE id = p_payment_group_id;

    UPDATE public.bookings
    SET status = 'cancelled',
        payment_status = 'succeeded',
        updated_at = v_now
    WHERE id = v_placeholder.id
      AND booking_operation_id = v_transfer.id
      AND status = 'pending_payment';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transfer placeholder could not be released';
    END IF;

    UPDATE public.bookings
    SET table_id = v_transfer.target_table_id,
        start_at = v_transfer.target_start_at,
        end_at = v_transfer.target_end_at,
        price_rub = v_transfer.target_price_rub,
        updated_at = v_now
    WHERE id = v_source_booking.id
      AND status = 'confirmed'
      AND payment_status = 'succeeded';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source booking could not be moved to target slot';
    END IF;

    INSERT INTO public.booking_payment_allocations (
      booking_id, payment_group_id, amount_rub, currency
    )
    VALUES (
      v_source_booking.id, p_payment_group_id, v_group.amount_rub, v_group.currency
    )
    ON CONFLICT (payment_group_id, booking_id) DO NOTHING;

    UPDATE public.booking_operations
    SET status = 'completed',
        completed_at = v_now,
        updated_at = v_now
    WHERE id = v_transfer.id
      AND status = 'awaiting_payment';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Transfer operation could not be completed';
    END IF;

    RETURN 'transfer_completed';
  END IF;

  -- Standard booking payment path.
  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    LEFT JOIN public.booking_payment_allocations a
      ON a.booking_id = b.id
     AND a.payment_group_id = p_payment_group_id
    WHERE b.payment_group_id = p_payment_group_id
      AND a.id IS NOT NULL
      AND (a.amount_rub <> b.price_rub OR a.currency <> v_group.currency)
  ) THEN
    RAISE EXCEPTION 'Existing payment allocation does not match booking';
  END IF;

  UPDATE public.payment_groups
  SET status = 'succeeded',
      provider_payment_id = p_provider_payment_id,
      paid_at = pg_catalog.clock_timestamp(),
      last_checked_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = p_payment_group_id;

  UPDATE public.bookings
  SET status = 'confirmed',
      payment_status = 'succeeded',
      updated_at = pg_catalog.clock_timestamp()
  WHERE payment_group_id = p_payment_group_id;

  INSERT INTO public.booking_payment_allocations (
    booking_id, payment_group_id, amount_rub, currency
  )
  SELECT b.id, p_payment_group_id, b.price_rub, v_group.currency
  FROM public.bookings b
  WHERE b.payment_group_id = p_payment_group_id
    AND b.status = 'confirmed'
    AND b.payment_status = 'succeeded'
  ON CONFLICT (payment_group_id, booking_id) DO NOTHING;

  RETURN 'confirmed';
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_transfer_operation_payment_terminal_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_operation_status text;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF TG_OP <> 'UPDATE'
     OR OLD.status <> 'pending'
     OR NEW.status NOT IN ('cancelled', 'failed')
  THEN
    RETURN NEW;
  END IF;

  v_operation_status := CASE
    WHEN NEW.failure_reason = 'payment_timeout_10m'
      OR NEW.failure_reason LIKE 'payment_timeout_10m|%'
      OR NEW.failure_reason = 'extension_offer_payment_hold_expired'
    THEN 'expired'
    ELSE 'failed'
  END;

  UPDATE public.booking_operations bo
  SET status = v_operation_status,
      updated_at = v_now,
      metadata = bo.metadata || pg_catalog.jsonb_build_object(
        'payment_terminal_status', NEW.status,
        'payment_failure_reason', NEW.failure_reason,
        'payment_terminal_at', v_now
      )
  WHERE bo.operation_type IN ('transfer', 'extension_offer')
    AND bo.status = 'awaiting_payment'
    AND bo.adjustment_payment_group_id = NEW.id
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.booking_operation_id = bo.id
        AND b.payment_group_id = NEW.id
    );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prepare_late_payment_refund(
  p_payment_group_id uuid,
  p_provider_payment_id text,
  p_amount_rub integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_group public.payment_groups%ROWTYPE;
  v_placeholder public.bookings%ROWTYPE;
  v_booking public.bookings%ROWTYPE;
  v_transfer public.booking_operations%ROWTYPE;
  v_operation public.booking_operations%ROWTYPE;
  v_refund public.payment_refunds%ROWTYPE;
  v_booking_count integer;
  v_invalid_booking_count integer;
  v_operation_link_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_operation_key text;
BEGIN
  IF p_payment_group_id IS NULL
     OR p_provider_payment_id IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_provider_payment_id)) < 1
     OR pg_catalog.length(p_provider_payment_id) > 200
     OR p_amount_rub IS NULL
     OR p_amount_rub <= 0
  THEN
    RAISE EXCEPTION 'Invalid late payment refund parameters';
  END IF;

  SELECT * INTO v_group
  FROM public.payment_groups
  WHERE id = p_payment_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment group not found';
  END IF;

  IF v_group.provider IS DISTINCT FROM 'yookassa'
     OR v_group.currency IS DISTINCT FROM 'RUB'
     OR v_group.amount_rub IS DISTINCT FROM p_amount_rub
     OR v_group.provider_payment_id IS DISTINCT FROM p_provider_payment_id
     OR v_group.status IS DISTINCT FROM 'cancelled'
     OR v_group.failure_reason IS DISTINCT FROM
        'payment_timeout_10m|late_success_refund_required'
  THEN
    RAISE EXCEPTION 'Payment group is not eligible for late-success refund';
  END IF;

  PERFORM b.id
  FROM public.bookings b
  WHERE b.payment_group_id = p_payment_group_id
  FOR UPDATE;

  SELECT *
  INTO v_placeholder
  FROM public.bookings
  WHERE payment_group_id = p_payment_group_id
  ORDER BY created_at, id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Late payment group has no bookings';
  END IF;

  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE b.user_id IS DISTINCT FROM v_group.user_id
         OR b.status NOT IN ('expired', 'cancelled')
         OR b.payment_status IS DISTINCT FROM 'cancelled'
    )::integer,
    (
      count(DISTINCT b.booking_operation_id)
      + CASE WHEN count(*) FILTER (WHERE b.booking_operation_id IS NULL) > 0
        THEN 1 ELSE 0 END
    )::integer
  INTO v_booking_count, v_invalid_booking_count, v_operation_link_count
  FROM public.bookings b
  WHERE b.payment_group_id = p_payment_group_id;

  IF v_booking_count = 0
     OR v_invalid_booking_count > 0
     OR v_operation_link_count <> 1
  THEN
    RAISE EXCEPTION 'Late payment bookings are not all released or consistently linked';
  END IF;

  v_booking := v_placeholder;

  IF v_placeholder.booking_operation_id IS NOT NULL THEN
    SELECT *
    INTO v_transfer
    FROM public.booking_operations
    WHERE id = v_placeholder.booking_operation_id
    FOR UPDATE;

    IF NOT FOUND OR v_transfer.user_id IS DISTINCT FROM v_group.user_id
       OR v_transfer.adjustment_payment_group_id IS DISTINCT FROM p_payment_group_id
    THEN
      RAISE EXCEPTION 'Late payment operation link is invalid';
    END IF;

    IF v_transfer.operation_type = 'transfer' THEN
      SELECT *
      INTO v_booking
      FROM public.bookings
      WHERE id = v_transfer.booking_id
        AND user_id = v_group.user_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Original transfer booking not found';
      END IF;
    ELSIF v_transfer.operation_type = 'extension_offer' THEN
      IF v_transfer.status NOT IN ('expired', 'failed')
         OR v_transfer.source_end_at IS NULL
         OR v_transfer.target_start_at IS DISTINCT FROM v_transfer.source_end_at
         OR v_transfer.target_end_at IS DISTINCT FROM
              v_transfer.target_start_at + interval '60 minutes'
         OR v_transfer.price_difference_rub IS DISTINCT FROM p_amount_rub
      THEN
        RAISE EXCEPTION 'Late extension payment operation is invalid';
      END IF;

      IF v_placeholder.booking_operation_id IS DISTINCT FROM v_transfer.id
         OR v_placeholder.user_id IS DISTINCT FROM v_group.user_id
         OR v_placeholder.payment_group_id IS DISTINCT FROM p_payment_group_id
         OR v_placeholder.table_id IS DISTINCT FROM v_transfer.target_table_id
         OR v_placeholder.start_at IS DISTINCT FROM v_transfer.target_start_at
         OR v_placeholder.end_at IS DISTINCT FROM v_transfer.target_end_at
         OR v_placeholder.price_rub IS DISTINCT FROM p_amount_rub
      THEN
        RAISE EXCEPTION 'Late extension placeholder does not match operation';
      END IF;

      SELECT *
      INTO v_booking
      FROM public.bookings
      WHERE id = v_transfer.booking_id
        AND user_id = v_group.user_id
      FOR UPDATE;

      IF NOT FOUND
         OR v_booking.status NOT IN ('confirmed', 'completed')
         OR v_booking.payment_status <> 'succeeded'
         OR v_booking.start_at IS DISTINCT FROM v_transfer.source_start_at
         OR v_booking.end_at IS DISTINCT FROM v_transfer.source_end_at
         OR v_booking.table_id IS DISTINCT FROM v_transfer.target_table_id
         OR v_booking.price_rub IS DISTINCT FROM v_transfer.source_price_rub
      THEN
        RAISE EXCEPTION 'Original booking changed before late extension refund';
      END IF;
    ELSE
      RAISE EXCEPTION 'Unsupported late payment operation type';
    END IF;
  END IF;

  v_operation_key := 'late-payment-refund:' || p_payment_group_id::text;

  SELECT *
  INTO v_operation
  FROM public.booking_operations
  WHERE idempotency_key = v_operation_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.booking_operations (
      idempotency_key,
      booking_id,
      user_id,
      operation_type,
      status,
      actor_type,
      source_payment_group_id,
      metadata
    )
    VALUES (
      v_operation_key,
      v_booking.id,
      v_group.user_id,
      'late_payment_refund',
      'processing',
      'system',
      p_payment_group_id,
      pg_catalog.jsonb_build_object(
        'late_payment_group_id', p_payment_group_id,
        'late_payment_booking_ids', (
          SELECT pg_catalog.jsonb_agg(b.id ORDER BY b.created_at, b.id)
          FROM public.bookings b
          WHERE b.payment_group_id = p_payment_group_id
        ),
        'related_transfer_operation_id',
          CASE WHEN v_transfer.operation_type = 'transfer' THEN v_transfer.id ELSE NULL END,
        'related_extension_operation_id',
          CASE WHEN v_transfer.operation_type = 'extension_offer' THEN v_transfer.id ELSE NULL END,
        'refund_amount_rub', v_group.amount_rub,
        'reason', 'payment_succeeded_after_local_timeout'
      )
    )
    RETURNING * INTO v_operation;
  ELSE
    IF v_operation.operation_type IS DISTINCT FROM 'late_payment_refund'
       OR v_operation.user_id IS DISTINCT FROM v_group.user_id
       OR v_operation.booking_id IS DISTINCT FROM v_booking.id
       OR v_operation.source_payment_group_id IS DISTINCT FROM p_payment_group_id
    THEN
      RAISE EXCEPTION 'Late payment refund idempotency record mismatch';
    END IF;
  END IF;

  IF v_operation.status = 'completed' THEN
    SELECT *
    INTO v_refund
    FROM public.payment_refunds
    WHERE booking_operation_id = v_operation.id
      AND payment_group_id = p_payment_group_id
      AND status = 'succeeded'
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Completed late refund operation has no succeeded refund';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'state', 'refunded',
      'operation_id', v_operation.id,
      'refund_id', v_refund.id
    );
  END IF;

  IF v_operation.status <> 'processing'
     OR v_operation.metadata->>'manual_resolution_required' = 'true'
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'review_required',
      'operation_id', v_operation.id
    );
  END IF;

  SELECT *
  INTO v_refund
  FROM public.payment_refunds
  WHERE booking_operation_id = v_operation.id
    AND payment_group_id = p_payment_group_id
    AND status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'pending',
      'operation_id', v_operation.id,
      'refund_id', v_refund.id,
      'idempotency_key', v_refund.idempotency_key,
      'provider_refund_id', v_refund.provider_refund_id,
      'amount_rub', v_refund.amount_rub,
      'provider_payment_id', v_refund.provider_payment_id
    );
  END IF;

  SELECT *
  INTO v_refund
  FROM public.payment_refunds
  WHERE booking_operation_id = v_operation.id
    AND payment_group_id = p_payment_group_id
    AND status IN ('cancelled', 'failed')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'state',
      CASE WHEN v_refund.status = 'cancelled' THEN 'retry_required' ELSE 'review_required' END,
      'operation_id', v_operation.id,
      'refund_id', v_refund.id
    );
  END IF;

  INSERT INTO public.payment_refunds (
    booking_operation_id,
    payment_group_id,
    provider,
    provider_payment_id,
    amount_rub,
    idempotency_key,
    requested_by_user_id
  )
  VALUES (
    v_operation.id,
    p_payment_group_id,
    'yookassa',
    p_provider_payment_id,
    p_amount_rub,
    pg_catalog.gen_random_uuid()::text,
    NULL
  )
  RETURNING * INTO v_refund;

  UPDATE public.booking_operations
  SET status = 'processing',
      metadata = coalesce(metadata, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'refund_retry_required', false,
        'refund_last_attempt_created_at', v_now
      ),
      updated_at = v_now
  WHERE id = v_operation.id
    AND status = 'processing';

  RETURN pg_catalog.jsonb_build_object(
    'state', 'pending',
    'operation_id', v_operation.id,
    'refund_id', v_refund.id,
    'idempotency_key', v_refund.idempotency_key,
    'provider_refund_id', v_refund.provider_refund_id,
    'amount_rub', v_refund.amount_rub,
    'provider_payment_id', v_refund.provider_payment_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_due_booking_extension_offers() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_due_booking_extension_offers() TO service_role;

REVOKE ALL ON FUNCTION public.accept_booking_extension_offer(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_booking_extension_offer(uuid, uuid) TO service_role;

-- Existing trigger remains attached; only its function body is extended.
-- Run the scheduler every 10 seconds, without duplicating an existing job.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'ponglab-create-booking-extension-offers'
  ) THEN
    PERFORM cron.schedule(
      'ponglab-create-booking-extension-offers',
      '10 seconds',
      'SELECT public.create_due_booking_extension_offers();'
    );
  END IF;
END;
$$;
