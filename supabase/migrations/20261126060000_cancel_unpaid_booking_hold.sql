
BEGIN;

CREATE OR REPLACE FUNCTION public.cancel_unpaid_booking_hold(
    p_booking_id uuid,
    p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_group_id uuid;
    v_group public.payment_groups%ROWTYPE;
    v_booking public.bookings%ROWTYPE;
    v_now timestamptz;
BEGIN
    IF p_booking_id IS NULL OR p_user_id IS NULL THEN
        RAISE EXCEPTION 'Booking and user are required';
    END IF;

    SELECT b.payment_group_id
    INTO v_group_id
    FROM public.bookings AS b
    WHERE b.id = p_booking_id
      AND b.user_id = p_user_id
      AND b.booking_operation_id IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking not found';
    END IF;

    IF v_group_id IS NULL THEN
        RETURN pg_catalog.jsonb_build_object('state', 'not_applicable');
    END IF;

    SELECT *
    INTO v_group
    FROM public.payment_groups AS pg
    WHERE pg.id = v_group_id
      AND pg.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment group not found';
    END IF;

    PERFORM b.id
    FROM public.bookings AS b
    WHERE b.payment_group_id = v_group_id
    ORDER BY b.id
    FOR UPDATE;

    SELECT *
    INTO v_booking
    FROM public.bookings AS b
    WHERE b.id = p_booking_id
      AND b.user_id = p_user_id
      AND b.payment_group_id = v_group_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Booking does not belong to payment group';
    END IF;

    v_now := pg_catalog.clock_timestamp();

    IF v_group.status = 'cancelled' THEN
        IF v_group.failure_reason = 'customer_cancelled_unpaid_hold' THEN
            RETURN pg_catalog.jsonb_build_object('state', 'already_cancelled');
        END IF;

        IF v_group.failure_reason = 'hold_expired_before_payment_initialization' THEN
            RETURN pg_catalog.jsonb_build_object('state', 'expired');
        END IF;

        RETURN pg_catalog.jsonb_build_object('state', 'not_applicable');
    END IF;

    IF v_group.status <> 'pending' THEN
        RETURN pg_catalog.jsonb_build_object('state', 'not_applicable');
    END IF;

    IF v_group.payment_init_started_at IS NOT NULL
       OR v_group.provider_payment_id IS NOT NULL
    THEN
        RETURN pg_catalog.jsonb_build_object('state', 'payment_in_progress');
    END IF;

    IF v_group.hold_expires_at IS NULL
       OR v_group.hold_expires_at <= v_now
    THEN
        UPDATE public.payment_groups
        SET
            status = 'cancelled',
            failure_reason = COALESCE(
                failure_reason,
                'hold_expired_before_payment_initialization'
            ),
            updated_at = v_now
        WHERE id = v_group_id
          AND status = 'pending'
          AND payment_init_started_at IS NULL
          AND provider_payment_id IS NULL;

        UPDATE public.bookings
        SET
            status = 'expired',
            updated_at = v_now
        WHERE payment_group_id = v_group_id
          AND status = 'pending_payment'
          AND payment_status = 'pending'
          AND payment_init_started_at IS NULL
          AND payment_id IS NULL;

        RETURN pg_catalog.jsonb_build_object('state', 'expired');
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.bookings AS b
        WHERE b.payment_group_id = v_group_id
          AND (
              b.user_id <> p_user_id
              OR b.booking_operation_id IS NOT NULL
              OR b.status <> 'pending_payment'
              OR b.payment_status <> 'pending'
              OR b.payment_init_started_at IS NOT NULL
              OR b.payment_id IS NOT NULL
          )
    ) THEN
        RETURN pg_catalog.jsonb_build_object('state', 'payment_in_progress');
    END IF;

    UPDATE public.payment_groups
    SET
        status = 'cancelled',
        failure_reason = 'customer_cancelled_unpaid_hold',
        updated_at = v_now
    WHERE id = v_group_id
      AND status = 'pending'
      AND payment_init_started_at IS NULL
      AND provider_payment_id IS NULL;

    UPDATE public.bookings
    SET
        status = 'cancelled',
        updated_at = v_now
    WHERE payment_group_id = v_group_id
      AND user_id = p_user_id
      AND status = 'pending_payment'
      AND payment_status = 'pending'
      AND payment_init_started_at IS NULL
      AND payment_id IS NULL;

    RETURN pg_catalog.jsonb_build_object('state', 'cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_unpaid_booking_hold(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_unpaid_booking_hold(uuid, uuid)
TO service_role;

COMMIT;
