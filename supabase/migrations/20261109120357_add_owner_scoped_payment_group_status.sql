CREATE OR REPLACE FUNCTION public.get_payment_group_status(
    p_payment_group_id uuid,
    p_user_id uuid
)
RETURNS TABLE (
    payment_group_id uuid,
    payment_status text,
    provider text,
    provider_payment_id text,
    amount_rub integer,
    currency text,
    hold_expires_at timestamptz,
    payment_init_started_at timestamptz,
    booking_count integer,
    pending_booking_count integer,
    confirmed_booking_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
    SELECT
        pg.id,
        pg.status,
        pg.provider,
        pg.provider_payment_id,
        pg.amount_rub,
        pg.currency,
        pg.hold_expires_at,
        pg.payment_init_started_at,
        count(b.id)::integer,
        count(b.id) FILTER (
            WHERE b.status = 'pending_payment'
              AND b.payment_status = 'pending'
        )::integer,
        count(b.id) FILTER (
            WHERE b.status = 'confirmed'
              AND b.payment_status = 'succeeded'
        )::integer
    FROM public.payment_groups AS pg
    LEFT JOIN public.bookings AS b
      ON b.payment_group_id = pg.id
    WHERE pg.id = p_payment_group_id
      AND pg.user_id = p_user_id
    GROUP BY pg.id;
$function$;

REVOKE ALL
ON FUNCTION public.get_payment_group_status(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
ON FUNCTION public.get_payment_group_status(uuid, uuid)
TO service_role;
