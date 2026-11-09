-- PongLab: align server-side booking rules with the calendar UI.
-- A customer cannot hold or confirm two overlapping bookings,
-- even when the bookings refer to different tables or studios.
-- Adjacent bookings are allowed because the time range is half-open [start, end).
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_user_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (status IN ('pending_payment', 'confirmed'));
