-- Stage 5: refund the price difference when transferring a booking
-- to a cheaper slot. The source booking remains active until all provider
-- refunds are confirmed. This migration is intentionally separate from the
-- customer cancellation workflow.

CREATE OR REPLACE FUNCTION public.prepare_customer_booking_transfer_refunds(
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
    v_placeholder public.bookings%ROWTYPE;
    v_allocation record;
    v_required integer;
    v_succeeded integer := 0;
    v_pending integer := 0;
    v_remaining integer := 0;
    v_pending_allocation integer := 0;
    v_reserved_group integer := 0;
    v_available_allocation integer := 0;
    v_available_group integer := 0;
    v_refund_amount integer := 0;
    v_refund_ids jsonb := '[]'::jsonb;
    v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
    IF p_operation_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'Invalid transfer refund parameters';
    END IF;

    SELECT *
    INTO v_operation
    FROM public.booking_operations
    WHERE id = p_operation_id
      AND user_id = p_user_id
      AND operation_type = 'transfer'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer operation not found';
    END IF;

    SELECT *
    INTO v_booking
    FROM public.bookings
    WHERE id = v_operation.booking_id
      AND user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source booking not found';
    END IF;

    IF v_operation.status = 'completed' THEN
        RETURN pg_catalog.jsonb_build_object(
            'state', 'completed',
            'operation_id', v_operation.id,
            'refund_ids', '[]'::jsonb
        );
    END IF;

    IF v_operation.status <> 'processing'
       OR v_operation.price_difference_rub IS NULL
       OR v_operation.price_difference_rub >= 0
       OR v_operation.source_price_rub IS NULL
       OR v_operation.target_price_rub IS NULL
    THEN
        RAISE EXCEPTION 'Transfer operation is not awaiting a source refund';
    END IF;

    v_required := v_operation.source_price_rub - v_operation.target_price_rub;

    IF v_required <= 0
       OR v_required <> -v_operation.price_difference_rub
    THEN
        RAISE EXCEPTION 'Transfer refund amount does not match operation snapshot';
    END IF;

    IF v_booking.status <> 'confirmed'
       OR v_booking.payment_status <> 'succeeded'
       OR v_booking.price_rub <> v_operation.source_price_rub
       OR v_booking.start_at <> v_operation.source_start_at
       OR v_booking.end_at <> v_operation.source_end_at
    THEN
        RAISE EXCEPTION 'Source booking changed after transfer preparation';
    END IF;

    IF v_operation.target_start_at IS NULL
       OR v_operation.target_end_at <> v_operation.target_start_at + interval '60 minutes'
       OR v_operation.target_start_at <= v_now
    THEN
        RAISE EXCEPTION 'Target transfer slot is no longer valid';
    END IF;

    SELECT *
    INTO v_placeholder
    FROM public.bookings
    WHERE booking_operation_id = v_operation.id
      AND table_id = v_operation.target_table_id
      AND start_at = v_operation.target_start_at
      AND end_at = v_operation.target_end_at
    FOR UPDATE;

    IF NOT FOUND
       OR v_placeholder.status <> 'pending_payment'
       OR v_placeholder.price_rub <> v_operation.target_price_rub
    THEN
        RAISE EXCEPTION 'Transfer target hold is missing or invalid';
    END IF;

    -- Compare gross allocation amounts with the original booking price.
    -- Net balances decrease as each partial provider refund succeeds, while
    -- the source booking deliberately remains unchanged until every refund
    -- belonging to this transfer has succeeded.
    SELECT
        COALESCE(sum(a.amount_rub), 0)::integer
    INTO v_available_allocation
    FROM public.booking_payment_allocations a
    WHERE a.booking_id = v_booking.id;

    IF v_available_allocation <> v_booking.price_rub THEN
        RAISE EXCEPTION 'Source payment allocation total does not match booking price';
    END IF;

    SELECT
        COALESCE(sum(r.amount_rub) FILTER (WHERE r.status = 'succeeded'), 0)::integer,
        COALESCE(sum(r.amount_rub) FILTER (WHERE r.status = 'pending'), 0)::integer
    INTO v_succeeded, v_pending
    FROM public.payment_refunds r
    WHERE r.booking_operation_id = v_operation.id;

    v_remaining := v_required - v_succeeded - v_pending;

    IF v_remaining < 0 THEN
        RAISE EXCEPTION 'Transfer refund reservations exceed required amount';
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
        WHERE a.booking_id = v_booking.id
          AND a.amount_rub > a.refunded_amount_rub
        ORDER BY a.created_at DESC, a.id
        FOR UPDATE OF a, pg
    LOOP
        EXIT WHEN v_remaining = 0;

        IF v_allocation.provider <> 'yookassa'
           OR v_allocation.provider_payment_id IS NULL
           OR v_allocation.group_status NOT IN ('succeeded', 'refunded')
        THEN
            RAISE EXCEPTION 'A source payment is not eligible for automatic YooKassa refund';
        END IF;

        SELECT COALESCE(sum(r.amount_rub), 0)::integer
        INTO v_pending_allocation
        FROM public.payment_refunds r
        JOIN public.booking_operations bo
          ON bo.id = r.booking_operation_id
        WHERE bo.booking_id = v_booking.id
          AND r.payment_group_id = v_allocation.payment_group_id
          AND r.status = 'pending';

        SELECT COALESCE(sum(r.amount_rub), 0)::integer
        INTO v_reserved_group
        FROM public.payment_refunds r
        WHERE r.payment_group_id = v_allocation.payment_group_id
          AND r.status IN ('pending', 'succeeded');

        v_available_allocation :=
            v_allocation.amount_rub
            - v_allocation.refunded_amount_rub
            - v_pending_allocation;

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
        RAISE EXCEPTION 'Insufficient refundable source payment balance';
    END IF;

    SELECT COALESCE(
        pg_catalog.jsonb_agg(r.id ORDER BY r.created_at, r.id),
        '[]'::jsonb
    )
    INTO v_refund_ids
    FROM public.payment_refunds r
    WHERE r.booking_operation_id = v_operation.id
      AND r.status = 'pending';

    UPDATE public.booking_operations
    SET metadata = metadata || pg_catalog.jsonb_build_object(
            'transfer_refund_required_rub', v_required,
            'transfer_refund_prepared_at', v_now
        ),
        updated_at = v_now
    WHERE id = v_operation.id;

    RETURN pg_catalog.jsonb_build_object(
        'state', 'processing',
        'operation_id', v_operation.id,
        'required_refund_rub', v_required,
        'succeeded_refund_rub', v_succeeded,
        'pending_refund_rub', v_pending,
        'refund_ids', v_refund_ids
    );
END;
$function$;


CREATE OR REPLACE FUNCTION public.finalize_customer_booking_transfer_refund(
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
    v_placeholder public.bookings%ROWTYPE;
    v_target_studio_id uuid;
    v_target_studio_active boolean;
    v_required integer;
    v_operation_refunded integer := 0;
    v_operation_pending integer := 0;
    v_group_refunded integer := 0;
    v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
    IF p_refund_id IS NULL
       OR p_provider_status IS NULL
       OR p_provider_status NOT IN ('pending', 'succeeded', 'canceled')
       OR p_provider_response IS NULL
       OR pg_catalog.jsonb_typeof(p_provider_response) <> 'object'
    THEN
        RAISE EXCEPTION 'Invalid transfer refund finalization parameters';
    END IF;

    IF p_provider_refund_id IS NOT NULL
       AND (
           pg_catalog.length(p_provider_refund_id) < 1
           OR pg_catalog.length(p_provider_refund_id) > 200
       )
    THEN
        RAISE EXCEPTION 'Invalid provider refund ID';
    END IF;

    SELECT *
    INTO v_refund
    FROM public.payment_refunds
    WHERE id = p_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer refund not found';
    END IF;

    SELECT *
    INTO v_operation
    FROM public.booking_operations
    WHERE id = v_refund.booking_operation_id
      AND operation_type = 'transfer'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer operation not found for refund';
    END IF;

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
        RETURN CASE
            WHEN v_operation.status = 'completed' THEN 'completed'
            ELSE 'refund_recorded'
        END;
    END IF;

    IF v_refund.status = 'failed' THEN
        RETURN 'terminal_refund_state';
    END IF;

    IF p_provider_status = 'pending' THEN
        UPDATE public.payment_refunds
        SET provider_refund_id = COALESCE(provider_refund_id, p_provider_refund_id),
            provider_response = p_provider_response,
            updated_at = v_now
        WHERE id = p_refund_id;

        RETURN 'pending';
    END IF;

    IF p_provider_status = 'canceled' THEN
        UPDATE public.payment_refunds
        SET status = 'cancelled',
            provider_refund_id = COALESCE(provider_refund_id, p_provider_refund_id),
            provider_response = p_provider_response,
            failure_reason = 'YooKassa canceled transfer refund',
            updated_at = v_now
        WHERE id = p_refund_id;

        RETURN 'retry_required';
    END IF;

    IF v_refund.status <> 'pending' THEN
        RAISE EXCEPTION 'Transfer refund is not in a finalizable state';
    END IF;

    UPDATE public.payment_refunds
    SET status = 'succeeded',
        provider_refund_id = COALESCE(provider_refund_id, p_provider_refund_id),
        provider_response = p_provider_response,
        succeeded_at = v_now,
        updated_at = v_now
    WHERE id = p_refund_id;

    UPDATE public.booking_payment_allocations
    SET refunded_amount_rub = refunded_amount_rub + v_refund.amount_rub
    WHERE booking_id = v_operation.booking_id
      AND payment_group_id = v_refund.payment_group_id
      AND refunded_amount_rub + v_refund.amount_rub <= amount_rub;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer refund allocation is missing or would exceed its source amount';
    END IF;

    SELECT COALESCE(sum(r.amount_rub), 0)::integer
    INTO v_group_refunded
    FROM public.payment_refunds r
    WHERE r.payment_group_id = v_group.id
      AND r.status = 'succeeded';

    IF v_group_refunded >= v_group.amount_rub THEN
        UPDATE public.payment_groups
        SET status = 'refunded',
            updated_at = v_now
        WHERE id = v_group.id
          AND status = 'succeeded';
    END IF;

    SELECT
        COALESCE(sum(r.amount_rub) FILTER (WHERE r.status = 'succeeded'), 0)::integer,
        count(*) FILTER (WHERE r.status = 'pending')::integer
    INTO v_operation_refunded, v_operation_pending
    FROM public.payment_refunds r
    WHERE r.booking_operation_id = v_operation.id;

    v_required := v_operation.source_price_rub - v_operation.target_price_rub;

    IF v_operation_refunded < v_required OR v_operation_pending > 0 THEN
        RETURN 'refund_recorded';
    END IF;

    IF v_operation.status <> 'processing' THEN
        RETURN 'terminal_operation_state';
    END IF;

    IF v_booking.status <> 'confirmed'
       OR v_booking.payment_status <> 'succeeded'
       OR v_booking.price_rub <> v_operation.source_price_rub
       OR v_booking.start_at <> v_operation.source_start_at
       OR v_booking.end_at <> v_operation.source_end_at
    THEN
        UPDATE public.booking_operations
        SET status = 'failed',
            metadata = metadata || pg_catalog.jsonb_build_object(
                'manual_resolution_required', true,
                'manual_resolution_reason', 'source_booking_changed_after_provider_refund',
                'refund_succeeded_rub', v_operation_refunded
            ),
            updated_at = v_now
        WHERE id = v_operation.id;

        RETURN 'manual_resolution_required';
    END IF;

    IF v_operation.target_start_at <= v_now THEN
        UPDATE public.booking_operations
        SET status = 'failed',
            metadata = metadata || pg_catalog.jsonb_build_object(
                'manual_resolution_required', true,
                'manual_resolution_reason', 'target_slot_started_before_refund_completion',
                'refund_succeeded_rub', v_operation_refunded
            ),
            updated_at = v_now
        WHERE id = v_operation.id;

        UPDATE public.bookings
        SET status = 'expired',
            payment_status = 'cancelled',
            updated_at = v_now
        WHERE booking_operation_id = v_operation.id
          AND status = 'pending_payment';

        RETURN 'manual_resolution_required';
    END IF;

    SELECT st.studio_id, s.is_active
    INTO v_target_studio_id, v_target_studio_active
    FROM public.studio_tables st
    JOIN public.studios s
      ON s.id = st.studio_id
    WHERE st.id = v_operation.target_table_id
    FOR UPDATE OF st, s;

    IF NOT FOUND OR v_target_studio_active IS NOT TRUE THEN
        UPDATE public.booking_operations
        SET status = 'failed',
            metadata = metadata || pg_catalog.jsonb_build_object(
                'manual_resolution_required', true,
                'manual_resolution_reason', 'target_studio_or_table_inactive_after_provider_refund',
                'refund_succeeded_rub', v_operation_refunded
            ),
            updated_at = v_now
        WHERE id = v_operation.id;

        RETURN 'manual_resolution_required';
    END IF;

    -- The studio row is already locked and confirmed active. This shared lock
    -- keeps this finalization serialized with other booking/transfer holds.
    PERFORM public.lock_ponglab_studio(v_target_studio_id);

    SELECT *
    INTO v_placeholder
    FROM public.bookings
    WHERE booking_operation_id = v_operation.id
      AND table_id = v_operation.target_table_id
      AND start_at = v_operation.target_start_at
      AND end_at = v_operation.target_end_at
    FOR UPDATE;

    IF NOT FOUND OR v_placeholder.status <> 'pending_payment' THEN
        UPDATE public.booking_operations
        SET status = 'failed',
            metadata = metadata || pg_catalog.jsonb_build_object(
                'manual_resolution_required', true,
                'manual_resolution_reason', 'target_hold_missing_after_provider_refund',
                'refund_succeeded_rub', v_operation_refunded
            ),
            updated_at = v_now
        WHERE id = v_operation.id;

        RETURN 'manual_resolution_required';
    END IF;

    -- Release the placeholder first. The source booking takes its target slot
    -- in the same transaction while the target studio lock is held.
    UPDATE public.bookings
    SET status = 'cancelled',
        payment_status = 'cancelled',
        hold_expires_at = NULL,
        updated_at = v_now
    WHERE id = v_placeholder.id;

    UPDATE public.bookings
    SET table_id = v_operation.target_table_id,
        start_at = v_operation.target_start_at,
        end_at = v_operation.target_end_at,
        price_rub = v_operation.target_price_rub,
        updated_at = v_now
    WHERE id = v_booking.id;

    UPDATE public.booking_operations
    SET status = 'completed',
        completed_at = v_now,
        metadata = metadata || pg_catalog.jsonb_build_object(
            'refund_succeeded_rub', v_operation_refunded,
            'transfer_completed_at', v_now
        ),
        updated_at = v_now
    WHERE id = v_operation.id;

    RETURN 'completed';
END;
$function$;


REVOKE ALL ON FUNCTION public.prepare_customer_booking_transfer_refunds(uuid, uuid)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.finalize_customer_booking_transfer_refund(uuid, text, text, jsonb)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_customer_booking_transfer_refunds(uuid, uuid)
TO service_role;

GRANT EXECUTE ON FUNCTION public.finalize_customer_booking_transfer_refund(uuid, text, text, jsonb)
TO service_role;
