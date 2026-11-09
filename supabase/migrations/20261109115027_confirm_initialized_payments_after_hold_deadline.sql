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

    -- Repeated notification for a payment already applied.
    IF v_group.status = 'succeeded' THEN
        RETURN 'already_processed';
    END IF;

    IF v_group.status <> 'pending' THEN
        RETURN 'terminal_state_conflict';
    END IF;

    -- A payment may be confirmed only after its initialization was
    -- atomically started while the booking hold was still valid.
    IF v_group.payment_init_started_at IS NULL THEN
        RETURN 'payment_not_initialized';
    END IF;

    -- Payment initialization keeps the booking group locked even after
    -- hold_expires_at. This avoids releasing the slot while the provider
    -- is still processing a payment that began within the original hold.
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
        paid_at = clock_timestamp(),
        last_checked_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE id = p_payment_group_id;

    UPDATE public.bookings
    SET
        status = 'confirmed',
        payment_status = 'succeeded',
        updated_at = clock_timestamp()
    WHERE payment_group_id = p_payment_group_id;

    RETURN 'confirmed';
END;
$function$;
