
-- Stage 5: automatic table assignment and one-time customer transfer.
-- Adds a new RPC and deliberately leaves the legacy RPC intact.
-- Apply only after this corrected file is committed to the feature branch.

DO $migration$
DECLARE
  v_definition text;
  v_old_target_block text;
  v_new_target_block text;
  v_old_date_rule text;
  v_old_transfer_guard text;
  v_new_transfer_guard text;
  v_old_purchase_anchor text;
  v_new_purchase_anchor text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.prepare_customer_booking_transfer(uuid,uuid,uuid,timestamptz,text)'::regprocedure
  )
  INTO v_definition;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Existing customer transfer RPC was not found';
  END IF;

  v_old_purchase_anchor := '  v_booking public.bookings%ROWTYPE;';
  v_new_purchase_anchor := v_old_purchase_anchor || E'\n  v_purchase_at timestamptz;';

  IF pg_catalog.strpos(v_definition, v_old_purchase_anchor) = 0 THEN
    RAISE EXCEPTION 'Could not add purchase timestamp variable';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old_purchase_anchor, v_new_purchase_anchor);

  v_old_target_block :=
    '  SELECT' || E'\n' ||
    '    st.id AS table_id,' || E'\n' ||
    '    st.studio_id,' || E'\n' ||
    '    st.is_active AS table_is_active,' || E'\n' ||
    '    s.name AS studio_name,' || E'\n' ||
    '    s.timezone,' || E'\n' ||
    '    s.is_active AS studio_is_active' || E'\n' ||
    '  INTO v_target' || E'\n' ||
    '  FROM public.studio_tables st' || E'\n' ||
    '  JOIN public.studios s ON s.id = st.studio_id' || E'\n' ||
    '  WHERE st.id = p_target_table_id;';

  v_new_target_block :=
    '  -- Serialize all reservations in the target studio before selecting a table.' || E'\n' ||
    '  PERFORM public.lock_ponglab_studio(p_target_studio_id);' || E'\n\n' ||
    '  SELECT' || E'\n' ||
    '    st.id AS table_id,' || E'\n' ||
    '    st.studio_id,' || E'\n' ||
    '    st.is_active AS table_is_active,' || E'\n' ||
    '    s.name AS studio_name,' || E'\n' ||
    '    s.timezone,' || E'\n' ||
    '    s.is_active AS studio_is_active' || E'\n' ||
    '  INTO v_target' || E'\n' ||
    '  FROM public.studio_tables st' || E'\n' ||
    '  JOIN public.studios s ON s.id = st.studio_id' || E'\n' ||
    '  WHERE st.studio_id = p_target_studio_id' || E'\n' ||
    '    AND st.is_active' || E'\n' ||
    '    AND s.is_active' || E'\n' ||
    '    AND NOT EXISTS (' || E'\n' ||
    '      SELECT 1' || E'\n' ||
    '      FROM public.bookings b' || E'\n' ||
    '      WHERE b.table_id = st.id' || E'\n' ||
    '        AND b.id <> p_booking_id' || E'\n' ||
    '        AND b.status IN (''pending_payment'', ''confirmed'')' || E'\n' ||
    '        AND tstzrange(b.start_at, b.end_at, ''[)'')' || E'\n' ||
    '            && tstzrange(p_target_start_at, p_target_start_at + interval ''60 minutes'', ''[)'')' || E'\n' ||
    '    )' || E'\n' ||
    '  ORDER BY st.name, st.id' || E'\n' ||
    '  LIMIT 1' || E'\n' ||
    '  FOR UPDATE OF st;';

  IF pg_catalog.strpos(v_definition, v_old_target_block) = 0 THEN
    RAISE EXCEPTION 'Could not locate the expected target-table selection block; no changes made';
  END IF;

  v_definition := pg_catalog.replace(v_definition, v_old_target_block, v_new_target_block);

  v_old_purchase_anchor := $old_booking$  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;$old_booking$;
  v_new_purchase_anchor := $new_booking$  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  SELECT pg.paid_at
  INTO v_purchase_at
  FROM public.payment_groups pg
  WHERE pg.id = v_booking.payment_group_id;

  v_purchase_at := COALESCE(v_purchase_at, v_booking.created_at);$new_booking$;
  IF pg_catalog.strpos(v_definition, v_old_purchase_anchor) = 0 THEN
    RAISE EXCEPTION 'Could not locate booking ownership check for purchase timestamp';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old_purchase_anchor, v_new_purchase_anchor);

  -- The new RPC accepts a studio ID. The legacy RPC remains unchanged.
  v_definition := pg_catalog.replace(
    v_definition,
    'FUNCTION public.prepare_customer_booking_transfer(',
    'FUNCTION public.prepare_customer_booking_transfer_auto('
  );
  v_definition := pg_catalog.replace(v_definition, 'p_target_table_id', 'p_target_studio_id');

  -- Persist the server-selected table ID everywhere the old function used
  -- the caller-supplied table ID. Never write a studio ID into table_id fields.
  v_definition := pg_catalog.replace(
    v_definition,
    'WHERE b.table_id = p_target_studio_id',
    'WHERE b.table_id = v_target.table_id'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'IF v_booking.table_id = p_target_studio_id',
    'IF v_booking.table_id = v_target.table_id'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'v_booking.start_at, v_booking.end_at, p_target_studio_id,',
    'v_booking.start_at, v_booking.end_at, v_target.table_id,'
  );
  v_definition := pg_catalog.replace(
    v_definition,
    'p_user_id, p_target_studio_id, p_target_start_at,',
    'p_user_id, v_target.table_id, p_target_start_at,'
  );

  -- Idempotent retries compare the studio of the already-reserved table.
  v_definition := pg_catalog.replace(
    v_definition,
    '       OR v_existing_operation.target_table_id <> p_target_studio_id',
    '       OR NOT EXISTS (' || E'\n' ||
    '         SELECT 1 FROM public.studio_tables existing_table' || E'\n' ||
    '         WHERE existing_table.id = v_existing_operation.target_table_id' || E'\n' ||
    '           AND existing_table.studio_id = p_target_studio_id' || E'\n' ||
    '       )'
  );

  -- A completed transfer consumes the one permitted transfer.
  v_old_transfer_guard :=
    '      AND bo.status IN (''requested'', ''offered'', ''awaiting_payment'', ''processing'')';
  v_new_transfer_guard :=
    '      AND bo.status IN (''requested'', ''offered'', ''awaiting_payment'', ''processing'', ''completed'')';

  IF pg_catalog.strpos(v_definition, v_old_transfer_guard) = 0 THEN
    RAISE EXCEPTION 'Could not locate the expected one-transfer guard; no changes made';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old_transfer_guard, v_new_transfer_guard);

  -- Transfer is allowed to any eligible date within 30 days of purchase.
  v_old_date_rule :=
    '  IF v_booking.start_at <= v_now + interval ''24 hours''' || E'\n' ||
    '     AND (p_target_start_at AT TIME ZONE v_source_studio.timezone)::date' || E'\n' ||
    '         <> (v_booking.start_at AT TIME ZONE v_source_studio.timezone)::date' || E'\n' ||
    '  THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Within 24 hours, transfer is limited to the source studio calendar day'';' || E'\n' ||
    '  END IF;';

  IF pg_catalog.strpos(v_definition, v_old_date_rule) = 0 THEN
    RAISE EXCEPTION 'Could not locate the old 24-hour same-day transfer restriction; no changes made';
  END IF;
  v_definition := pg_catalog.replace(v_definition, v_old_date_rule, '');

  -- Use the actual payment timestamp; booking.created_at is only a fallback
  -- for legacy bookings without a recorded paid_at value.
  v_definition := pg_catalog.replace(
    v_definition,
    '     OR p_target_start_at < v_now' || E'\n' ||
    '          + pg_catalog.make_interval(mins => v_target_settings.minimum_notice_minutes)',
    '     OR p_target_start_at > v_purchase_at + interval ''30 days''' || E'\n' ||
    '     OR p_target_start_at < v_now' || E'\n' ||
    '          + pg_catalog.make_interval(mins => v_target_settings.minimum_notice_minutes)'
  );

  IF pg_catalog.strpos(v_definition, 'p_target_start_at > v_purchase_at + interval ''30 days''') = 0 THEN
    RAISE EXCEPTION 'Could not add the purchase-relative 30-day transfer limit';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    'RAISE EXCEPTION ''Target table or studio is inactive or missing'';',
    'RAISE EXCEPTION ''No available table in the selected studio for this slot'';'
  );

  -- Fail closed if any table-ID use was accidentally left pointing at the studio ID.
  IF pg_catalog.strpos(v_definition, 'b.table_id = p_target_studio_id') > 0
     OR pg_catalog.strpos(v_definition, 'v_booking.table_id = p_target_studio_id') > 0
     OR pg_catalog.strpos(v_definition, 'v_booking.start_at, v_booking.end_at, p_target_studio_id') > 0
     OR pg_catalog.strpos(v_definition, 'p_user_id, p_target_studio_id, p_target_start_at') > 0
  THEN
    RAISE EXCEPTION 'Unsafe studio/table ID substitution detected; no changes made';
  END IF;

  EXECUTE v_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.prepare_customer_booking_transfer_auto(uuid, uuid, uuid, timestamptz, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_customer_booking_transfer_auto(uuid, uuid, uuid, timestamptz, text)
  TO service_role;
