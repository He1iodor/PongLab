-- PongLab: payment core support for pass purchases and service-backed bookings
-- Requires 20261126103000_passes_and_services_foundation.sql and
-- 20261126120000_passes_services_integration.sql.
-- Existing cash booking, transfer and extension logic is retained as legacy
-- functions and called unchanged for their existing order types.

BEGIN;

-- Preserve the proven implementations. The wrappers below add only the new
-- order types and delegate ordinary cash/transfer/extension orders unchanged.
ALTER FUNCTION public.begin_payment_initialization(uuid, uuid)
  RENAME TO begin_payment_initialization_cash_legacy;
ALTER FUNCTION public.apply_payment_group_success(uuid, text, integer)
  RENAME TO apply_payment_group_success_cash_legacy;
ALTER FUNCTION public.apply_payment_group_failure(uuid, text, text, text)
  RENAME TO apply_payment_group_failure_cash_legacy;
ALTER FUNCTION public.expire_stale_yookassa_payment_groups()
  RENAME TO expire_stale_yookassa_payment_groups_cash_legacy;
ALTER FUNCTION public.expire_unpaid_payment_holds()
  RENAME TO expire_unpaid_payment_holds_cash_legacy;

CREATE FUNCTION public.begin_payment_initialization(
  p_payment_group_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_group public.payment_groups%ROWTYPE;
  v_pass public.user_passes%ROWTYPE;
  v_booking_count integer;
  v_cash_total integer;
  v_service_total integer;
  v_service_count integer;
  v_already_started boolean;
  v_started_at timestamptz;
BEGIN
  IF p_payment_group_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Payment group and user are required';
  END IF;

  SELECT * INTO v_group
  FROM public.payment_groups
  WHERE id = p_payment_group_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Payment group not found'; END IF;

  IF v_group.order_type NOT IN ('pass_purchase', 'booking_services') THEN
    RETURN public.begin_payment_initialization_cash_legacy(p_payment_group_id, p_user_id);
  END IF;

  IF v_group.provider <> 'yookassa' THEN
    RAISE EXCEPTION 'Unsupported payment provider';
  END IF;

  IF v_group.status = 'succeeded' THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'succeeded', 'payment_group_id', v_group.id,
      'provider_payment_id', v_group.provider_payment_id
    );
  END IF;
  IF v_group.status <> 'pending' THEN RAISE EXCEPTION 'Payment group is not pending'; END IF;

  v_already_started := v_group.payment_init_started_at IS NOT NULL;

  IF v_group.provider_payment_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'payment_created', 'payment_group_id', v_group.id,
      'provider_payment_id', v_group.provider_payment_id,
      'payment_url', v_group.payment_url,
      'amount_rub', v_group.amount_rub, 'currency', v_group.currency
    );
  END IF;

  IF v_group.order_type = 'pass_purchase' THEN
    SELECT * INTO v_pass
    FROM public.user_passes
    WHERE purchase_payment_group_id = p_payment_group_id
      AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_pass.status <> 'pending_payment'
       OR v_pass.plan_price_rub_snapshot <> v_group.amount_rub
       OR v_pass.total_hours < 1
       OR v_pass.timezone_snapshot IS NULL
       OR EXISTS (SELECT 1 FROM public.bookings WHERE payment_group_id = p_payment_group_id)
    THEN
      RAISE EXCEPTION 'Pass purchase order is inconsistent';
    END IF;
  ELSE
    PERFORM b.id
    FROM public.bookings b
    WHERE b.payment_group_id = p_payment_group_id
    ORDER BY b.id
    FOR UPDATE;

    SELECT count(*)::integer,
           coalesce(sum(b.price_rub) FILTER (WHERE b.funding_method = 'cash'), 0)::integer
    INTO v_booking_count, v_cash_total
    FROM public.bookings b
    WHERE b.payment_group_id = p_payment_group_id;

    IF v_booking_count < 1 THEN RAISE EXCEPTION 'Service order has no bookings'; END IF;

    IF EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.payment_group_id = p_payment_group_id
        AND (b.user_id <> p_user_id OR b.status <> 'pending_payment'
          OR b.payment_status <> 'pending'
          OR (v_already_started AND b.payment_init_started_at IS NULL)
          OR (NOT v_already_started AND b.payment_init_started_at IS NOT NULL))
    ) THEN
      RAISE EXCEPTION 'Service order contains invalid bookings';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.bookings b
      LEFT JOIN public.booking_pass_allocations a ON a.booking_id = b.id
      WHERE b.payment_group_id = p_payment_group_id
        AND b.funding_method = 'pass'
        AND (a.id IS NULL OR a.status <> 'reserved')
    ) THEN
      RAISE EXCEPTION 'Pass-funded booking has no reserved pass hour';
    END IF;

    PERFORM g.id
    FROM public.booking_service_groups g
    WHERE g.id IN (
      SELECT DISTINCT bs.service_group_id
      FROM public.booking_services bs
      JOIN public.bookings b ON b.id = bs.booking_id
      WHERE b.payment_group_id = p_payment_group_id
    )
    ORDER BY g.id
    FOR UPDATE;

    SELECT coalesce(sum(g.total_price_rub), 0)::integer,
           count(DISTINCT g.id)::integer
    INTO v_service_total, v_service_count
    FROM public.booking_service_groups g
    WHERE g.id IN (
      SELECT DISTINCT bs.service_group_id
      FROM public.booking_services bs
      JOIN public.bookings b ON b.id = bs.booking_id
      WHERE b.payment_group_id = p_payment_group_id
    )
      AND g.status = 'pending_payment';

    IF v_service_count < 1 OR v_service_total < 1 THEN
      RAISE EXCEPTION 'Service payment group has no pending services';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.booking_service_groups g
      WHERE g.id IN (
        SELECT DISTINCT bs.service_group_id
        FROM public.booking_services bs
        JOIN public.bookings b ON b.id = bs.booking_id
        WHERE b.payment_group_id = p_payment_group_id
      )
      AND (
        g.status <> 'pending_payment'
        OR g.slot_count <> (
          SELECT count(*) FROM public.booking_services bs WHERE bs.service_group_id = g.id
        )
        OR EXISTS (
          SELECT 1 FROM public.booking_services bs
          WHERE bs.service_group_id = g.id AND bs.status <> 'pending_payment'
        )
      )
    ) THEN
      RAISE EXCEPTION 'Service snapshots are incomplete or not pending';
    END IF;

    IF v_cash_total + v_service_total <> v_group.amount_rub THEN
      RAISE EXCEPTION 'Service payment amount mismatch';
    END IF;
  END IF;

  IF v_already_started THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'retry_same_request', 'payment_group_id', v_group.id,
      'amount_rub', v_group.amount_rub, 'currency', v_group.currency,
      'provider', v_group.provider, 'idempotency_key', v_group.id::text,
      'payment_init_started_at', v_group.payment_init_started_at
    );
  END IF;

  IF v_group.hold_expires_at IS NULL OR v_group.hold_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'Payment hold has expired';
  END IF;

  IF v_group.order_type = 'booking_services' AND EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.payment_group_id = p_payment_group_id
      AND (b.hold_expires_at IS NULL OR b.hold_expires_at <= pg_catalog.clock_timestamp())
  ) THEN
    RAISE EXCEPTION 'Booking hold has expired';
  END IF;

  v_started_at := pg_catalog.clock_timestamp();
  UPDATE public.payment_groups SET payment_init_started_at = v_started_at, updated_at = v_started_at
  WHERE id = p_payment_group_id;

  IF v_group.order_type = 'booking_services' THEN
    UPDATE public.bookings SET payment_init_started_at = v_started_at
    WHERE payment_group_id = p_payment_group_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'state', 'started', 'payment_group_id', v_group.id,
    'amount_rub', v_group.amount_rub, 'currency', v_group.currency,
    'provider', v_group.provider, 'idempotency_key', v_group.id::text,
    'hold_expires_at', v_group.hold_expires_at
  );
END;
$function$;

CREATE FUNCTION public.apply_payment_group_success(
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
  v_pass public.user_passes%ROWTYPE;
  v_booking_count integer;
  v_invalid_count integer;
  v_cash_total integer;
  v_service_total integer;
  v_timeout_minutes integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_local_date date;
  v_expires_at timestamptz;
BEGIN
  IF p_payment_group_id IS NULL OR p_provider_payment_id IS NULL
     OR pg_catalog.length(pg_catalog.btrim(p_provider_payment_id)) < 1
     OR p_amount_rub IS NULL OR p_amount_rub <= 0 THEN
    RAISE EXCEPTION 'Invalid payment confirmation parameters';
  END IF;

  SELECT * INTO v_group FROM public.payment_groups
  WHERE id = p_payment_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment group not found'; END IF;

  IF v_group.order_type NOT IN ('pass_purchase', 'booking_services') THEN
    RETURN public.apply_payment_group_success_cash_legacy(
      p_payment_group_id, p_provider_payment_id, p_amount_rub
    );
  END IF;

  IF v_group.provider <> 'yookassa' THEN RAISE EXCEPTION 'Unsupported payment provider'; END IF;
  IF v_group.amount_rub <> p_amount_rub OR v_group.currency <> 'RUB' THEN
    RAISE EXCEPTION 'Payment amount or currency mismatch';
  END IF;
  IF v_group.provider_payment_id IS NOT NULL AND v_group.provider_payment_id <> p_provider_payment_id THEN
    RAISE EXCEPTION 'Provider payment ID mismatch';
  END IF;
  IF v_group.status = 'refunded' THEN RETURN 'already_refunded'; END IF;
  IF v_group.status = 'succeeded' THEN RETURN 'already_processed'; END IF;

  IF v_group.status = 'cancelled' AND v_group.failure_reason = 'payment_timeout_10m'
  THEN
    IF v_group.order_type = 'pass_purchase' THEN
      UPDATE public.payment_groups
      SET provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
          failure_reason = 'payment_timeout_10m|late_pass_purchase_review_required',
          paid_at = coalesce(paid_at, v_now), last_checked_at = v_now, updated_at = v_now
      WHERE id = p_payment_group_id;
      RETURN 'late_pass_purchase_review_required';
    ELSE
      UPDATE public.payment_groups
      SET provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
          failure_reason = 'payment_timeout_10m|late_success_refund_required',
          paid_at = coalesce(paid_at, v_now), last_checked_at = v_now, updated_at = v_now
      WHERE id = p_payment_group_id;
      RETURN 'late_success_refund_required';
    END IF;
  END IF;

  IF v_group.status <> 'pending' THEN RETURN 'terminal_state_conflict'; END IF;
  IF v_group.payment_init_started_at IS NULL THEN RETURN 'payment_not_initialized'; END IF;

  IF v_group.order_type = 'pass_purchase' THEN
    IF v_group.payment_init_started_at + interval '5 minutes' <= v_now THEN
      UPDATE public.payment_groups
      SET status = 'cancelled', provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
          failure_reason = 'payment_timeout_10m|late_pass_purchase_review_required',
          paid_at = coalesce(paid_at, v_now), last_checked_at = v_now, updated_at = v_now
      WHERE id = p_payment_group_id AND status = 'pending';
      UPDATE public.user_passes SET status = 'cancelled', updated_at = v_now
      WHERE purchase_payment_group_id = p_payment_group_id AND status = 'pending_payment';
      RETURN 'late_pass_purchase_review_required';
    END IF;

    SELECT * INTO v_pass FROM public.user_passes
    WHERE purchase_payment_group_id = p_payment_group_id AND user_id = v_group.user_id
    FOR UPDATE;
    IF NOT FOUND OR v_pass.status <> 'pending_payment'
       OR v_pass.plan_price_rub_snapshot <> v_group.amount_rub
       OR v_pass.total_hours < 1 OR v_pass.timezone_snapshot IS NULL
       OR EXISTS (SELECT 1 FROM public.bookings WHERE payment_group_id = p_payment_group_id) THEN
      RAISE EXCEPTION 'Pass purchase order is inconsistent';
    END IF;

    v_local_date := (v_now AT TIME ZONE v_pass.timezone_snapshot)::date;
    v_expires_at := ((v_local_date + interval '1 month')::date + 1)::timestamp
                    AT TIME ZONE v_pass.timezone_snapshot;

    UPDATE public.payment_groups
    SET status = 'succeeded', provider_payment_id = p_provider_payment_id,
        paid_at = v_now, last_checked_at = v_now, updated_at = v_now
    WHERE id = p_payment_group_id;

    UPDATE public.user_passes
    SET status = 'active', remaining_hours = total_hours, reserved_hours = 0,
        purchased_at = v_now, starts_at = v_now,
        purchase_local_date = v_local_date, expires_at = v_expires_at, updated_at = v_now
    WHERE id = v_pass.id AND status = 'pending_payment';
    IF NOT FOUND THEN RAISE EXCEPTION 'Pass could not be activated'; END IF;

    INSERT INTO public.pass_transactions(
      user_pass_id, transaction_type, remaining_delta, reserved_delta,
      idempotency_key, description
    ) VALUES (
      v_pass.id, 'purchase_credit', v_pass.total_hours, 0,
      'pass-purchase:' || v_pass.id::text || ':credit', 'Credit purchased pass hours'
    );
    RETURN 'pass_activated';
  END IF;

  -- Service-backed booking payment. The legacy cash path remains untouched.
  PERFORM b.id FROM public.bookings b
  WHERE b.payment_group_id = p_payment_group_id ORDER BY b.id FOR UPDATE;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE b.user_id <> v_group.user_id
           OR b.status <> 'pending_payment' OR b.payment_status <> 'pending'
           OR b.payment_init_started_at IS NULL)::integer,
         coalesce(sum(b.price_rub) FILTER (WHERE b.funding_method = 'cash'), 0)::integer
  INTO v_booking_count, v_invalid_count, v_cash_total
  FROM public.bookings b WHERE b.payment_group_id = p_payment_group_id;

  IF v_booking_count < 1 OR v_invalid_count > 0 THEN RETURN 'booking_state_conflict'; END IF;

  SELECT LEAST(60, GREATEST(1, coalesce(pg_catalog.max(sbs.hold_minutes)::integer, 5)))
  INTO v_timeout_minutes
  FROM public.bookings b
  JOIN public.studio_tables st ON st.id = b.table_id
  JOIN public.studio_booking_settings sbs ON sbs.studio_id = st.studio_id
  WHERE b.payment_group_id = p_payment_group_id;
  v_timeout_minutes := coalesce(v_timeout_minutes, 5);

  IF v_group.payment_init_started_at + pg_catalog.make_interval(mins => v_timeout_minutes) <= v_now THEN
    UPDATE public.payment_groups
    SET status = 'cancelled', provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
        failure_reason = 'payment_timeout_10m|late_success_refund_required',
        paid_at = coalesce(paid_at, v_now), last_checked_at = v_now, updated_at = v_now
    WHERE id = p_payment_group_id AND status = 'pending';
    UPDATE public.bookings SET status = 'expired', payment_status = 'cancelled', updated_at = v_now
    WHERE payment_group_id = p_payment_group_id AND status = 'pending_payment' AND payment_status = 'pending';
    UPDATE public.booking_services SET status = 'cancelled', updated_at = v_now
    WHERE booking_id IN (SELECT id FROM public.bookings WHERE payment_group_id = p_payment_group_id)
      AND status = 'pending_payment';
    UPDATE public.booking_service_groups SET status = 'cancelled', updated_at = v_now
    WHERE id IN (SELECT DISTINCT bs.service_group_id FROM public.booking_services bs
      JOIN public.bookings b ON b.id = bs.booking_id WHERE b.payment_group_id = p_payment_group_id)
      AND status = 'pending_payment';
    RETURN 'late_success_refund_required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b
    LEFT JOIN public.booking_pass_allocations a ON a.booking_id = b.id
    WHERE b.payment_group_id = p_payment_group_id AND b.funding_method = 'pass'
      AND (a.id IS NULL OR a.status <> 'reserved')
  ) THEN RAISE EXCEPTION 'Pass-funded booking has no reserved pass hour'; END IF;

  SELECT coalesce(sum(g.total_price_rub), 0)::integer INTO v_service_total
  FROM public.booking_service_groups g
  WHERE g.id IN (SELECT DISTINCT bs.service_group_id FROM public.booking_services bs
    JOIN public.bookings b ON b.id = bs.booking_id WHERE b.payment_group_id = p_payment_group_id)
    AND g.status = 'pending_payment';

  IF v_service_total < 1 OR v_cash_total + v_service_total <> v_group.amount_rub THEN
    RAISE EXCEPTION 'Service payment amount mismatch';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_services bs
    JOIN public.bookings b ON b.id = bs.booking_id
    JOIN public.booking_service_payment_allocations a ON a.booking_service_id = bs.id
    WHERE b.payment_group_id = p_payment_group_id
      AND (a.payment_group_id <> p_payment_group_id
        OR a.amount_rub <> bs.allocated_amount_rub)
  ) THEN
    RAISE EXCEPTION 'Service payment allocation already exists or has a mismatched amount';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.booking_service_groups g
    WHERE g.id IN (SELECT DISTINCT bs.service_group_id FROM public.booking_services bs
      JOIN public.bookings b ON b.id = bs.booking_id WHERE b.payment_group_id = p_payment_group_id)
      AND (g.status <> 'pending_payment' OR g.slot_count <> (
        SELECT count(*) FROM public.booking_services bs WHERE bs.service_group_id = g.id
      ) OR EXISTS (SELECT 1 FROM public.booking_services bs
        WHERE bs.service_group_id = g.id AND bs.status <> 'pending_payment'))
  ) THEN RAISE EXCEPTION 'Service snapshots are incomplete or not pending'; END IF;

  UPDATE public.payment_groups
  SET status = 'succeeded', provider_payment_id = p_provider_payment_id,
      paid_at = v_now, last_checked_at = v_now, updated_at = v_now
  WHERE id = p_payment_group_id;

  UPDATE public.bookings SET status = 'confirmed', payment_status = 'succeeded', updated_at = v_now
  WHERE payment_group_id = p_payment_group_id;

  INSERT INTO public.booking_payment_allocations(booking_id, payment_group_id, amount_rub, currency)
  SELECT b.id, p_payment_group_id, b.price_rub, v_group.currency
  FROM public.bookings b
  WHERE b.payment_group_id = p_payment_group_id AND b.funding_method = 'cash'
    AND b.status = 'confirmed' AND b.payment_status = 'succeeded'
  ON CONFLICT (payment_group_id, booking_id) DO NOTHING;

  INSERT INTO public.booking_service_payment_allocations(booking_service_id, payment_group_id, amount_rub)
  SELECT bs.id, p_payment_group_id, bs.allocated_amount_rub
  FROM public.booking_services bs
  JOIN public.bookings b ON b.id = bs.booking_id
  WHERE b.payment_group_id = p_payment_group_id AND bs.allocated_amount_rub > 0
  ON CONFLICT (booking_service_id, payment_group_id) DO NOTHING;

  UPDATE public.booking_services SET status = 'active', updated_at = v_now
  WHERE booking_id IN (SELECT id FROM public.bookings WHERE payment_group_id = p_payment_group_id)
    AND status = 'pending_payment';
  UPDATE public.booking_service_groups SET status = 'active', updated_at = v_now
  WHERE id IN (SELECT DISTINCT bs.service_group_id FROM public.booking_services bs
    JOIN public.bookings b ON b.id = bs.booking_id WHERE b.payment_group_id = p_payment_group_id)
    AND status = 'pending_payment';

  RETURN 'confirmed_with_services';
END;
$function$;

CREATE FUNCTION public.apply_payment_group_failure(
  p_payment_group_id uuid,
  p_final_status text,
  p_provider_payment_id text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_group public.payment_groups%ROWTYPE;
  v_result text;
BEGIN
  IF p_payment_group_id IS NULL OR p_final_status IS NULL OR p_final_status NOT IN ('cancelled', 'failed') THEN
    RAISE EXCEPTION 'Invalid payment failure parameters';
  END IF;
  SELECT * INTO v_group FROM public.payment_groups
  WHERE id = p_payment_group_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment group not found'; END IF;

  IF v_group.order_type = 'pass_purchase' THEN
    IF v_group.provider <> 'yookassa' THEN RAISE EXCEPTION 'Unsupported payment provider'; END IF;
    IF p_provider_payment_id IS NOT NULL AND v_group.provider_payment_id IS NOT NULL
       AND v_group.provider_payment_id <> p_provider_payment_id THEN
      RAISE EXCEPTION 'Provider payment ID mismatch';
    END IF;
    IF v_group.status = 'succeeded' THEN RETURN 'already_paid'; END IF;
    IF v_group.status = p_final_status THEN RETURN 'already_processed'; END IF;
    IF v_group.status <> 'pending' THEN RETURN 'terminal_state_conflict'; END IF;

    UPDATE public.payment_groups SET status = p_final_status,
      provider_payment_id = coalesce(provider_payment_id, p_provider_payment_id),
      failure_reason = p_failure_reason, last_checked_at = pg_catalog.clock_timestamp(),
      updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_payment_group_id;
    UPDATE public.user_passes SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
    WHERE purchase_payment_group_id = p_payment_group_id AND status = 'pending_payment';
    RETURN 'released';
  END IF;

  IF v_group.order_type = 'booking_services' THEN
    v_result := public.apply_payment_group_failure_cash_legacy(
      p_payment_group_id, p_final_status, p_provider_payment_id, p_failure_reason
    );
    IF v_result = 'released' THEN
      UPDATE public.booking_services SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
      WHERE booking_id IN (SELECT id FROM public.bookings WHERE payment_group_id = p_payment_group_id)
        AND status = 'pending_payment';
      UPDATE public.booking_service_groups SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
      WHERE id IN (SELECT DISTINCT bs.service_group_id FROM public.booking_services bs
        JOIN public.bookings b ON b.id = bs.booking_id WHERE b.payment_group_id = p_payment_group_id)
        AND status = 'pending_payment';
    END IF;
    RETURN v_result;
  END IF;

  RETURN public.apply_payment_group_failure_cash_legacy(
    p_payment_group_id, p_final_status, p_provider_payment_id, p_failure_reason
  );
END;
$function$;

CREATE FUNCTION public.expire_stale_yookassa_payment_groups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_count integer := 0;
  v_group_id uuid;
BEGIN
  v_count := public.expire_stale_yookassa_payment_groups_cash_legacy();

  UPDATE public.booking_services bs
  SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
  WHERE bs.status = 'pending_payment'
    AND bs.booking_id IN (
      SELECT b.id FROM public.bookings b
      JOIN public.payment_groups pg ON pg.id = b.payment_group_id
      WHERE pg.order_type = 'booking_services' AND pg.status = 'cancelled'
        AND pg.failure_reason = 'payment_timeout_10m' AND b.status = 'expired'
    );
  UPDATE public.booking_service_groups g
  SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
  WHERE g.status = 'pending_payment'
    AND g.id IN (
      SELECT DISTINCT bs.service_group_id FROM public.booking_services bs
      JOIN public.bookings b ON b.id = bs.booking_id
      JOIN public.payment_groups pg ON pg.id = b.payment_group_id
      WHERE pg.order_type = 'booking_services' AND pg.status = 'cancelled'
        AND pg.failure_reason = 'payment_timeout_10m' AND b.status = 'expired'
    );

  FOR v_group_id IN
    SELECT pg.id FROM public.payment_groups pg
    WHERE pg.order_type = 'pass_purchase'
      AND pg.provider = 'yookassa' AND pg.status = 'pending'
      AND pg.payment_init_started_at IS NOT NULL
      AND pg.payment_init_started_at + interval '5 minutes' <= pg_catalog.clock_timestamp()
      AND NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.payment_group_id = pg.id)
    ORDER BY pg.payment_init_started_at, pg.id
    LIMIT 200
    FOR UPDATE OF pg SKIP LOCKED
  LOOP
    UPDATE public.payment_groups SET status = 'cancelled', failure_reason = 'payment_timeout_10m',
      last_checked_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_group_id AND status = 'pending';
    IF FOUND THEN
      UPDATE public.user_passes SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
      WHERE purchase_payment_group_id = v_group_id AND status = 'pending_payment';
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END;
$function$;

CREATE FUNCTION public.expire_unpaid_payment_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  v_count := public.expire_unpaid_payment_holds_cash_legacy();
  UPDATE public.booking_services bs
  SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
  WHERE bs.status = 'pending_payment'
    AND bs.booking_id IN (
      SELECT b.id FROM public.bookings b
      JOIN public.payment_groups pg ON pg.id = b.payment_group_id
      WHERE pg.order_type = 'booking_services' AND pg.status = 'cancelled'
        AND pg.payment_init_started_at IS NULL AND b.status = 'expired'
    );
  UPDATE public.booking_service_groups g
  SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
  WHERE g.status = 'pending_payment'
    AND g.id IN (
      SELECT DISTINCT bs.service_group_id FROM public.booking_services bs
      JOIN public.bookings b ON b.id = bs.booking_id
      JOIN public.payment_groups pg ON pg.id = b.payment_group_id
      WHERE pg.order_type = 'booking_services' AND pg.status = 'cancelled'
        AND pg.payment_init_started_at IS NULL AND b.status = 'expired'
    );
  UPDATE public.user_passes up
  SET status = 'cancelled', updated_at = pg_catalog.clock_timestamp()
  FROM public.payment_groups pg
  WHERE pg.id = up.purchase_payment_group_id
    AND pg.order_type = 'pass_purchase'
    AND pg.status = 'cancelled'
    AND up.status = 'pending_payment';
  RETURN v_count;
END;
$function$;

-- The renamed implementations are internal delegates, not public RPC endpoints.
REVOKE ALL ON FUNCTION public.begin_payment_initialization_cash_legacy(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_payment_group_success_cash_legacy(uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_payment_group_failure_cash_legacy(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_stale_yookassa_payment_groups_cash_legacy()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_unpaid_payment_holds_cash_legacy()
  FROM PUBLIC, anon, authenticated, service_role;

-- Internal payment RPCs are callable only by the trusted server role.
REVOKE ALL ON FUNCTION public.begin_payment_initialization(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_payment_initialization(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.apply_payment_group_success(uuid, text, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_group_success(uuid, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.apply_payment_group_failure(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment_group_failure(uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.expire_stale_yookassa_payment_groups()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_unpaid_payment_holds()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_payment_holds() TO service_role;

COMMIT;
