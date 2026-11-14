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

    /*
     * Adjustment payment for a transfer:
     * the payment is allocated to the original booking, while the temporary
     * operation hold is cancelled inside this transaction before moving the
     * original booking into the reserved target slot.
     */
    SELECT *
    INTO v_placeholder
    FROM public.bookings AS b
    WHERE b.payment_group_id = p_payment_group_id
      AND b.booking_operation_id IS NOT NULL
    LIMIT 1;

    IF FOUND THEN
        IF v_booking_count <> 1 THEN
            RAISE EXCEPTION 'Transfer adjustment group must contain exactly one placeholder';
        END IF;

        SELECT *
        INTO v_transfer
        FROM public.booking_operations AS bo
        WHERE bo.id = v_placeholder.booking_operation_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Transfer operation not found';
        END IF;

        -- Match the source-booking-first lock order used by customer operations.
        SELECT *
        INTO v_source_booking
        FROM public.bookings AS b
        WHERE b.id = v_transfer.booking_id
        FOR UPDATE;

        SELECT *
        INTO v_transfer
        FROM public.booking_operations AS bo
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
            FROM public.booking_payment_allocations AS a
            WHERE a.booking_id = v_source_booking.id
              AND a.payment_group_id = p_payment_group_id
              AND (
                  a.amount_rub <> v_group.amount_rub
                  OR a.currency <> v_group.currency
              )
        ) THEN
            RAISE EXCEPTION 'Existing transfer payment allocation is inconsistent';
        END IF;

        UPDATE public.payment_groups
        SET
            status = 'succeeded',
            provider_payment_id = p_provider_payment_id,
            paid_at = v_now,
            last_checked_at = v_now,
            updated_at = v_now
        WHERE id = p_payment_group_id;

        -- Release the temporary target-slot hold before moving the source row.
        UPDATE public.bookings
        SET
            status = 'cancelled',
            payment_status = 'succeeded',
            updated_at = v_now
        WHERE id = v_placeholder.id
          AND booking_operation_id = v_transfer.id
          AND status = 'pending_payment';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Transfer placeholder could not be released';
        END IF;

        UPDATE public.bookings
        SET
            table_id = v_transfer.target_table_id,
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
            booking_id,
            payment_group_id,
            amount_rub,
            currency
        )
        VALUES (
            v_source_booking.id,
            p_payment_group_id,
            v_group.amount_rub,
            v_group.currency
        )
        ON CONFLICT (payment_group_id, booking_id) DO NOTHING;

        UPDATE public.booking_operations
        SET
            status = 'completed',
            completed_at = v_now,
            updated_at = v_now
        WHERE id = v_transfer.id
          AND status = 'awaiting_payment';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Transfer operation could not be completed';
        END IF;

        RETURN 'transfer_completed';
    END IF;

    -- Standard booking payment path remains unchanged.
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
