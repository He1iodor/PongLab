-- PongLab: close initialized YooKassa payment holds after the configured 10-minute window.
-- The provider payment itself is NOT force-cancelled here: YooKassa does not allow
-- cancellation of an ordinary one-stage `pending` payment through its cancel API.
-- If YooKassa later confirms success, the existing success RPC marks the group
-- `payment_timeout_10m|late_success_refund_required` for manual customer contact/refund.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Expire only initialized YooKassa payments that are still pending after the
-- studio's configured hold_minutes. Existing uninitialized-hold cleanup remains
-- unchanged. Group + bookings are updated atomically while the group row is locked.
CREATE OR REPLACE FUNCTION public.expire_stale_yookassa_payment_groups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_now timestamptz := pg_catalog.clock_timestamp();
    v_group_id uuid;
    v_expired_count integer := 0;
BEGIN
    FOR v_group_id IN
        SELECT pg.id
        FROM public.payment_groups AS pg
        WHERE pg.provider = 'yookassa'
          AND pg.status = 'pending'
          AND pg.payment_init_started_at IS NOT NULL
          AND pg.payment_init_started_at + pg_catalog.make_interval(
                mins => LEAST(
                    60,
                    GREATEST(
                        1,
                        COALESCE(
                            (
                                SELECT pg_catalog.max(sbs.hold_minutes)::integer
                                FROM public.bookings AS b
                                JOIN public.studio_tables AS st
                                  ON st.id = b.table_id
                                JOIN public.studio_booking_settings AS sbs
                                  ON sbs.studio_id = st.studio_id
                                WHERE b.payment_group_id = pg.id
                            ),
                            10
                        )
                    )
                )
          ) <= v_now
          AND EXISTS (
              SELECT 1
              FROM public.bookings AS b
              WHERE b.payment_group_id = pg.id
          )
        ORDER BY pg.payment_init_started_at, pg.id
        LIMIT 200
        FOR UPDATE OF pg SKIP LOCKED
    LOOP
        UPDATE public.payment_groups AS pg
        SET
            status = 'cancelled',
            failure_reason = 'payment_timeout_10m',
            last_checked_at = v_now,
            updated_at = v_now
        WHERE pg.id = v_group_id
          AND pg.status = 'pending';

        IF FOUND THEN
            UPDATE public.bookings AS b
            SET
                status = 'expired',
                payment_status = 'cancelled',
                updated_at = v_now
            WHERE b.payment_group_id = v_group_id
              AND b.status = 'pending_payment'
              AND b.payment_status = 'pending';

            v_expired_count := v_expired_count + 1;
        END IF;
    END LOOP;

    RETURN v_expired_count;
END;
$function$;

-- The scheduled job runs as postgres (the role that creates it in the SQL editor).
-- Do not expose this SECURITY DEFINER function to application-facing roles.
REVOKE ALL ON FUNCTION public.expire_stale_yookassa_payment_groups()
    FROM PUBLIC, anon, authenticated, service_role;

-- Preserve the existing payment validation and confirmation flow, while making
-- success arriving after the 10-minute local deadline a refund-review case.
-- A late success never reactivates an expired slot that may already be rebooked.
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

    -- Repeated notification for a payment already applied.
    IF v_group.status = 'succeeded' THEN
        RETURN 'already_processed';
    END IF;

    -- The timeout worker may already have released the booking. Record the
    -- provider payment ID and create a durable refund-review marker instead
    -- of restoring the booking or reclaiming its slot.
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
            provider_payment_id = COALESCE(
                provider_payment_id,
                p_provider_payment_id
            ),
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

    -- Payment initialization must have been started while the original
    -- booking hold was valid.
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

    -- This second deadline check closes the race where a success notification
    -- reaches the database after 10 minutes but before the cron worker runs.
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
            provider_payment_id = COALESCE(
                provider_payment_id,
                p_provider_payment_id
            ),
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

    -- Payment initialization keeps the booking group locked while the provider
    -- is processing a payment that began within the original hold.
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

    RETURN 'confirmed';
END;
$function$;

-- Supabase Cron supports second-based schedules on the project's PostgreSQL 17.
-- Reusing this permanent job name updates the existing job instead of duplicating it.
SELECT cron.schedule(
    'ponglab-expire-stale-yookassa-payments',
    '10 seconds',
    'SELECT public.expire_stale_yookassa_payment_groups();'
);

