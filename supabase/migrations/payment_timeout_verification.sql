-- 1. Verify that the scheduled timeout job exists and is active.
SELECT jobid, jobname, schedule, command, active, username
FROM cron.job
WHERE jobname = 'ponglab-expire-stale-yookassa-payments';

-- 2. Inspect recent executions. A successful run should have status = 'succeeded'.
SELECT start_time, end_time, status, return_message
FROM cron.job_run_details
WHERE jobid = (
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'ponglab-expire-stale-yookassa-payments'
)
ORDER BY start_time DESC
LIMIT 20;

-- 3. List late successful payments that require a customer conversation and refund.
SELECT
    pg.id AS payment_group_id,
    pg.provider_payment_id,
    pg.amount_rub,
    pg.currency,
    pg.failure_reason,
    pg.paid_at AS provider_success_detected_at,
    pg.updated_at AS late_success_detected_at,
    u.phone AS customer_phone,
    count(b.id)::integer AS booking_count,
    string_agg(
        to_char(b.start_at AT TIME ZONE COALESCE(s.timezone, 'Europe/Moscow'), 'DD.MM.YYYY HH24:MI'),
        ', '
        ORDER BY b.start_at
    ) AS booking_start_times
FROM public.payment_groups AS pg
JOIN public.users AS u
  ON u.id = pg.user_id
LEFT JOIN public.bookings AS b
  ON b.payment_group_id = pg.id
LEFT JOIN public.studio_tables AS st
  ON st.id = b.table_id
LEFT JOIN public.studios AS s
  ON s.id = st.studio_id
WHERE pg.status = 'cancelled'
  AND pg.failure_reason = 'payment_timeout_10m|late_success_refund_required'
GROUP BY pg.id, u.phone
ORDER BY pg.updated_at DESC;

-- 4. Current pending initialized payments and their individual deadlines.
SELECT
    pg.id AS payment_group_id,
    pg.provider_payment_id,
    pg.amount_rub,
    pg.status,
    pg.payment_init_started_at,
    COALESCE(MAX(sbs.hold_minutes), 10)::integer AS timeout_minutes,
    pg.payment_init_started_at
      + make_interval(mins => COALESCE(MAX(sbs.hold_minutes), 10)::integer) AS timeout_at
FROM public.payment_groups AS pg
LEFT JOIN public.bookings AS b
  ON b.payment_group_id = pg.id
LEFT JOIN public.studio_tables AS st
  ON st.id = b.table_id
LEFT JOIN public.studio_booking_settings AS sbs
  ON sbs.studio_id = st.studio_id
WHERE pg.provider = 'yookassa'
  AND pg.status = 'pending'
  AND pg.payment_init_started_at IS NOT NULL
GROUP BY pg.id
ORDER BY pg.payment_init_started_at;

-- 5. Only AFTER YooKassa confirms that the manual refund succeeded,
-- replace the UUID below with payment_group_id and execute this DO block.
-- It updates the existing rows only; it does not issue a refund itself.
DO $mark_refunded$
DECLARE
    v_payment_group_id uuid := '00000000-0000-0000-0000-000000000000';
    v_booking_rows integer;
BEGIN
    UPDATE public.payment_groups
    SET
        status = 'refunded',
        failure_reason = 'payment_timeout_10m|late_success_refunded',
        last_checked_at = pg_catalog.clock_timestamp(),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_payment_group_id
      AND status = 'cancelled'
      AND provider = 'yookassa'
      AND provider_payment_id IS NOT NULL
      AND paid_at IS NOT NULL
      AND failure_reason = 'payment_timeout_10m|late_success_refund_required';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Refund case was not found or is not ready to be marked refunded';
    END IF;

    UPDATE public.bookings
    SET
        payment_status = 'refunded',
        updated_at = pg_catalog.clock_timestamp()
    WHERE payment_group_id = v_payment_group_id
      AND status = 'expired'
      AND payment_status = 'cancelled';

    GET DIAGNOSTICS v_booking_rows = ROW_COUNT;

    IF v_booking_rows = 0 THEN
        RAISE EXCEPTION 'No expired booking rows were updated for the refund case';
    END IF;
END;
$mark_refunded$;
