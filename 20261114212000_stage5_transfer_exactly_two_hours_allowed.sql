-- Stage 5: allow customer self-service transfer at exactly 2 hours before start.
-- Preserve the installed function body, security attributes and grants; change
-- only the boundary comparison from <= 2 hours to < 2 hours.
DO $migration$
DECLARE
  v_function_definition text;
  v_old_condition constant text := 'IF v_booking.start_at <= v_now + interval ''2 hours'' THEN';
  v_new_condition constant text := 'IF v_booking.start_at < v_now + interval ''2 hours'' THEN';
  v_occurrences integer;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.prepare_customer_booking_transfer(uuid,uuid,uuid,timestamptz,text)'::pg_catalog.regprocedure
  ) INTO v_function_definition;

  IF v_function_definition IS NULL THEN
    RAISE EXCEPTION 'prepare_customer_booking_transfer function was not found';
  END IF;

  v_occurrences := (
    pg_catalog.length(v_function_definition)
    - pg_catalog.length(pg_catalog.replace(v_function_definition, v_old_condition, ''))
  ) / pg_catalog.length(v_old_condition);

  IF v_occurrences <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one 2-hour boundary condition; found %', v_occurrences;
  END IF;

  v_function_definition := pg_catalog.replace(v_function_definition, v_old_condition, v_new_condition);
  EXECUTE v_function_definition;
END;
$migration$;
