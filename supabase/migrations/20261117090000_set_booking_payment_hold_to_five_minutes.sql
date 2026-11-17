
DO $migration$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.studio_booking_settings
  SET hold_minutes = 5
  WHERE studio_id = '296652b7-1510-4391-8272-a3b7fb161503'
    AND hold_minutes = 10;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 AND NOT EXISTS (
    SELECT 1
    FROM public.studio_booking_settings
    WHERE studio_id = '296652b7-1510-4391-8272-a3b7fb161503'
      AND hold_minutes = 5
  ) THEN
    RAISE EXCEPTION 'Expected studio booking settings row was not updated';
  END IF;
END;
$migration$;
