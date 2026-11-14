DO $migration$
DECLARE
  v_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.prepare_customer_booking_transfer(uuid,uuid,uuid,timestamptz,text)'::regprocedure
  )
  INTO v_definition;

  IF pg_catalog.strpos(
    v_definition,
    'IF v_booking.start_at <= v_now + interval ''2 hours'' THEN'
  ) = 0 THEN
    RAISE EXCEPTION 'Expected two-hour cutoff expression was not found';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    'IF v_booking.start_at <= v_now + interval ''2 hours'' THEN',
    'IF v_booking.start_at < v_now + interval ''2 hours'' THEN'
  );

  IF pg_catalog.strpos(
    v_definition,
    '  v_target_local_start := p_target_start_at AT TIME ZONE v_target.timezone;'
  ) = 0 THEN
    RAISE EXCEPTION 'Expected target timezone validation anchor was not found';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    '  v_target_local_start := p_target_start_at AT TIME ZONE v_target.timezone;',
    '  PERFORM public.lock_ponglab_studio(v_target.studio_id);' || E'\n\n' ||
    '  v_target_local_start := p_target_start_at AT TIME ZONE v_target.timezone;'
  );

  EXECUTE v_definition;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.enforce_booking_user_overlap_with_operation_holds()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_allowed_source_booking_id uuid;
  v_allowed_placeholder_booking_id uuid;
BEGIN
  IF NEW.status NOT IN ('pending_payment', 'confirmed') THEN
    RETURN NEW;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.user_id::text, 0)
  );

  IF NEW.booking_operation_id IS NOT NULL THEN
    SELECT bo.booking_id
    INTO v_allowed_source_booking_id
    FROM public.booking_operations bo
    WHERE bo.id = NEW.booking_operation_id
      AND bo.user_id = NEW.user_id
      AND bo.operation_type IN ('transfer', 'extension_offer', 'extension');

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Booking operation link is invalid';
    END IF;
  ELSE
    SELECT b.id
    INTO v_allowed_placeholder_booking_id
    FROM public.booking_operations bo
    JOIN public.bookings b
      ON b.booking_operation_id = bo.id
     AND b.status IN ('pending_payment', 'confirmed')
    WHERE bo.booking_id = NEW.id
      AND bo.user_id = NEW.user_id
      AND bo.operation_type = 'transfer'
      AND bo.target_table_id = NEW.table_id
      AND bo.target_start_at = NEW.start_at
      AND bo.target_end_at = NEW.end_at
      AND bo.status IN ('awaiting_payment', 'processing')
    LIMIT 1;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.user_id = NEW.user_id
      AND b.id <> NEW.id
      AND b.status IN ('pending_payment', 'confirmed')
      AND tstzrange(b.start_at, b.end_at, '[)')
          && tstzrange(NEW.start_at, NEW.end_at, '[)')
      AND b.id IS DISTINCT FROM v_allowed_source_booking_id
      AND b.id IS DISTINCT FROM v_allowed_placeholder_booking_id
  ) THEN
    RAISE EXCEPTION 'Customer already has an overlapping active booking or transfer hold';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_booking_user_overlap_with_operation_holds()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_booking_user_overlap_with_operation_holds()
  TO service_role;

DROP TRIGGER IF EXISTS bookings_user_overlap_operation_guard ON public.bookings;

CREATE TRIGGER bookings_user_overlap_operation_guard
BEFORE INSERT OR UPDATE OF user_id, table_id, start_at, end_at, status, booking_operation_id
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_booking_user_overlap_with_operation_holds();
