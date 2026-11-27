-- PongLab: complete pass/service booking workflows.
-- Requires migrations 20261126103000, 20261126120000 and 20261126123000.
-- This migration does not rewrite the existing cash booking/payment flow.

BEGIN;

-- ---------------------------------------------------------------------------
-- Idempotency for new booking orders and pass purchases.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS booking_request_key text;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_request_key_length
  CHECK (booking_request_key IS NULL OR length(btrim(booking_request_key)) BETWEEN 1 AND 200);

CREATE UNIQUE INDEX IF NOT EXISTS bookings_user_request_start_uidx
  ON public.bookings(user_id, booking_request_key, start_at)
  WHERE booking_request_key IS NOT NULL;

ALTER TABLE public.user_passes
  ADD COLUMN IF NOT EXISTS purchase_request_key text;

ALTER TABLE public.user_passes
  ADD CONSTRAINT user_passes_purchase_request_key_length
  CHECK (purchase_request_key IS NULL OR length(btrim(purchase_request_key)) BETWEEN 1 AND 200);

CREATE UNIQUE INDEX IF NOT EXISTS user_passes_user_purchase_request_uidx
  ON public.user_passes(user_id, purchase_request_key)
  WHERE purchase_request_key IS NOT NULL;

-- Service refunds are separate booking operations and have their own lifecycle.
ALTER TABLE public.booking_operations
  DROP CONSTRAINT IF EXISTS booking_operations_operation_type_check;
ALTER TABLE public.booking_operations
  ADD CONSTRAINT booking_operations_operation_type_check
  CHECK (operation_type IN (
    'cancellation', 'transfer', 'transfer_request', 'extension',
    'extension_offer', 'force_majeure', 'late_payment_refund', 'service_refund'
  ));

-- ---------------------------------------------------------------------------
-- Service availability rules.
-- Supported JSON shape:
-- {
--   "weekdays": [1,2,3,4,5,6,7],
--   "date_ranges": [{"from":"2026-01-01","to":"2026-12-31"}],
--   "time_intervals": [{"starts_at":"10:00","ends_at":"20:00"}]
-- }
-- An omitted or empty dimension means no restriction for that dimension.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_service_available_for_slot(
  p_rules jsonb,
  p_timezone text,
  p_start_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $function$
DECLARE
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_date date;
  v_weekday integer;
  v_weekdays jsonb;
  v_date_ranges jsonb;
  v_intervals jsonb;
BEGIN
  IF p_rules IS NULL OR jsonb_typeof(p_rules) <> 'object'
     OR p_timezone IS NULL OR p_start_at IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = p_timezone
  ) THEN
    RETURN false;
  END IF;

  v_local_start := p_start_at AT TIME ZONE p_timezone;
  v_local_end := (p_start_at + interval '60 minutes') AT TIME ZONE p_timezone;
  IF v_local_start::date <> v_local_end::date THEN
    RETURN false;
  END IF;
  v_date := v_local_start::date;
  v_weekday := extract(isodow FROM v_local_start)::integer;

  v_weekdays := COALESCE(p_rules->'weekdays', '[]'::jsonb);
  v_date_ranges := COALESCE(p_rules->'date_ranges', '[]'::jsonb);
  v_intervals := COALESCE(p_rules->'time_intervals', '[]'::jsonb);

  IF jsonb_typeof(v_weekdays) <> 'array'
     OR jsonb_typeof(v_date_ranges) <> 'array'
     OR jsonb_typeof(v_intervals) <> 'array' THEN
    RETURN false;
  END IF;

  IF jsonb_array_length(v_weekdays) > 0 AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(v_weekdays) AS d(value)
    WHERE d.value ~ '^[1-7]$' AND d.value::integer = v_weekday
  ) THEN
    RETURN false;
  END IF;

  IF jsonb_array_length(v_date_ranges) > 0 AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_date_ranges) AS r(value)
    WHERE COALESCE(r.value->>'from', '') ~ '^\d{4}-\d{2}-\d{2}$'
      AND COALESCE(r.value->>'to', '') ~ '^\d{4}-\d{2}-\d{2}$'
      AND v_date BETWEEN (r.value->>'from')::date AND (r.value->>'to')::date
  ) THEN
    RETURN false;
  END IF;

  IF jsonb_array_length(v_intervals) > 0 AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_intervals) AS t(value)
    WHERE COALESCE(t.value->>'starts_at', '') ~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
      AND COALESCE(t.value->>'ends_at', '') ~ '^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$'
      AND (t.value->>'starts_at')::time <= v_local_start::time
      AND (t.value->>'ends_at')::time >= v_local_end::time
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$function$;

-- Seed default disabled service rows for existing clubs. New clubs receive the
-- same rows through the trigger below; the owner enables and configures them.
INSERT INTO public.studio_services(
  studio_id, service_key, title, description, is_enabled, price_rub,
  charge_mode, availability_rules
)
SELECT s.id, v.service_key, v.title, NULL, false, 0, 'per_slot', '{}'::jsonb
FROM public.studios s
CROSS JOIN (VALUES
  ('joint_play'::text, 'Совместная сессия'::text),
  ('coach_session'::text, 'Сессия с тренером'::text)
) AS v(service_key, title)
ON CONFLICT (studio_id, service_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.seed_default_studio_services()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.studio_services(
    studio_id, service_key, title, description, is_enabled, price_rub,
    charge_mode, availability_rules
  ) VALUES
    (NEW.id, 'joint_play', 'Совместная сессия', NULL, false, 0, 'per_slot', '{}'::jsonb),
    (NEW.id, 'coach_session', 'Сессия с тренером', NULL, false, 0, 'per_slot', '{}'::jsonb)
  ON CONFLICT (studio_id, service_key) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS studios_seed_default_services ON public.studios;
CREATE TRIGGER studios_seed_default_services
AFTER INSERT ON public.studios
FOR EACH ROW EXECUTE FUNCTION public.seed_default_studio_services();

-- ---------------------------------------------------------------------------
-- Idempotent pass purchase order. The existing payment core activates the pass
-- only after the authoritative YooKassa success webhook.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer_pass_purchase_order(
  p_user_id uuid,
  p_plan_id uuid,
  p_request_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_plan public.pass_plans%ROWTYPE;
  v_pass public.user_passes%ROWTYPE;
  v_group public.payment_groups%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF p_user_id IS NULL OR p_plan_id IS NULL
     OR p_request_key IS NULL
     OR length(btrim(p_request_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid pass purchase parameters';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_request_key, 0)
  );

  SELECT * INTO v_pass
  FROM public.user_passes
  WHERE user_id = p_user_id AND purchase_request_key = p_request_key
  FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_group
    FROM public.payment_groups
    WHERE id = v_pass.purchase_payment_group_id;

    RETURN pg_catalog.jsonb_build_object(
      'state', CASE
        WHEN v_pass.status = 'active' THEN 'succeeded'
        WHEN v_pass.status = 'pending_payment' AND v_group.status = 'pending'
             AND ((v_group.payment_init_started_at IS NULL AND v_group.hold_expires_at > v_now)
               OR (v_group.payment_init_started_at IS NOT NULL
                   AND v_group.payment_init_started_at + interval '5 minutes' > v_now)) THEN 'pending'
        ELSE 'expired'
      END,
      'pass_id', v_pass.id,
      'payment_group_id', v_pass.purchase_payment_group_id,
      'amount_rub', v_pass.plan_price_rub_snapshot,
      'status', v_pass.status,
      'hold_expires_at', v_group.hold_expires_at
    );
  END IF;

  SELECT pp.* INTO v_plan
  FROM public.pass_plans pp
  JOIN public.cities c ON c.id = pp.city_id
  WHERE pp.id = p_plan_id
    AND pp.is_active
    AND c.is_active
    AND c.timezone IS NOT NULL
  FOR SHARE OF pp, c;

  IF NOT FOUND THEN RAISE EXCEPTION 'Pass plan is not available'; END IF;

  INSERT INTO public.payment_groups(
    user_id, provider, status, amount_rub, currency, hold_expires_at, order_type
  ) VALUES (
    p_user_id, 'yookassa', 'pending', v_plan.price_rub, 'RUB',
    v_now + interval '5 minutes', 'pass_purchase'
  ) RETURNING * INTO v_group;

  INSERT INTO public.user_passes(
    user_id, plan_id, city_id, purchase_payment_group_id,
    plan_name_snapshot, plan_price_rub_snapshot, total_hours,
    remaining_hours, reserved_hours, status, plan_snapshot,
    timezone_snapshot, purchase_request_key
  ) VALUES (
    p_user_id, v_plan.id, v_plan.city_id, v_group.id,
    v_plan.name, v_plan.price_rub, v_plan.hours_count,
    0, 0, 'pending_payment',
    pg_catalog.jsonb_build_object(
      'name', v_plan.name,
      'description', v_plan.description,
      'price_rub', v_plan.price_rub,
      'hours_count', v_plan.hours_count,
      'validity', 'one_calendar_month'
    ),
    (SELECT c.timezone FROM public.cities c WHERE c.id = v_plan.city_id),
    p_request_key
  ) RETURNING * INTO v_pass;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'pending',
    'pass_id', v_pass.id,
    'payment_group_id', v_group.id,
    'amount_rub', v_group.amount_rub,
    'status', v_pass.status,
    'hold_expires_at', v_group.hold_expires_at
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Idempotent read-back for a booking order whose HTTP response was lost.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_booking_order_by_request_key(
  p_user_id uuid,
  p_request_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
  v_group_id uuid;
  v_funding_method text;
  v_group public.payment_groups%ROWTYPE;
  v_rows jsonb;
  v_state text;
BEGIN
  IF p_user_id IS NULL OR p_request_key IS NULL
     OR length(btrim(p_request_key)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Invalid booking request key';
  END IF;

  SELECT count(*)::integer,
         (array_agg(b.payment_group_id))[1],
         min(b.funding_method)
  INTO v_count, v_group_id, v_funding_method
  FROM public.bookings b
  WHERE b.user_id = p_user_id AND b.booking_request_key = p_request_key;

  IF v_count = 0 THEN RETURN NULL; END IF;

  SELECT pg.* INTO v_group
  FROM public.payment_groups pg
  WHERE pg.id = v_group_id;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', b.id, 'start_at', b.start_at, 'end_at', b.end_at,
      'price_rub', b.price_rub, 'status', b.status,
      'hold_expires_at', b.hold_expires_at
    ) ORDER BY b.start_at
  ) INTO v_rows
  FROM public.bookings b
  WHERE b.user_id = p_user_id AND b.booking_request_key = p_request_key;

  IF v_group_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.user_id = p_user_id AND b.booking_request_key = p_request_key
        AND (b.status <> 'confirmed' OR b.payment_status <> 'succeeded')
    ) THEN
      v_state := 'expired';
    ELSE
      v_state := 'confirmed';
    END IF;
  ELSE
    v_state := CASE
      WHEN v_group.status = 'succeeded' THEN 'confirmed'
      WHEN v_group.status = 'pending' AND (
        (v_group.payment_init_started_at IS NULL AND v_group.hold_expires_at > pg_catalog.clock_timestamp())
        OR (v_group.payment_init_started_at IS NOT NULL
            AND v_group.payment_init_started_at + interval '5 minutes' > pg_catalog.clock_timestamp())
      ) THEN 'payment'
      ELSE 'expired'
    END;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'state', v_state,
    'next_step', CASE WHEN v_state = 'payment' THEN 'payment' ELSE 'confirmed' END,
    'payment_group_id', v_group_id,
    'bookings', COALESCE(v_rows, '[]'::jsonb),
    'total_price_rub', CASE WHEN v_group_id IS NULL THEN 0 ELSE v_group.amount_rub END,
    'hold_expires_at', CASE WHEN v_group_id IS NULL THEN NULL
      WHEN v_group.payment_init_started_at IS NOT NULL THEN v_group.payment_init_started_at + interval '5 minutes'
      ELSE v_group.hold_expires_at END,
    'funding_method', v_funding_method
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Atomic booking order for pass-funded bookings and/or additional services.
-- Ordinary cash bookings without services continue through the existing RPC.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer_booking_order(
  p_user_id uuid,
  p_provider text,
  p_hold_expires_at timestamptz,
  p_bookings jsonb,
  p_customer_comment text,
  p_funding_method text,
  p_user_pass_id uuid,
  p_service_ids uuid[],
  p_request_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_created jsonb;
  v_group_id uuid;
  v_studio_id uuid;
  v_city_id uuid;
  v_timezone text;
  v_booking_count integer;
  v_slot_total integer;
  v_cash_total integer;
  v_service_total integer := 0;
  v_service_count integer;
  v_due_total integer;
  v_service public.studio_services%ROWTYPE;
  v_group_service_id uuid;
  v_pass public.user_passes%ROWTYPE;
  v_first_start timestamptz;
  v_last_start timestamptz;
  v_bookings jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_existing jsonb;
  v_id_count integer;
  v_existing_starts timestamptz[];
  v_requested_starts timestamptz[];
BEGIN
  IF p_user_id IS NULL OR p_provider IS DISTINCT FROM 'yookassa'
     OR p_funding_method IS NULL OR p_funding_method NOT IN ('cash', 'pass')
     OR p_request_key IS NULL
     OR length(btrim(p_request_key)) NOT BETWEEN 1 AND 200
     OR p_bookings IS NULL OR jsonb_typeof(p_bookings) <> 'array'
     OR COALESCE(cardinality(p_service_ids), 0) > 2 THEN
    RAISE EXCEPTION 'Invalid booking order parameters';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text || ':' || p_request_key, 0)
  );

  v_existing := public.get_customer_booking_order_by_request_key(p_user_id, p_request_key);
  IF v_existing IS NOT NULL THEN
    IF v_existing->>'state' = 'expired' THEN
      RAISE EXCEPTION 'Previous booking request expired; use a new request key';
    END IF;

    SELECT pg_catalog.array_agg((item->>'start_at')::timestamptz ORDER BY (item->>'start_at')::timestamptz)
    INTO v_existing_starts
    FROM pg_catalog.jsonb_array_elements(v_existing->'bookings') item;

    SELECT pg_catalog.array_agg((item->>'start_at')::timestamptz ORDER BY (item->>'start_at')::timestamptz)
    INTO v_requested_starts
    FROM pg_catalog.jsonb_array_elements(p_bookings) item;

    IF v_existing_starts IS DISTINCT FROM v_requested_starts THEN
      RAISE EXCEPTION 'Booking request key was reused for a different slot selection';
    END IF;

    RETURN v_existing;
  END IF;

  IF p_funding_method = 'pass' AND p_user_pass_id IS NULL THEN
    RAISE EXCEPTION 'Select an active pass';
  END IF;
  IF p_funding_method = 'cash' AND p_user_pass_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cash booking cannot include a pass';
  END IF;

  v_id_count := COALESCE(cardinality(p_service_ids), 0);
  IF v_id_count > 0 AND (
    SELECT count(DISTINCT u.service_id) FROM unnest(p_service_ids) AS u(service_id)
  ) <> v_id_count THEN
    RAISE EXCEPTION 'Duplicate service selection';
  END IF;

  v_created := public.create_payment_group_with_bookings(
    p_user_id, p_provider, p_hold_expires_at, p_bookings, p_customer_comment
  );
  v_group_id := NULLIF(v_created->>'payment_group_id', '')::uuid;
  IF v_group_id IS NULL THEN RAISE EXCEPTION 'Booking payment group was not created'; END IF;

  SELECT count(*)::integer, sum(b.price_rub)::integer,
         min(b.start_at), max(b.start_at), (array_agg(st.studio_id))[1]
  INTO v_booking_count, v_slot_total, v_first_start, v_last_start, v_studio_id
  FROM public.bookings b
  JOIN public.studio_tables st ON st.id = b.table_id
  WHERE b.payment_group_id = v_group_id;

  IF v_booking_count < 1 OR v_booking_count > 10 THEN
    RAISE EXCEPTION 'Invalid created booking count';
  END IF;

  SELECT s.city_id, s.timezone INTO v_city_id, v_timezone
  FROM public.studios s WHERE s.id = v_studio_id AND s.is_active;
  IF NOT FOUND OR v_city_id IS NULL OR v_timezone IS NULL THEN
    RAISE EXCEPTION 'Booking studio or city is unavailable';
  END IF;

  UPDATE public.bookings
  SET funding_method = p_funding_method,
      booking_request_key = p_request_key
  WHERE payment_group_id = v_group_id;

  v_cash_total := CASE WHEN p_funding_method = 'cash' THEN v_slot_total ELSE 0 END;

  IF p_funding_method = 'pass' THEN
    SELECT * INTO v_pass
    FROM public.user_passes
    WHERE id = p_user_pass_id AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND OR v_pass.status <> 'active'
       OR v_pass.city_id <> v_city_id
       OR v_pass.starts_at IS NULL OR v_pass.expires_at IS NULL
       OR v_pass.starts_at > v_first_start
       OR v_last_start >= v_pass.expires_at
       OR v_pass.expires_at <= v_now
       OR v_pass.remaining_hours < v_booking_count THEN
      RAISE EXCEPTION 'Selected pass is not valid for all requested slots or has insufficient hours';
    END IF;
  END IF;

  IF v_id_count > 0 THEN
    SELECT count(*)::integer INTO v_service_count
    FROM public.studio_services ss
    WHERE ss.id = ANY(p_service_ids)
      AND ss.studio_id = v_studio_id
      AND ss.is_enabled
      AND ss.price_rub > 0;

    IF v_service_count <> v_id_count THEN
      RAISE EXCEPTION 'One or more selected services are disabled or unavailable in this club';
    END IF;

    v_service_total := 0;

    FOR v_service IN
      SELECT * FROM public.studio_services ss
      WHERE ss.id = ANY(p_service_ids)
        AND ss.studio_id = v_studio_id
        AND ss.is_enabled
      ORDER BY ss.service_key
      FOR SHARE
    LOOP
      IF EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.payment_group_id = v_group_id
          AND NOT public.is_service_available_for_slot(
            v_service.availability_rules, v_timezone, b.start_at
          )
      ) THEN
        RAISE EXCEPTION 'Selected service is unavailable for one or more selected slots';
      END IF;

      INSERT INTO public.booking_service_groups(
        user_id, studio_service_id, service_key, title_snapshot,
        description_snapshot, charge_mode_snapshot, unit_price_rub_snapshot,
        slot_count, total_price_rub, status, service_snapshot
      ) VALUES (
        p_user_id, v_service.id, v_service.service_key, v_service.title,
        v_service.description, v_service.charge_mode, v_service.price_rub,
        v_booking_count,
        CASE WHEN v_service.charge_mode = 'per_slot'
             THEN v_service.price_rub * v_booking_count
             ELSE v_service.price_rub END,
        'pending_payment',
        pg_catalog.jsonb_build_object(
          'service_key', v_service.service_key,
          'title', v_service.title,
          'description', v_service.description,
          'charge_mode', v_service.charge_mode,
          'unit_price_rub', v_service.price_rub,
          'availability_rules', v_service.availability_rules
        )
      ) RETURNING id INTO v_group_service_id;

      INSERT INTO public.booking_services(
        service_group_id, booking_id, slot_ordinal, allocated_amount_rub
      )
      SELECT
        v_group_service_id,
        ordered.id,
        ordered.slot_ordinal,
        CASE WHEN v_service.charge_mode = 'per_slot'
          THEN v_service.price_rub
          ELSE (v_service.price_rub / v_booking_count)
            + CASE WHEN ordered.slot_ordinal <= mod(v_service.price_rub, v_booking_count)
                   THEN 1 ELSE 0 END
        END
      FROM (
        SELECT b.id,
               row_number() OVER (ORDER BY b.start_at, b.id)::integer AS slot_ordinal
        FROM public.bookings b WHERE b.payment_group_id = v_group_id
      ) ordered;

      v_service_total := v_service_total +
        CASE WHEN v_service.charge_mode = 'per_slot'
             THEN v_service.price_rub * v_booking_count
             ELSE v_service.price_rub END;
    END LOOP;
  ELSE
    v_service_total := 0;
  END IF;

  IF p_funding_method = 'pass' THEN
    INSERT INTO public.booking_pass_allocations(
      booking_id, user_pass_id, slot_price_snapshot_rub
    )
    SELECT b.id, v_pass.id, b.price_rub
    FROM public.bookings b
    WHERE b.payment_group_id = v_group_id
    ORDER BY b.start_at, b.id;
  END IF;

  IF v_id_count > 0 THEN
    v_due_total := v_cash_total + v_service_total;
    IF v_due_total <= 0 THEN RAISE EXCEPTION 'Service order amount must be positive'; END IF;

    UPDATE public.payment_groups
    SET order_type = 'booking_services', amount_rub = v_due_total,
        hold_expires_at = p_hold_expires_at, updated_at = v_now
    WHERE id = v_group_id;

    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', b.id, 'start_at', b.start_at, 'end_at', b.end_at,
        'price_rub', b.price_rub, 'status', b.status,
        'hold_expires_at', b.hold_expires_at
      ) ORDER BY b.start_at
    ) INTO v_bookings
    FROM public.bookings b WHERE b.payment_group_id = v_group_id;

    RETURN pg_catalog.jsonb_build_object(
      'state', 'payment', 'next_step', 'payment',
      'payment_group_id', v_group_id,
      'bookings', COALESCE(v_bookings, '[]'::jsonb),
      'total_price_rub', v_due_total,
      'hold_expires_at', p_hold_expires_at,
      'funding_method', p_funding_method,
      'pass_hours_reserved', CASE WHEN p_funding_method = 'pass' THEN v_booking_count ELSE 0 END
    );
  END IF;

  IF p_funding_method <> 'pass' THEN
    RAISE EXCEPTION 'This RPC is only for pass bookings or orders with services';
  END IF;

  -- Pass-only booking: the temporary legacy payment group is removed inside
  -- this transaction; the pass ledger reserves and immediately consumes hours.
  UPDATE public.bookings
  SET payment_group_id = NULL,
      hold_expires_at = NULL,
      status = 'confirmed',
      payment_status = 'succeeded',
      updated_at = v_now
  WHERE payment_group_id = v_group_id;

  DELETE FROM public.payment_groups WHERE id = v_group_id;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', b.id, 'start_at', b.start_at, 'end_at', b.end_at,
      'price_rub', b.price_rub, 'status', b.status,
      'hold_expires_at', NULL
    ) ORDER BY b.start_at
  ) INTO v_bookings
  FROM public.bookings b
  WHERE b.user_id = p_user_id AND b.booking_request_key = p_request_key;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'confirmed', 'next_step', 'confirmed',
    'payment_group_id', NULL,
    'bookings', COALESCE(v_bookings, '[]'::jsonb),
    'total_price_rub', 0,
    'hold_expires_at', NULL,
    'funding_method', 'pass',
    'pass_hours_consumed', v_booking_count
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Pass transfer reuses the established cash transfer's schedule, availability,
-- table assignment and one-transfer checks. The booking temporarily points to
-- the pass purchase group so the legacy function reads the correct paid_at;
-- the original service payment group (if any) is restored before commit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_customer_booking_transfer_pass(
  p_booking_id uuid,
  p_user_id uuid,
  p_target_studio_id uuid,
  p_target_start_at timestamptz,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_allocation public.booking_pass_allocations%ROWTYPE;
  v_pass public.user_passes%ROWTYPE;
  v_target record;
  v_local_start timestamp without time zone;
  v_local_end timestamp without time zone;
  v_target_price integer;
  v_transfer_deadline timestamptz;
  v_rule_count integer;
  v_original_price integer;
  v_original_group_id uuid;
  v_result jsonb;
  v_operation_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_booking.funding_method <> 'pass' THEN
    RAISE EXCEPTION 'Pass-funded booking not found';
  END IF;

  -- An idempotent retry must return the already completed transfer unchanged.
  IF EXISTS (
    SELECT 1 FROM public.booking_operations bo
    WHERE bo.idempotency_key = p_idempotency_key
      AND bo.operation_type = 'transfer'
      AND bo.booking_id = p_booking_id
      AND bo.user_id = p_user_id
  ) THEN
    RETURN public.prepare_customer_booking_transfer_auto(
      p_booking_id, p_user_id, p_target_studio_id, p_target_start_at, p_idempotency_key
    );
  END IF;

  SELECT * INTO v_allocation
  FROM public.booking_pass_allocations
  WHERE booking_id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND OR v_allocation.status <> 'consumed' THEN
    RAISE EXCEPTION 'Pass hour is not consumed for this booking';
  END IF;

  SELECT * INTO v_pass
  FROM public.user_passes
  WHERE id = v_allocation.user_pass_id
  FOR UPDATE;
  IF NOT FOUND OR v_pass.status NOT IN ('active', 'exhausted')
     OR v_pass.purchased_at IS NULL OR v_pass.expires_at IS NULL
     OR v_pass.expires_at <= v_now THEN
    RAISE EXCEPTION 'Pass is not valid for transfer';
  END IF;

  SELECT s.id AS studio_id, s.city_id, s.timezone, s.is_active AS studio_is_active
  INTO v_target
  FROM public.studios s
  JOIN public.cities c ON c.id = s.city_id AND c.is_active
  WHERE s.id = p_target_studio_id AND s.is_active;

  IF NOT FOUND OR v_target.city_id IS DISTINCT FROM v_pass.city_id THEN
    RAISE EXCEPTION 'Pass transfer is allowed only to an active club in the same city';
  END IF;

  IF p_target_start_at >= v_pass.expires_at THEN
    RAISE EXCEPTION 'Target slot must start before the pass expires';
  END IF;
  IF v_pass.purchase_local_date IS NULL OR v_pass.timezone_snapshot IS NULL THEN
    RAISE EXCEPTION 'Pass purchase date or timezone snapshot is missing';
  END IF;
  v_transfer_deadline := (v_pass.purchase_local_date + 30)::timestamp without time zone
    AT TIME ZONE v_pass.timezone_snapshot;
  IF p_target_start_at >= v_transfer_deadline THEN
    RAISE EXCEPTION 'Pass transfer deadline has passed';
  END IF;

  v_local_start := p_target_start_at AT TIME ZONE v_target.timezone;
  v_local_end := (p_target_start_at + interval '60 minutes') AT TIME ZONE v_target.timezone;
  IF v_local_start::date <> v_local_end::date THEN
    RAISE EXCEPTION 'Target slot crosses the local date boundary';
  END IF;

  SELECT count(*)::integer, min(r.price_rub)::integer
  INTO v_rule_count, v_target_price
  FROM public.studio_slot_price_rules r
  WHERE r.studio_id = p_target_studio_id
    AND r.weekday = extract(isodow FROM v_local_start)::integer
    AND r.duration_minutes = 60
    AND r.is_active
    AND (r.effective_from IS NULL OR r.effective_from <= v_local_start::date)
    AND (r.effective_to IS NULL OR r.effective_to >= v_local_start::date)
    AND r.starts_at <= v_local_start::time
    AND r.ends_at >= v_local_end::time;

  IF v_rule_count <> 1 OR v_target_price IS NULL OR v_target_price <= 0 THEN
    RAISE EXCEPTION 'Target slot has no unique active hourly tariff';
  END IF;

  v_original_price := v_booking.price_rub;
  v_original_group_id := v_booking.payment_group_id;

  UPDATE public.bookings
  SET payment_group_id = v_pass.purchase_payment_group_id,
      price_rub = v_target_price,
      updated_at = v_now
  WHERE id = p_booking_id;

  v_result := public.prepare_customer_booking_transfer_auto(
    p_booking_id, p_user_id, p_target_studio_id, p_target_start_at, p_idempotency_key
  );

  IF v_result->>'state' <> 'completed' THEN
    RAISE EXCEPTION 'Pass transfer did not complete without payment';
  END IF;

  v_operation_id := NULLIF(v_result->>'operation_id', '')::uuid;

  UPDATE public.bookings
  SET payment_group_id = v_original_group_id,
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = p_booking_id;

  UPDATE public.booking_pass_allocations
  SET slot_price_snapshot_rub = v_target_price,
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = v_allocation.id;

  UPDATE public.booking_operations
  SET source_price_rub = v_original_price,
      target_price_rub = v_target_price,
      price_difference_rub = 0,
      metadata = metadata || pg_catalog.jsonb_build_object(
        'funding_method', 'pass', 'pass_id', v_pass.id
      ),
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = v_operation_id;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'completed', 'operation_id', v_operation_id,
    'price_difference_rub', 0, 'target_price_rub', v_target_price
  );
END;
$function$;

-- Validate destination service availability for both cash and pass transfers.
CREATE OR REPLACE FUNCTION public.prepare_customer_booking_transfer_dispatch(
  p_booking_id uuid,
  p_user_id uuid,
  p_target_studio_id uuid,
  p_target_start_at timestamptz,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_target record;
  v_service_key text;
  v_target_service public.studio_services%ROWTYPE;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  SELECT s.id, s.timezone, s.city_id, s.is_active
  INTO v_target
  FROM public.studios s
  WHERE s.id = p_target_studio_id AND s.is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target club is not active'; END IF;

  FOR v_service_key IN
    SELECT DISTINCT g.service_key
    FROM public.booking_services bs
    JOIN public.booking_service_groups g ON g.id = bs.service_group_id
    WHERE bs.booking_id = p_booking_id
      AND bs.status <> 'cancelled'
  LOOP
    SELECT * INTO v_target_service
    FROM public.studio_services ss
    WHERE ss.studio_id = p_target_studio_id
      AND ss.service_key = v_service_key
    FOR SHARE;

    IF NOT FOUND OR NOT v_target_service.is_enabled
       OR NOT public.is_service_available_for_slot(
         v_target_service.availability_rules, v_target.timezone, p_target_start_at
       ) THEN
      RAISE EXCEPTION 'Selected service % is unavailable in the target club or time; transfer is not allowed', v_service_key;
    END IF;
  END LOOP;

  IF v_booking.funding_method = 'pass' THEN
    RETURN public.prepare_customer_booking_transfer_pass(
      p_booking_id, p_user_id, p_target_studio_id, p_target_start_at, p_idempotency_key
    );
  END IF;

  RETURN public.prepare_customer_booking_transfer_auto(
    p_booking_id, p_user_id, p_target_studio_id, p_target_start_at, p_idempotency_key
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Pass cancellation is immediate and restores the consumed hour through the
-- existing ledger trigger. Cash cancellation continues through the established
-- refund operation, whose exact 24-hour boundary is corrected below.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prepare_customer_booking_cancellation_v2(
  p_booking_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_allocation public.booking_pass_allocations%ROWTYPE;
  v_pass public.user_passes%ROWTYPE;
  v_operation public.booking_operations%ROWTYPE;
  v_operation_found boolean := false;
  v_now timestamptz := pg_catalog.transaction_timestamp();
  v_result jsonb;
BEGIN
  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  IF v_booking.funding_method <> 'pass' THEN
    v_result := public.prepare_customer_booking_cancellation(p_booking_id, p_user_id);
    RETURN v_result || pg_catalog.jsonb_build_object('funding_method', 'cash');
  END IF;

  SELECT * INTO v_operation
  FROM public.booking_operations
  WHERE idempotency_key = 'customer-cancellation:' || p_booking_id::text
  FOR UPDATE;
  v_operation_found := FOUND;

  IF v_operation_found AND v_operation.status = 'completed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'completed', 'operation_id', v_operation.id,
      'operation_status', v_operation.status, 'refund_ids', '[]'::jsonb,
      'funding_method', 'pass'
    );
  END IF;

  IF v_booking.status <> 'confirmed' OR v_booking.payment_status <> 'succeeded' THEN
    RAISE EXCEPTION 'Booking is not confirmed';
  END IF;
  IF v_booking.start_at < v_now + interval '24 hours' THEN
    RAISE EXCEPTION 'Cancellation deadline has passed';
  END IF;

  SELECT * INTO v_allocation
  FROM public.booking_pass_allocations
  WHERE booking_id = p_booking_id
  FOR UPDATE;
  IF NOT FOUND OR v_allocation.status <> 'consumed' THEN
    RAISE EXCEPTION 'Consumed pass allocation was not found';
  END IF;

  SELECT * INTO v_pass
  FROM public.user_passes
  WHERE id = v_allocation.user_pass_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Pass was not found'; END IF;

  IF NOT v_operation_found THEN
    INSERT INTO public.booking_operations(
      idempotency_key, booking_id, user_id, operation_type, status,
      actor_type, actor_user_id, source_payment_group_id,
      source_start_at, source_end_at, source_price_rub,
      metadata, completed_at
    ) VALUES (
      'customer-cancellation:' || p_booking_id::text,
      p_booking_id, p_user_id, 'cancellation', 'completed',
      'customer', p_user_id, v_pass.purchase_payment_group_id,
      v_booking.start_at, v_booking.end_at, v_booking.price_rub,
      pg_catalog.jsonb_build_object('funding_method', 'pass', 'pass_id', v_pass.id),
      v_now
    ) RETURNING * INTO v_operation;
  ELSE
    UPDATE public.booking_operations
    SET status = 'completed', completed_at = v_now,
        metadata = metadata || pg_catalog.jsonb_build_object('funding_method', 'pass', 'pass_id', v_pass.id),
        updated_at = v_now
    WHERE id = v_operation.id
    RETURNING * INTO v_operation;
  END IF;

  UPDATE public.bookings
  SET status = 'cancelled', updated_at = v_now
  WHERE id = p_booking_id;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'completed', 'operation_id', v_operation.id,
    'operation_status', 'completed', 'refund_ids', '[]'::jsonb,
    'funding_method', 'pass', 'pass_hour_restored', true
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Service cancellation and refunds. A service refund is created only after
-- the booking itself is cancelled, preventing a refunded service on an active
-- booking. Service refunds are independent from the booking's cash refund rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_booking_services_after_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.status IN ('cancelled', 'expired') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.booking_services bs
    SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
    WHERE bs.booking_id = NEW.id
      AND bs.status IN ('pending_payment', 'active', 'partially_refunded');

    UPDATE public.booking_service_groups g
    SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
    WHERE g.id IN (
      SELECT DISTINCT bs.service_group_id
      FROM public.booking_services bs
      WHERE bs.booking_id = NEW.id
    )
      AND g.status IN ('pending_payment', 'active', 'partially_refunded')
      AND NOT EXISTS (
        SELECT 1
        FROM public.booking_services other_bs
        JOIN public.bookings other_b ON other_b.id = other_bs.booking_id
        WHERE other_bs.service_group_id = g.id
          AND other_b.status <> 'cancelled'
      );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bookings_sync_services_after_cancellation ON public.bookings;
CREATE TRIGGER bookings_sync_services_after_cancellation
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_booking_services_after_cancellation();

CREATE OR REPLACE FUNCTION public.prepare_customer_booking_service_refund(
  p_booking_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_operation public.booking_operations%ROWTYPE;
  v_group public.payment_groups%ROWTYPE;
  v_group_id uuid;
  v_refund_id uuid;
  v_amount integer;
  v_available integer;
  v_reserved integer;
  v_outstanding integer;
  v_ids jsonb := '[]'::jsonb;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_booking FROM public.bookings
  WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.booking_services bs
    JOIN public.booking_service_payment_allocations spa ON spa.booking_service_id = bs.id
    WHERE bs.booking_id = p_booking_id AND spa.amount_rub > 0
  ) THEN
    RETURN pg_catalog.jsonb_build_object('state', 'no_services', 'refund_ids', '[]'::jsonb);
  END IF;

  IF v_booking.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Booking must be cancelled before service refund';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.booking_operations bo
    WHERE bo.booking_id = p_booking_id
      AND bo.operation_type = 'cancellation'
      AND bo.status = 'completed'
  ) THEN
    RAISE EXCEPTION 'Booking cancellation is not complete';
  END IF;

  SELECT * INTO v_operation
  FROM public.booking_operations
  WHERE booking_id = p_booking_id AND operation_type = 'service_refund'
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF FOUND AND v_operation.status = 'completed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'completed', 'operation_id', v_operation.id, 'refund_ids', '[]'::jsonb
    );
  END IF;

  IF NOT FOUND THEN
    INSERT INTO public.booking_operations(
      idempotency_key, booking_id, user_id, operation_type, status,
      actor_type, actor_user_id, source_start_at, source_end_at,
      source_price_rub, metadata
    )
    SELECT
      'customer-service-refund:' || p_booking_id::text,
      p_booking_id, v_booking.user_id, 'service_refund', 'processing',
      'customer', v_booking.user_id, v_booking.start_at, v_booking.end_at,
      COALESCE(sum(spa.amount_rub), 0)::integer,
      pg_catalog.jsonb_build_object('refund_scope', 'services')
    FROM public.booking_services bs
    JOIN public.booking_service_payment_allocations spa ON spa.booking_service_id = bs.id
    WHERE bs.booking_id = p_booking_id
    RETURNING * INTO v_operation;
  ELSE
    UPDATE public.booking_operations
    SET status = 'processing', updated_at = v_now
    WHERE id = v_operation.id
    RETURNING * INTO v_operation;
  END IF;

  FOR v_group_id IN
    SELECT DISTINCT spa.payment_group_id
    FROM public.booking_services bs
    JOIN public.booking_service_payment_allocations spa ON spa.booking_service_id = bs.id
    WHERE bs.booking_id = p_booking_id
    ORDER BY spa.payment_group_id
  LOOP
    SELECT * INTO v_group
    FROM public.payment_groups pg
    WHERE pg.id = v_group_id
    FOR UPDATE;
    IF NOT FOUND OR v_group.provider <> 'yookassa'
       OR v_group.provider_payment_id IS NULL
       OR v_group.status NOT IN ('succeeded', 'refunded') THEN
      RAISE EXCEPTION 'Service source payment is not eligible for refund';
    END IF;

    SELECT id INTO v_refund_id
    FROM public.payment_refunds
    WHERE booking_operation_id = v_operation.id
      AND payment_group_id = v_group_id
      AND status = 'pending'
    LIMIT 1;

    IF v_refund_id IS NOT NULL THEN
      v_ids := v_ids || pg_catalog.jsonb_build_array(v_refund_id);
      CONTINUE;
    END IF;

    SELECT COALESCE(sum(spa.amount_rub - COALESCE(refunded.amount_rub, 0)), 0)::integer
    INTO v_outstanding
    FROM public.booking_services bs
    JOIN public.booking_service_payment_allocations spa ON spa.booking_service_id = bs.id
    LEFT JOIN LATERAL (
      SELECT sum(pra.amount_rub)::integer AS amount_rub
      FROM public.payment_refund_allocations pra
      JOIN public.payment_refunds pr ON pr.id = pra.payment_refund_id
      WHERE pra.booking_service_payment_allocation_id = spa.id
        AND pr.status IN ('pending', 'succeeded')
    ) refunded ON true
    WHERE bs.booking_id = p_booking_id
      AND spa.payment_group_id = v_group_id;

    IF v_outstanding <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(sum(r.amount_rub), 0)::integer
    INTO v_reserved
    FROM public.payment_refunds r
    WHERE r.payment_group_id = v_group_id
      AND r.status IN ('pending', 'succeeded');

    v_available := v_group.amount_rub - v_reserved;
    IF v_available < v_outstanding THEN
      RAISE EXCEPTION 'Service refund exceeds remaining refundable payment group balance';
    END IF;

    INSERT INTO public.payment_refunds(
      booking_operation_id, payment_group_id, provider,
      provider_payment_id, amount_rub, idempotency_key,
      requested_by_user_id
    ) VALUES (
      v_operation.id, v_group_id, v_group.provider,
      v_group.provider_payment_id, v_outstanding,
      pg_catalog.gen_random_uuid()::text, v_booking.user_id
    ) RETURNING id INTO v_refund_id;

    INSERT INTO public.payment_refund_allocations(
      payment_refund_id, booking_service_payment_allocation_id,
      amount_rub, idempotency_key
    )
    SELECT
      v_refund_id,
      spa.id,
      spa.amount_rub - COALESCE(refunded.amount_rub, 0),
      v_refund_id::text || ':' || spa.id::text
    FROM public.booking_services bs
    JOIN public.booking_service_payment_allocations spa ON spa.booking_service_id = bs.id
    LEFT JOIN LATERAL (
      SELECT sum(pra.amount_rub)::integer AS amount_rub
      FROM public.payment_refund_allocations pra
      JOIN public.payment_refunds pr ON pr.id = pra.payment_refund_id
      WHERE pra.booking_service_payment_allocation_id = spa.id
        AND pr.status IN ('pending', 'succeeded')
    ) refunded ON true
    WHERE bs.booking_id = p_booking_id
      AND spa.payment_group_id = v_group_id
      AND spa.amount_rub > COALESCE(refunded.amount_rub, 0);

    v_ids := v_ids || pg_catalog.jsonb_build_array(v_refund_id);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM public.payment_refunds r
    WHERE r.booking_operation_id = v_operation.id AND r.status = 'pending'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.booking_services bs
    JOIN public.booking_service_payment_allocations spa ON spa.booking_service_id = bs.id
    WHERE bs.booking_id = p_booking_id
      AND spa.amount_rub > COALESCE((
        SELECT sum(pra.amount_rub)
        FROM public.payment_refund_allocations pra
        JOIN public.payment_refunds pr ON pr.id = pra.payment_refund_id
        WHERE pra.booking_service_payment_allocation_id = spa.id
          AND pr.status = 'succeeded'
      ), 0)
  ) THEN
    UPDATE public.booking_operations
    SET status = 'completed', completed_at = v_now, updated_at = v_now
    WHERE id = v_operation.id;
    RETURN pg_catalog.jsonb_build_object(
      'state', 'completed', 'operation_id', v_operation.id, 'refund_ids', '[]'::jsonb
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'processing', 'operation_id', v_operation.id, 'refund_ids', v_ids
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.finalize_customer_booking_service_refund(
  p_refund_id uuid,
  p_provider_refund_id text,
  p_provider_status text,
  p_provider_response jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_refund public.payment_refunds%ROWTYPE;
  v_operation public.booking_operations%ROWTYPE;
  v_group public.payment_groups%ROWTYPE;
  v_booking_id uuid;
  v_remaining integer;
  v_pending integer;
  v_total_group_refunded integer;
BEGIN
  IF p_refund_id IS NULL
     OR p_provider_status IS NULL
     OR p_provider_status NOT IN ('pending', 'succeeded', 'canceled')
     OR p_provider_response IS NULL
     OR jsonb_typeof(p_provider_response) <> 'object' THEN
    RAISE EXCEPTION 'Invalid service refund finalization parameters';
  END IF;

  SELECT * INTO v_refund FROM public.payment_refunds
  WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Service refund not found'; END IF;

  SELECT * INTO v_operation FROM public.booking_operations
  WHERE id = v_refund.booking_operation_id FOR UPDATE;
  IF NOT FOUND OR v_operation.operation_type <> 'service_refund' THEN
    RAISE EXCEPTION 'Refund is not a service refund operation';
  END IF;

  SELECT * INTO v_group FROM public.payment_groups
  WHERE id = v_refund.payment_group_id FOR UPDATE;

  IF v_refund.status = 'succeeded' THEN RETURN 'already_completed'; END IF;
  IF v_refund.status = 'failed' THEN RETURN 'terminal_refund_state'; END IF;

  IF p_provider_refund_id IS NOT NULL AND length(p_provider_refund_id) > 200 THEN
    RAISE EXCEPTION 'Invalid provider refund ID';
  END IF;

  IF p_provider_status = 'pending' THEN
    UPDATE public.payment_refunds
    SET provider_refund_id = COALESCE(provider_refund_id, p_provider_refund_id),
        provider_response = p_provider_response, updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_refund_id;
    RETURN 'pending';
  END IF;

  IF p_provider_status = 'canceled' THEN
    UPDATE public.payment_refunds
    SET status = 'cancelled',
        provider_refund_id = COALESCE(provider_refund_id, p_provider_refund_id),
        provider_response = p_provider_response,
        failure_reason = 'Provider canceled service refund',
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_refund_id;
    RETURN 'retry_required';
  END IF;

  UPDATE public.payment_refunds
  SET status = 'succeeded',
      provider_refund_id = COALESCE(provider_refund_id, p_provider_refund_id),
      provider_response = p_provider_response,
      succeeded_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = p_refund_id;

  SELECT COALESCE(sum(r.amount_rub), 0)::integer
  INTO v_total_group_refunded
  FROM public.payment_refunds r
  WHERE r.payment_group_id = v_group.id AND r.status = 'succeeded';

  IF v_total_group_refunded >= v_group.amount_rub THEN
    UPDATE public.payment_groups
    SET status = 'refunded', updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_group.id AND status = 'succeeded';
  END IF;

  v_booking_id := v_operation.booking_id;

  SELECT COALESCE(sum(spa.amount_rub - COALESCE(refunded.amount_rub, 0)), 0)::integer,
         count(*) FILTER (WHERE pr.status = 'pending')::integer
  INTO v_remaining, v_pending
  FROM public.booking_services bs
  JOIN public.booking_service_payment_allocations spa ON spa.booking_service_id = bs.id
  LEFT JOIN LATERAL (
    SELECT sum(pra.amount_rub)::integer AS amount_rub
    FROM public.payment_refund_allocations pra
    JOIN public.payment_refunds pr2 ON pr2.id = pra.payment_refund_id
    WHERE pra.booking_service_payment_allocation_id = spa.id
      AND pr2.status = 'succeeded'
  ) refunded ON true
  LEFT JOIN public.payment_refunds pr
    ON pr.booking_operation_id = v_operation.id
   AND pr.payment_group_id = spa.payment_group_id
   AND pr.status = 'pending'
  WHERE bs.booking_id = v_booking_id;

  IF v_remaining = 0 AND v_pending = 0 THEN
    UPDATE public.booking_operations
    SET status = 'completed', completed_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_operation.id;
    RETURN 'completed';
  END IF;

  RETURN 'refund_recorded';
END;
$function$;

-- ---------------------------------------------------------------------------
-- Correct the 24-hour boundary consistently: exactly 24 hours is eligible.
-- Make late-success webhook handling idempotent after the first review/refund
-- marker has been written to payment_groups.failure_reason.
DO $function$
DECLARE
  v_definition text;
  v_updated text;
  v_marker text := 'IF v_group.status = ''cancelled'' AND v_group.failure_reason = ''payment_timeout_10m''';
  v_replacement text :=
    'IF v_group.status = ''cancelled'' AND v_group.failure_reason = ''payment_timeout_10m|late_pass_purchase_review_required'' THEN RETURN ''late_pass_purchase_review_required''; END IF;' || E'\n' ||
    'IF v_group.status = ''cancelled'' AND v_group.failure_reason = ''payment_timeout_10m|late_success_refund_required'' THEN RETURN ''late_success_refund_required''; END IF;' || E'\n' ||
    'IF v_group.status = ''cancelled'' AND v_group.failure_reason = ''payment_timeout_10m''';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.apply_payment_group_success(uuid,text,integer)'::regprocedure
  ) INTO v_definition;
  v_updated := pg_catalog.replace(v_definition, v_marker, v_replacement);
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Late payment success idempotency source was not found';
  END IF;
  EXECUTE v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_stale_pass_purchase_groups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_group_id uuid;
  v_count integer := 0;
BEGIN
  FOR v_group_id IN
    SELECT pg.id
    FROM public.payment_groups pg
    WHERE pg.provider = 'yookassa'
      AND pg.order_type = 'pass_purchase'
      AND pg.status = 'pending'
      AND pg.payment_init_started_at IS NULL
      AND pg.hold_expires_at <= v_now
    ORDER BY COALESCE(pg.payment_init_started_at, pg.hold_expires_at), pg.id
    LIMIT 200
    FOR UPDATE OF pg SKIP LOCKED
  LOOP
    PERFORM public.apply_payment_group_failure(
      p_payment_group_id := v_group_id,
      p_final_status := 'cancelled',
      p_provider_payment_id := NULL,
      p_failure_reason := 'payment_timeout_10m'
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- Fail the migration if the expected source fragments have drifted.
-- ---------------------------------------------------------------------------
DO $function$
DECLARE
  v_definition text;
  v_updated text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.apply_booking_pass_allocation_ledger()'::regprocedure
  ) INTO v_definition;
  v_updated := replace(
    v_definition,
    'v_booking.start_at <= v_now + interval ''24 hours''',
    'v_booking.start_at < v_now + interval ''24 hours'''
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Pass ledger 24-hour condition was not found';
  END IF;
  v_updated := replace(
    v_updated,
    'v_now timestamptz := pg_catalog.clock_timestamp();',
    'v_now timestamptz := pg_catalog.transaction_timestamp();'
  );
  v_updated := replace(v_updated, 'more than 24 hours', 'at least 24 hours');
  EXECUTE v_updated;

  SELECT pg_catalog.pg_get_functiondef(
    'public.sync_booking_pass_allocation_from_booking()'::regprocedure
  ) INTO v_definition;
  v_updated := replace(
    v_definition,
    'NEW.start_at > pg_catalog.clock_timestamp() + interval ''24 hours''',
    'NEW.start_at >= pg_catalog.transaction_timestamp() + interval ''24 hours'''
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Pass booking sync 24-hour condition was not found';
  END IF;
  EXECUTE v_updated;

  SELECT pg_catalog.pg_get_functiondef(
    'public.prepare_customer_booking_cancellation(uuid,uuid)'::regprocedure
  ) INTO v_definition;
  v_updated := replace(
    v_definition,
    'v_booking.start_at <= v_now + interval ''24 hours''',
    'v_booking.start_at < v_now + interval ''24 hours'''
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Cash cancellation 24-hour condition was not found';
  END IF;
  v_updated := replace(
    v_updated,
    'v_now timestamptz := pg_catalog.clock_timestamp();',
    'v_now timestamptz := pg_catalog.transaction_timestamp();'
  );
  v_updated := replace(v_updated, 'more than 24 hours', 'at least 24 hours');
  EXECUTE v_updated;

  -- Keep the existing 10-second payment expiry cron as the only frequent job.
  -- It also runs pass expiry after the cash/payment cleanup and pass purchase loop.
  SELECT pg_catalog.pg_get_functiondef(
    'public.expire_stale_yookassa_payment_groups()'::regprocedure
  ) INTO v_definition;
  v_updated := replace(
    v_definition,
    '  RETURN v_count;',
    '  PERFORM public.expire_unpaid_payment_holds();' || E'\n' ||
    '  PERFORM public.expire_stale_pass_purchase_groups();' || E'\n' ||
    '  PERFORM public.expire_due_user_passes();' || E'\n' ||
    '  RETURN v_count;'
  );
  IF v_updated = v_definition THEN
    RAISE EXCEPTION 'Payment expiry wrapper return point was not found';
  END IF;
  -- Keep the legacy timeout marker because the payment-success wrapper uses it
  -- to route late successful payments into the established refund/review flow.
  EXECUTE v_updated;
END;
$function$;

DO $function$
DECLARE v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'ponglab-expire-user-passes'
  LIMIT 1;
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END;
$function$;

-- Internal RPCs are callable only by the trusted server role.
REVOKE ALL ON FUNCTION public.is_service_available_for_slot(jsonb, text, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_stale_pass_purchase_groups()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.seed_default_studio_services()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_customer_pass_purchase_order(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_customer_booking_order_by_request_key(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_customer_booking_order(uuid, text, timestamptz, jsonb, text, text, uuid, uuid[], text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_customer_booking_transfer_pass(uuid, uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_customer_booking_transfer_dispatch(uuid, uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_customer_booking_cancellation_v2(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_booking_services_after_cancellation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.prepare_customer_booking_service_refund(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_customer_booking_service_refund(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_customer_pass_purchase_order(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_customer_booking_order_by_request_key(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_customer_booking_order(uuid, text, timestamptz, jsonb, text, text, uuid, uuid[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_customer_booking_transfer_pass(uuid, uuid, uuid, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_customer_booking_transfer_dispatch(uuid, uuid, uuid, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_customer_booking_cancellation_v2(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.prepare_customer_booking_service_refund(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_customer_booking_service_refund(uuid, text, text, jsonb) TO service_role;

COMMIT;
