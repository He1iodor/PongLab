
DO $migration$
DECLARE
  v_signature regprocedure;
  v_definition text;
  v_updated text;
  v_expected integer;
  v_replaced integer;
BEGIN
  FOR v_signature, v_expected IN
    SELECT *
    FROM (VALUES
      ('public.expire_stale_yookassa_payment_groups()'::regprocedure, 1),
      ('public.apply_payment_group_success(uuid,text,integer)'::regprocedure, 2),
      ('public.prepare_customer_booking_transfer_auto(uuid,uuid,uuid,timestamptz,text)'::regprocedure, 1)
    ) AS functions_to_update(signature, expected_replacements)
  LOOP
    v_definition := pg_catalog.pg_get_functiondef(v_signature::oid);

    v_replaced := pg_catalog.regexp_count(
      v_definition,
      ',[[:space:]]*10[[:space:]]*\)'
    );

    IF v_replaced <> v_expected THEN
      RAISE EXCEPTION
        'Unexpected 10-minute fallback count for %: expected %, found %',
        v_signature,
        v_expected,
        v_replaced;
    END IF;

    v_updated := pg_catalog.regexp_replace(
      v_definition,
      ',([[:space:]]*)10([[:space:]]*\))',
      ',\1 5\2',
      'g'
    );

    EXECUTE v_updated;
  END LOOP;
END;
$migration$;
