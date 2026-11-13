-- PongLab: clean up expired legacy holds that predate payment groups.
-- Only records with no payment initialization and no provider payment ID
-- are eligible; unresolved payment attempts are intentionally left untouched.
UPDATE public.bookings
SET status = 'expired',
    updated_at = clock_timestamp()
WHERE status = 'pending_payment'
  AND payment_group_id IS NULL
  AND hold_expires_at IS NOT NULL
  AND hold_expires_at <= clock_timestamp()
  AND payment_init_started_at IS NULL
  AND payment_id IS NULL;
