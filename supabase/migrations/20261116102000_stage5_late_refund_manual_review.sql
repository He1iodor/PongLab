-- PongLab Stage 5: persist manual-review state for late YooKassa refunds.
-- This migration does not issue or retry any provider refund.

CREATE OR REPLACE FUNCTION public.mark_late_payment_refund_review(
    p_refund_id uuid,
    p_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_refund public.payment_refunds%ROWTYPE;
    v_group public.payment_groups%ROWTYPE;
    v_operation public.booking_operations%ROWTYPE;
    v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
    IF p_refund_id IS NULL
       OR p_reason IS NULL
       OR p_reason NOT IN (
           'provider_refund_ambiguous',
           'idempotency_window_expired_without_provider_refund'
       )
    THEN
        RAISE EXCEPTION 'Invalid late payment refund review parameters';
    END IF;

    -- Lock order matches the existing late-refund workflow:
    -- payment group -> operation -> refund.
    SELECT * INTO v_refund
    FROM public.payment_refunds
    WHERE id = p_refund_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Late payment refund not found';
    END IF;

    SELECT * INTO v_group
    FROM public.payment_groups
    WHERE id = v_refund.payment_group_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Late payment group not found';
    END IF;

    SELECT * INTO v_operation
    FROM public.booking_operations
    WHERE id = v_refund.booking_operation_id
      AND operation_type = 'late_payment_refund'
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Late payment refund operation not found';
    END IF;

    SELECT * INTO v_refund
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
    THEN
        RAISE EXCEPTION 'Late payment refund does not match its payment group';
    END IF;

    IF v_refund.status = 'succeeded'
       OR v_operation.status = 'completed'
       OR v_group.status = 'refunded'
    THEN
        RETURN 'refunded';
    END IF;

    IF v_refund.status NOT IN ('pending', 'failed', 'cancelled') THEN
        RAISE EXCEPTION 'Late payment refund has an unsupported local status';
    END IF;

    IF v_operation.metadata->>'manual_resolution_required' = 'true' THEN
        RETURN 'review_required';
    END IF;

    UPDATE public.booking_operations
    SET status = 'failed',
        metadata = coalesce(metadata, '{}'::jsonb) ||
            pg_catalog.jsonb_build_object(
                'manual_resolution_required', true,
                'manual_resolution_reason', p_reason,
                'manual_resolution_at', v_now
            ),
        updated_at = v_now
    WHERE id = v_operation.id
      AND status IN ('processing', 'failed');

    IF NOT FOUND THEN
        -- Do not overwrite a concurrent terminal transition.
        RETURN CASE
            WHEN v_operation.status = 'completed' THEN 'refunded'
            ELSE 'review_required'
        END;
    END IF;

    -- Keep the refund row pending: it remains an unresolved financial item.
    UPDATE public.payment_refunds
    SET failure_reason = 'manual_review:' || p_reason,
        updated_at = v_now
    WHERE id = p_refund_id
      AND status = 'pending';

    RETURN 'review_required';
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_late_payment_refund_review(uuid, text)
    FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.mark_late_payment_refund_review(uuid, text)
    TO service_role;
