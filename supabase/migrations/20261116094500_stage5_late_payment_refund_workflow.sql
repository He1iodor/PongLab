
-- PongLab Stage 5:
-- Automatically refund YooKassa payments confirmed after local hold timeout.
-- The expired booking is never restored and its slot is never reclaimed.

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

    SELECT *
    INTO v_group
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

    -- Lock every booking in the group before validating its state.
    PERFORM b.id
    FROM public.bookings AS b
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
            + CASE
                WHEN count(*) FILTER (
                    WHERE b.booking_operation_id IS NULL
                ) > 0 THEN 1
                ELSE 0
              END
        )::integer
    INTO
        v_booking_count,
        v_invalid_booking_count,
        v_operation_link_count
    FROM public.bookings AS b
    WHERE b.payment_group_id = p_payment_group_id;

    IF v_booking_count = 0
       OR v_invalid_booking_count > 0
       OR v_operation_link_count <> 1
    THEN
        RAISE EXCEPTION 'Late payment bookings are not all released or consistently linked';
    END IF;

    -- A normal payment group is attached to its first booking.
    -- A transfer adjustment group is attached to the original source booking.
    v_booking := v_placeholder;

    IF v_placeholder.booking_operation_id IS NOT NULL THEN
        SELECT *
        INTO v_transfer
        FROM public.booking_operations
        WHERE id = v_placeholder.booking_operation_id
        FOR UPDATE;

        IF NOT FOUND
           OR v_transfer.operation_type IS DISTINCT FROM 'transfer'
           OR v_transfer.user_id IS DISTINCT FROM v_group.user_id
           OR v_transfer.adjustment_payment_group_id IS DISTINCT FROM p_payment_group_id
        THEN
            RAISE EXCEPTION 'Late payment transfer link is invalid';
        END IF;

        SELECT *
        INTO v_booking
        FROM public.bookings
        WHERE id = v_transfer.booking_id
          AND user_id = v_group.user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Original transfer booking not found';
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
                    FROM public.bookings AS b
                    WHERE b.payment_group_id = p_payment_group_id
                ),
                'related_transfer_operation_id', v_placeholder.booking_operation_id,
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

    -- Reuse an existing pending record and its original idempotency key.
    -- This is the retry path for a network error or an unknown provider response.
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

    -- A provider-cancelled refund is not automatically recreated.
    -- It requires a separate manual decision; do not issue repeated new refunds.
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
            CASE
                WHEN v_refund.status = 'cancelled' THEN 'retry_required'
                ELSE 'review_required'
            END,
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
        metadata = coalesce(metadata, '{}'::jsonb) ||
            pg_catalog.jsonb_build_object(
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


CREATE OR REPLACE FUNCTION public.finalize_late_payment_refund(
    p_refund_id uuid,
    p_provider_refund_id text,
    p_provider_status text,
    p_provider_response jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_refund public.payment_refunds%ROWTYPE;
    v_operation public.booking_operations%ROWTYPE;
    v_group public.payment_groups%ROWTYPE;
    v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
    IF p_refund_id IS NULL
       OR p_provider_refund_id IS NULL
       OR pg_catalog.length(pg_catalog.btrim(p_provider_refund_id)) < 1
       OR pg_catalog.length(p_provider_refund_id) > 200
       OR p_provider_status IS NULL
       OR p_provider_status NOT IN ('pending', 'succeeded', 'canceled')
       OR p_provider_response IS NULL
       OR pg_catalog.jsonb_typeof(p_provider_response) <> 'object'
    THEN
        RAISE EXCEPTION 'Invalid late payment refund finalization parameters';
    END IF;

    -- Read foreign keys first, then lock in the same order as prepare:
    -- payment group -> operation -> refund row.
    SELECT *
    INTO v_refund
    FROM public.payment_refunds
    WHERE id = p_refund_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Late payment refund not found';
    END IF;

    SELECT *
    INTO v_group
    FROM public.payment_groups
    WHERE id = v_refund.payment_group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Late payment group not found';
    END IF;

    SELECT *
    INTO v_operation
    FROM public.booking_operations
    WHERE id = v_refund.booking_operation_id
      AND operation_type = 'late_payment_refund'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Late payment refund operation not found';
    END IF;

    SELECT *
    INTO v_refund
    FROM public.payment_refunds
    WHERE id = p_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Late payment refund disappeared';
    END IF;

    IF v_refund.provider IS DISTINCT FROM 'yookassa'
       OR v_group.provider IS DISTINCT FROM 'yookassa'
       OR v_refund.payment_group_id IS DISTINCT FROM v_group.id
       OR v_refund.provider_payment_id IS DISTINCT FROM v_group.provider_payment_id
       OR v_refund.amount_rub IS DISTINCT FROM v_group.amount_rub
       OR v_refund.currency IS DISTINCT FROM 'RUB'
       OR v_group.currency IS DISTINCT FROM 'RUB'
       OR v_operation.user_id IS DISTINCT FROM v_group.user_id
       OR v_operation.source_payment_group_id IS DISTINCT FROM v_group.id
       OR v_group.failure_reason IS DISTINCT FROM
          'payment_timeout_10m|late_success_refund_required'
       OR (
          v_refund.provider_refund_id IS NOT NULL
          AND v_refund.provider_refund_id IS DISTINCT FROM p_provider_refund_id
       )
    THEN
        RAISE EXCEPTION 'Late payment refund does not match its payment group';
    END IF;

    IF v_refund.status = 'succeeded' THEN
        IF v_group.status <> 'refunded'
           OR v_operation.status <> 'completed'
        THEN
            RAISE EXCEPTION 'Succeeded refund has inconsistent local state';
        END IF;

        RETURN 'refunded';
    END IF;

    IF v_operation.status <> 'processing'
       OR v_refund.status <> 'pending'
    THEN
        RETURN 'terminal_refund_record';
    END IF;

    IF p_provider_status = 'pending' THEN
        UPDATE public.payment_refunds
        SET provider_refund_id = p_provider_refund_id,
            provider_response = p_provider_response,
            updated_at = v_now
        WHERE id = p_refund_id;

        RETURN 'pending';
    END IF;

    IF p_provider_status = 'canceled' THEN
        UPDATE public.payment_refunds
        SET status = 'cancelled',
            provider_refund_id = p_provider_refund_id,
            provider_response = p_provider_response,
            failure_reason = 'YooKassa canceled late payment refund',
            updated_at = v_now
        WHERE id = p_refund_id;

        UPDATE public.booking_operations
        SET metadata = coalesce(metadata, '{}'::jsonb) ||
            pg_catalog.jsonb_build_object(
                'refund_retry_required', true,
                'refund_last_canceled_at', v_now
            ),
            updated_at = v_now
        WHERE id = v_operation.id;

        RETURN 'retry_required';
    END IF;

    -- Only a provider-confirmed succeeded refund reaches this branch.
    UPDATE public.payment_refunds
    SET status = 'succeeded',
        provider_refund_id = p_provider_refund_id,
        provider_response = p_provider_response,
        succeeded_at = v_now,
        updated_at = v_now
    WHERE id = p_refund_id;

    UPDATE public.payment_groups
    SET status = 'refunded',
        last_checked_at = v_now,
        updated_at = v_now
    WHERE id = v_group.id
      AND status = 'cancelled'
      AND failure_reason = 'payment_timeout_10m|late_success_refund_required';

    IF NOT FOUND AND v_group.status <> 'refunded' THEN
        RAISE EXCEPTION 'Late payment group could not be marked refunded';
    END IF;

    UPDATE public.booking_operations
    SET status = 'completed',
        completed_at = v_now,
        metadata = coalesce(metadata, '{}'::jsonb) ||
            pg_catalog.jsonb_build_object(
                'refund_retry_required', false,
                'refund_succeeded_at', v_now,
                'refund_succeeded_rub', v_refund.amount_rub,
                'provider_refund_id', p_provider_refund_id
            ),
        updated_at = v_now
    WHERE id = v_operation.id
      AND status = 'processing';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Late payment refund operation could not be completed';
    END IF;

    RETURN 'refunded';
END;
$function$;


REVOKE ALL ON FUNCTION public.prepare_late_payment_refund(uuid, text, integer)
    FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.finalize_late_payment_refund(uuid, text, text, jsonb)
    FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.prepare_late_payment_refund(uuid, text, integer)
    TO service_role;

GRANT EXECUTE ON FUNCTION public.finalize_late_payment_refund(uuid, text, text, jsonb)
    TO service_role;
