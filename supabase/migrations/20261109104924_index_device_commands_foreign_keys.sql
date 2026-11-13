-- Add covering indexes for the two device_commands foreign keys
-- that previously had no matching index.
CREATE INDEX device_commands_booking_id_idx
  ON public.device_commands (booking_id);

CREATE INDEX device_commands_requested_by_idx
  ON public.device_commands (requested_by);
