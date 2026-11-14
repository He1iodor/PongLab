
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
BEGIN
    IF p_payment_group_id IS NULL
       OR p_provider_payment_id IS NULL
       OR length(trim(p_provider_payment_id)) = 0
       OR p_amount_rub IS NULL
       OR p_amount_rub <= 0
    THEN
        RAISE EXCEPTION 'Invalid payment confirmation parameters';
    END IF;

    SELECT *
    INTO v_group
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
        SET
            provider_payment_id = COALESCE(provider_payment_id, p_provider_payment_id),
            failure_reason = 'payment_timeout_10m|late_success_refund_required',
            paid_at = COALESCE(paid_at, pg_catalog.clock_timestamp()),
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
        GREATEST(
            1,
            COALESCE(pg_catalog.max(sbs.hold_minutes)::integer, 10)
        )
    )
    INTO v_timeout_minutes
    FROM public.bookings AS b
    JOIN public.studio_tables AS st
      ON st.id = b.table_id
    JOIN public.studio_booking_settings AS sbs
      ON sbs.studio_id = st.studio_id
    WHERE b.payment_group_id = p_payment_group_id;

    v_timeout_minutes := COALESCE(v_timeout_minutes, 10);
    v_now := pg_catalog.clock_timestamp();

    IF v_group.payment_init_started_at
       + pg_catalog.make_interval(mins => v_timeout_minutes) <= v_now
    THEN
        PERFORM b.id
        FROM public.bookings AS b
        WHERE b.payment_group_id = p_payment_group_id
        FOR UPDATE;

        UPDATE public.payment_groups
        SET
            status = 'cancelled',
            provider_payment_id = COALESCE(provider_payment_id, p_provider_payment_id),
            failure_reason = 'payment_timeout_10m|late_success_refund_required',
            paid_at = COALESCE(paid_at, v_now),
            last_checked_at = v_now,
            updated_at = v_now
        WHERE id = p_payment_group_id
          AND status = 'pending';

        UPDATE public.bookings
        SET
            status = 'expired',
            payment_status = 'cancelled',
            updated_at = v_now
        WHERE payment_group_id = p_payment_group_id
          AND status = 'pending_payment'
          AND payment_status = 'pending';

        RETURN 'late_success_refund_required';
    END IF;

    PERFORM b.id
    FROM public.bookings AS b
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
    INTO
        v_booking_count,
        v_invalid_count
    FROM public.bookings AS b
    WHERE b.payment_group_id = p_payment_group_id;

    IF v_booking_count = 0 THEN
        RAISE EXCEPTION 'Payment group has no bookings';
    END IF;

    IF v_invalid_count > 0 THEN
        RETURN 'booking_state_conflict';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.bookings b
        LEFT JOIN public.booking_payment_allocations a
          ON a.booking_id = b.id
         AND a.payment_group_id = p_payment_group_id
        WHERE b.payment_group_id = p_payment_group_id
          AND a.id IS NOT NULL
          AND (
              a.amount_rub <> b.price_rub
              OR a.currency <> v_group.currency
          )
    ) THEN
        RAISE EXCEPTION 'Existing payment allocation does not match booking';
    END IF;

    UPDATE public.payment_groups
    SET
        status = 'succeeded',
        provider_payment_id = p_provider_payment_id,
        paid_at = pg_catalog.clock_timestamp(),
        last_checked_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_payment_group_id;

    UPDATE public.bookings
    SET
        status = 'confirmed',
        payment_status = 'succeeded',
        updated_at = pg_catalog.clock_timestamp()
    WHERE payment_group_id = p_payment_group_id;

    INSERT INTO public.booking_payment_allocations (
        booking_id,
        payment_group_id,
        amount_rub,
        currency
    )
    SELECT
        b.id,
        p_payment_group_id,
        b.price_rub,
        v_group.currency
    FROM public.bookings b
    WHERE b.payment_group_id = p_payment_group_id
      AND b.status = 'confirmed'
      AND b.payment_status = 'succeeded'
    ON CONFLICT (payment_group_id, booking_id) DO NOTHING;

    RETURN 'confirmed';
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_payment_group_success(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_payment_group_success(uuid, text, integer)
    TO service_role;
