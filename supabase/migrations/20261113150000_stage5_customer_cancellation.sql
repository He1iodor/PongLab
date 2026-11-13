
-- ============================================================
-- PongLab — Stage 5: customer cancellation and refunds
-- ============================================================

CREATE OR REPLACE FUNCTION public.prepare_customer_booking_cancellation(
    p_booking_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_booking public.bookings%ROWTYPE;
    v_group public.payment_groups%ROWTYPE;
    v_operation public.booking_operations%ROWTYPE;
    v_refund public.payment_refunds%ROWTYPE;
    v_reserved_refunds integer;
    v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
    IF p_booking_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'Invalid cancellation parameters';
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

    SELECT *
    INTO v_operation
    FROM public.booking_operations
    WHERE booking_id = p_booking_id
      AND operation_type = 'cancellation'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        SELECT *
        INTO v_refund
        FROM public.payment_refunds
        WHERE booking_operation_id = v_operation.id
        FOR UPDATE;

        RETURN pg_catalog.jsonb_build_object(
            'result', 'existing_operation',
            'operation_id', v_operation.id,
            'operation_status', v_operation.status,
            'refund_id', v_refund.id,
            'refund_status', v_refund.status,
            'provider_refund_id', v_refund.provider_refund_id,
            'amount_rub', v_refund.amount_rub
        );
    END IF;

    IF v_booking.status <> 'confirmed'
       OR v_booking.payment_status <> 'succeeded'
    THEN
        RAISE EXCEPTION 'Booking is not paid and confirmed';
    END IF;

    -- Exactly 24 hours is too late for self-service cancellation.
    IF v_booking.start_at <= v_now + interval '24 hours' THEN
        RAISE EXCEPTION 'Cancellation deadline has passed';
    END IF;

    IF v_booking.payment_group_id IS NULL THEN
        RAISE EXCEPTION 'Booking has no payment group';
    END IF;

    SELECT *
    INTO v_group
    FROM public.payment_groups
    WHERE id = v_booking.payment_group_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_group.status <> 'succeeded'
       OR v_group.provider <> 'yookassa'
       OR v_group.provider_payment_id IS NULL
    THEN
        RAISE EXCEPTION 'Payment is not eligible for automatic refund';
    END IF;

    -- Pending refunds reserve their amounts too. This prevents
    -- concurrent requests from exceeding the original payment.
    SELECT COALESCE(pg_catalog.sum(amount_rub), 0)::integer
    INTO v_reserved_refunds
    FROM public.payment_refunds
    WHERE payment_group_id = v_group.id
      AND status IN ('pending', 'succeeded');

    IF v_reserved_refunds + v_booking.price_rub > v_group.amount_rub THEN
        RAISE EXCEPTION 'Refund amount exceeds remaining payment amount';
    END IF;

    IF v_booking.price_rub < 1 THEN
        RAISE EXCEPTION 'Refund amount is below provider minimum';
    END IF;

    INSERT INTO public.booking_operations (
        idempotency_key,
        booking_id,
        user_id,
        operation_type,
        status,
        actor_type,
        actor_user_id,
        source_payment_group_id,
        source_start_at,
        source_end_at,
        source_price_rub
    )
    VALUES (
        'customer-cancellation:' || p_booking_id::text,
        p_booking_id,
        p_user_id,
        'cancellation',
        'processing',
        'customer',
        p_user_id,
        v_group.id,
        v_booking.start_at,
        v_booking.end_at,
        v_booking.price_rub
    )
    RETURNING * INTO v_operation;

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
        v_group.id,
        v_group.provider,
        v_group.provider_payment_id,
        v_booking.price_rub,
        pg_catalog.gen_random_uuid()::text,
        p_user_id
    )
    RETURNING * INTO v_refund;

    RETURN pg_catalog.jsonb_build_object(
        'result', 'prepared',
        'operation_id', v_operation.id,
        'refund_id', v_refund.id,
        'provider', v_refund.provider,
        'provider_payment_id', v_refund.provider_payment_id,
        'idempotency_key', v_refund.idempotency_key,
        'amount_rub', v_refund.amount_rub,
        'currency', v_refund.currency
    );
END;
$function$;


CREATE OR REPLACE FUNCTION public.finalize_customer_booking_cancellation(
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
    v_booking public.bookings%ROWTYPE;
    v_group public.payment_groups%ROWTYPE;
    v_total_refunded integer;
BEGIN
    IF p_refund_id IS NULL
       OR p_provider_status NOT IN ('pending', 'succeeded', 'canceled')
       OR p_provider_response IS NULL
       OR pg_catalog.jsonb_typeof(p_provider_response) <> 'object'
    THEN
        RAISE EXCEPTION 'Invalid refund finalization parameters';
    END IF;

    SELECT *
    INTO v_refund
    FROM public.payment_refunds
    WHERE id = p_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund not found';
    END IF;

    SELECT *
    INTO v_operation
    FROM public.booking_operations
    WHERE id = v_refund.booking_operation_id
    FOR UPDATE;

    SELECT *
    INTO v_booking
    FROM public.bookings
    WHERE id = v_operation.booking_id
    FOR UPDATE;

    SELECT *
    INTO v_group
    FROM public.payment_groups
    WHERE id = v_refund.payment_group_id
    FOR UPDATE;

    IF v_refund.status = 'succeeded' THEN
        RETURN 'already_completed';
    END IF;

    IF v_refund.status IN ('cancelled', 'failed') THEN
        RETURN 'terminal_refund_state';
    END IF;

    IF p_provider_refund_id IS NOT NULL
       AND pg_catalog.length(p_provider_refund_id) > 200
    THEN
        RAISE EXCEPTION 'Invalid provider refund ID';
    END IF;

    IF p_provider_status = 'pending' THEN
        UPDATE public.payment_refunds
        SET
            provider_refund_id = COALESCE(
                provider_refund_id,
                p_provider_refund_id
            ),
            provider_response = p_provider_response,
            updated_at = pg_catalog.clock_timestamp()
        WHERE id = p_refund_id;

        RETURN 'pending';
    END IF;

    IF p_provider_status = 'canceled' THEN
        UPDATE public.payment_refunds
        SET
            status = 'cancelled',
            provider_refund_id = COALESCE(
                provider_refund_id,
                p_provider_refund_id
            ),
            provider_response = p_provider_response,
            failure_reason = 'Provider canceled refund',
            updated_at = pg_catalog.clock_timestamp()
        WHERE id = p_refund_id;

        UPDATE public.booking_operations
        SET
            status = 'failed',
            updated_at = pg_catalog.clock_timestamp()
        WHERE id = v_operation.id;

        RETURN 'refund_cancelled';
    END IF;

    UPDATE public.payment_refunds
    SET
        status = 'succeeded',
        provider_refund_id = COALESCE(
            provider_refund_id,
            p_provider_refund_id
        ),
        provider_response = p_provider_response,
        succeeded_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = p_refund_id;

    -- Cancel only the booking whose refund has succeeded.
    UPDATE public.bookings
    SET
        status = 'cancelled',
        payment_status = 'refunded',
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_booking.id
      AND status = 'confirmed'
      AND payment_status = 'succeeded';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking state changed during refund';
    END IF;

    UPDATE public.booking_operations
    SET
        status = 'completed',
        completed_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_operation.id;

    SELECT COALESCE(pg_catalog.sum(amount_rub), 0)::integer
    INTO v_total_refunded
    FROM public.payment_refunds
    WHERE payment_group_id = v_group.id
      AND status = 'succeeded';

    -- A payment group is refunded only when its full amount
    -- has actually been returned.
    IF v_total_refunded >= v_group.amount_rub THEN
        UPDATE public.payment_groups
        SET
            status = 'refunded',
            updated_at = pg_catalog.clock_timestamp()
        WHERE id = v_group.id
          AND status = 'succeeded';
    END IF;

    RETURN 'completed';
END;
$function$;


REVOKE ALL ON FUNCTION
    public.prepare_customer_booking_cancellation(uuid, uuid)
    FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
    public.finalize_customer_booking_cancellation(uuid, text, text, jsonb)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.prepare_customer_booking_cancellation(uuid, uuid)
    TO service_role;

GRANT EXECUTE ON FUNCTION
    public.finalize_customer_booking_cancellation(uuid, text, text, jsonb)
    TO service_role;
