
ALTER TABLE public.bookings
  ADD COLUMN booking_operation_id uuid NULL;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_booking_operation_id_fkey
  FOREIGN KEY (booking_operation_id)
  REFERENCES public.booking_operations(id)
  ON DELETE RESTRICT;

CREATE UNIQUE INDEX bookings_booking_operation_id_unique
  ON public.bookings (booking_operation_id)
  WHERE booking_operation_id IS NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT bookings_user_no_overlap;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_user_no_overlap
  EXCLUDE USING gist (
    user_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  )
  WHERE (
    status IN ('pending_payment', 'confirmed')
    AND booking_operation_id IS NULL
  );

CREATE INDEX bookings_booking_operation_status_idx
  ON public.bookings (booking_operation_id, status)
  WHERE booking_operation_id IS NOT NULL;
