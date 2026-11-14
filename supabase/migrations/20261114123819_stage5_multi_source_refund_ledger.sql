
ALTER TABLE public.booking_payment_allocations
    ADD COLUMN IF NOT EXISTS refunded_amount_rub integer NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.booking_payment_allocations'::regclass
          AND conname = 'booking_payment_allocations_refunded_amount_check'
    ) THEN
        ALTER TABLE public.booking_payment_allocations
            ADD CONSTRAINT booking_payment_allocations_refunded_amount_check
            CHECK (refunded_amount_rub >= 0 AND refunded_amount_rub <= amount_rub);
    END IF;
END;
$$;

ALTER TABLE public.payment_refunds
    DROP CONSTRAINT IF EXISTS payment_refunds_operation_group_unique;

CREATE UNIQUE INDEX IF NOT EXISTS payment_refunds_operation_group_active_uidx
    ON public.payment_refunds (booking_operation_id, payment_group_id)
    WHERE status IN ('pending', 'succeeded');

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
    v_operation public.booking_operations%ROWTYPE;
    v_allocation record;
    v_reserved_group integer;
    v_reserved_operation integer;
    v_succeeded_operation integer;
    v_remaining integer;
    v_available_allocation integer;
    v_available_group integer;
    v_refund_amount integer;
    v_refund_ids jsonb;
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

    IF FOUND AND v_operation.status = 'completed' THEN
        RETURN pg_catalog.jsonb_build_object(
            'state', 'completed',
            'operation_id', v_operation.id,
            'operation_status', v_operation.status,
            'refund_ids', '[]'::jsonb
        );
    END IF;

    IF v_booking.status <> 'confirmed'
       OR v_booking.payment_status <> 'succeeded'
    THEN
        RAISE EXCEPTION 'Booking is not paid and confirmed';
    END IF;

    IF v_booking.start_at <= v_now + interval '24 hours' THEN
        RAISE EXCEPTION 'Cancellation deadline has passed';
    END IF;

    IF NOT FOUND THEN
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
            v_booking.payment_group_id,
            v_booking.start_at,
            v_booking.end_at,
            v_booking.price_rub
        )
        RETURNING * INTO v_operation;
    ELSE
        UPDATE public.booking_operations
        SET status = 'processing',
            updated_at = v_now
        WHERE id = v_operation.id
        RETURNING * INTO v_operation;
    END IF;

    SELECT
        COALESCE(sum(a.amount_rub - a.refunded_amount_rub), 0)::integer
    INTO v_available_allocation
    FROM public.booking_payment_allocations a
    WHERE a.booking_id = p_booking_id;

    IF v_available_allocation <> v_booking.price_rub THEN
        RAISE EXCEPTION
            'Booking payment allocation balance does not match booking price';
    END IF;

    SELECT
        COALESCE(sum(r.amount_rub) FILTER (WHERE r.status = 'succeeded'), 0)::integer,
        COALESCE(sum(r.amount_rub) FILTER (WHERE r.status = 'pending'), 0)::integer
    INTO v_succeeded_operation, v_reserved_operation
    FROM public.payment_refunds r
    WHERE r.booking_operation_id = v_operation.id;

    v_remaining := v_booking.price_rub
        - v_succeeded_operation
        - v_reserved_operation;

    IF v_remaining < 0 THEN
        RAISE EXCEPTION 'Refund reservation exceeds cancellation amount';
    END IF;

    FOR v_allocation IN
        SELECT
            a.id AS allocation_id,
            a.payment_group_id,
            a.amount_rub,
            a.refunded_amount_rub,
            pg.provider,
            pg.provider_payment_id,
            pg.amount_rub AS group_amount_rub,
            pg.status AS group_status
        FROM public.booking_payment_allocations a
        JOIN public.payment_groups pg
          ON pg.id = a.payment_group_id
        WHERE a.booking_id = p_booking_id
          AND a.amount_rub > a.refunded_amount_rub
        ORDER BY a.created_at DESC, a.id
        FOR UPDATE OF a, pg
    LOOP
        EXIT WHEN v_remaining = 0;

        IF v_allocation.provider <> 'yookassa'
           OR v_allocation.provider_payment_id IS NULL
           OR v_allocation.group_status NOT IN ('succeeded', 'refunded')
        THEN
            RAISE EXCEPTION 'A source payment is not eligible for automatic refund';
        END IF;

        SELECT COALESCE(sum(r.amount_rub), 0)::integer
        INTO v_reserved_group
        FROM public.payment_refunds r
        WHERE r.payment_group_id = v_allocation.payment_group_id
          AND r.status IN ('pending', 'succeeded');

        SELECT COALESCE(sum(r.amount_rub), 0)::integer
        INTO v_reserved_operation
        FROM public.payment_refunds r
        WHERE r.booking_operation_id = v_operation.id
          AND r.payment_group_id = v_allocation.payment_group_id
          AND r.status = 'pending';

        v_available_allocation :=
            v_allocation.amount_rub
            - v_allocation.refunded_amount_rub
            - v_reserved_operation;

        v_available_group :=
            v_allocation.group_amount_rub
            - v_reserved_group;

        v_refund_amount := LEAST(
            v_remaining,
            v_available_allocation,
            v_available_group
        );

        IF v_refund_amount > 0 THEN
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
                v_allocation.payment_group_id,
                v_allocation.provider,
                v_allocation.provider_payment_id,
                v_refund_amount,
                pg_catalog.gen_random_uuid()::text,
                p_user_id
            );

            v_remaining := v_remaining - v_refund_amount;
        END IF;
    END LOOP;

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'Not enough refundable source payment balance';
    END IF;

    SELECT COALESCE(
        pg_catalog.jsonb_agg(r.id ORDER BY r.created_at),
        '[]'::jsonb
    )
    INTO v_refund_ids
    FROM public.payment_refunds r
    WHERE r.booking_operation_id = v_operation.id
      AND r.status = 'pending';

    RETURN pg_catalog.jsonb_build_object(
        'state', 'processing',
        'operation_id', v_operation.id,
        'operation_status', v_operation.status,
        'refund_ids', v_refund_ids
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
    v_operation_refunded integer;
    v_operation_pending integer;
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

    IF v_refund.status = 'failed' THEN
        RETURN 'terminal_refund_state';
    END IF;

    IF p_provider_refund_id IS NOT NULL
       AND pg_catalog.length(p_provider_refund_id) > 200
    THEN
        RAISE EXCEPTION 'Invalid provider refund ID';
    END IF;

    IF p_provider_status = 'pending' THEN
        UPDATE public.payment_refunds
        SET provider_refund_id = COALESCE(provider_refund_id, p_provider_refund_id),
            provider_response = p_provider_response,
            updated_at = pg_catalog.clock_timestamp()
        WHERE id = p_refund_id;

        RETURN 'pending';
    END IF;

    IF p_provider_status = 'canceled' THEN
        UPDATE public.payment_refunds
        SET status = 'cancelled',
            provider_refund_id = COALESCE(provider_refund_id, p_provider_refund_id),
            provider_response = p_provider_response,
            failure_reason = 'Provider canceled refund',
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

    UPDATE public.booking_payment_allocations
    SET refunded_amount_rub = refunded_amount_rub + v_refund.amount_rub
    WHERE booking_id = v_operation.booking_id
      AND payment_group_id = v_refund.payment_group_id
      AND refunded_amount_rub + v_refund.amount_rub <= amount_rub;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment allocation is missing or refund exceeds allocation';
    END IF;

    SELECT COALESCE(sum(r.amount_rub), 0)::integer
    INTO v_total_refunded
    FROM public.payment_refunds r
    WHERE r.payment_group_id = v_group.id
      AND r.status = 'succeeded';

    IF v_total_refunded >= v_group.amount_rub THEN
        UPDATE public.payment_groups
        SET status = 'refunded',
            updated_at = pg_catalog.clock_timestamp()
        WHERE id = v_group.id
          AND status = 'succeeded';
    END IF;

    SELECT
        COALESCE(sum(r.amount_rub) FILTER (WHERE r.status = 'succeeded'), 0)::integer,
        count(*) FILTER (WHERE r.status = 'pending')::integer
    INTO v_operation_refunded, v_operation_pending
    FROM public.payment_refunds r
    WHERE r.booking_operation_id = v_operation.id;

    IF v_operation_refunded >= v_operation.source_price_rub
       AND v_operation_pending = 0
    THEN
        IF v_booking.status <> 'confirmed'
           OR v_booking.payment_status <> 'succeeded'
        THEN
            RAISE EXCEPTION 'Booking state changed during cancellation refund';
        END IF;

        UPDATE public.bookings
        SET status = 'cancelled',
            payment_status = 'refunded',
            updated_at = pg_catalog.clock_timestamp()
        WHERE id = v_booking.id;

        UPDATE public.booking_operations
        SET status = 'completed',
            completed_at = pg_catalog.clock_timestamp(),
            updated_at = pg_catalog.clock_timestamp()
        WHERE id = v_operation.id;
    END IF;

    RETURN CASE
        WHEN v_operation_refunded >= v_operation.source_price_rub
             AND v_operation_pending = 0
        THEN 'completed'
        ELSE 'refund_recorded'
    END;
END;
$function$;

REVOKE ALL ON FUNCTION public.prepare_customer_booking_cancellation(uuid, uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_customer_booking_cancellation(uuid, uuid)
    TO service_role;

REVOKE ALL ON FUNCTION public.finalize_customer_booking_cancellation(uuid, text, text, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_customer_booking_cancellation(uuid, text, text, jsonb)
    TO service_role;

COMMENT ON COLUMN public.booking_payment_allocations.refunded_amount_rub IS
    'Amount already refunded from this payment allocation, in whole RUB.';
