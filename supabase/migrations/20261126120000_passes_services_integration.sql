-- PongLab: pass and service integration foundation
-- Requires 20261126103000_passes_and_services_foundation.sql to be applied first.
-- Adds city timezone authority, explicit payment/funding types and atomic pass-hour ledger.

BEGIN;

ALTER TABLE public.cities ADD COLUMN timezone text;
UPDATE public.cities c
SET timezone = COALESCE((SELECT min(s.timezone) FROM public.studios s WHERE s.city_id = c.id), 'Europe/Moscow')
WHERE timezone IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.studios s
    WHERE s.city_id IS NOT NULL
    GROUP BY s.city_id
    HAVING count(DISTINCT s.timezone) > 1
  ) THEN
    RAISE EXCEPTION 'Studios in one city have different timezones; resolve before migration';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cities c
    WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = c.timezone)
  ) THEN
    RAISE EXCEPTION 'A city contains an invalid IANA timezone';
  END IF;
END;
$$;

ALTER TABLE public.cities
  ALTER COLUMN timezone SET DEFAULT 'Europe/Moscow',
  ALTER COLUMN timezone SET NOT NULL;
ALTER TABLE public.cities
  ADD CONSTRAINT cities_timezone_length_check CHECK (length(btrim(timezone)) BETWEEN 1 AND 64);

CREATE FUNCTION public.validate_city_timezone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = NEW.timezone) THEN
    RAISE EXCEPTION 'Invalid IANA city timezone';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cities_validate_timezone
BEFORE INSERT OR UPDATE OF timezone ON public.cities
FOR EACH ROW EXECUTE FUNCTION public.validate_city_timezone();

-- Existing booking functions still read studios.timezone. Keep it synchronized
-- with cities.timezone so the old cash-booking path remains unchanged.
CREATE FUNCTION public.sync_studio_timezone_from_city()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_timezone text;
BEGIN
  IF NEW.city_id IS NOT NULL THEN
    SELECT c.timezone INTO v_timezone FROM public.cities c WHERE c.id = NEW.city_id;
    IF v_timezone IS NULL THEN RAISE EXCEPTION 'Studio city or city timezone was not found'; END IF;
    NEW.timezone := v_timezone;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER studios_sync_timezone_from_city
BEFORE INSERT OR UPDATE OF city_id, timezone ON public.studios
FOR EACH ROW EXECUTE FUNCTION public.sync_studio_timezone_from_city();

CREATE FUNCTION public.sync_city_timezone_to_studios()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.timezone IS DISTINCT FROM OLD.timezone THEN
    UPDATE public.studios SET timezone = NEW.timezone
    WHERE city_id = NEW.id AND timezone IS DISTINCT FROM NEW.timezone;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cities_sync_timezone_to_studios
AFTER UPDATE OF timezone ON public.cities
FOR EACH ROW EXECUTE FUNCTION public.sync_city_timezone_to_studios();

ALTER TABLE public.payment_groups ADD COLUMN order_type text NOT NULL DEFAULT 'booking';
ALTER TABLE public.payment_groups
  ADD CONSTRAINT payment_groups_order_type_check
  CHECK (order_type IN ('booking', 'pass_purchase', 'booking_services', 'transfer_adjustment', 'extension_adjustment'));

ALTER TABLE public.bookings ADD COLUMN funding_method text NOT NULL DEFAULT 'cash';
ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_funding_method_check CHECK (funding_method IN ('cash', 'pass'));

ALTER TABLE public.user_passes
  ADD COLUMN timezone_snapshot text,
  ADD COLUMN purchase_local_date date;
UPDATE public.user_passes up
SET timezone_snapshot = c.timezone
FROM public.cities c
WHERE c.id = up.city_id AND up.timezone_snapshot IS NULL;
ALTER TABLE public.user_passes
  ADD CONSTRAINT user_passes_timezone_snapshot_check
  CHECK (timezone_snapshot IS NULL OR length(btrim(timezone_snapshot)) BETWEEN 1 AND 64);

ALTER TABLE public.pass_transactions
  ADD COLUMN related_transaction_id uuid REFERENCES public.pass_transactions(id) ON DELETE RESTRICT;
ALTER TABLE public.pass_transactions
  ADD CONSTRAINT pass_transactions_related_type_check
  CHECK (
    (transaction_type IN ('release', 'consume', 'restore') AND related_transaction_id IS NOT NULL)
    OR (transaction_type NOT IN ('release', 'consume', 'restore') AND related_transaction_id IS NULL)
  );
CREATE UNIQUE INDEX pass_transactions_reserve_once
  ON public.pass_transactions(user_pass_id, booking_id) WHERE transaction_type = 'reserve';
CREATE UNIQUE INDEX pass_transactions_reserve_terminal_once
  ON public.pass_transactions(related_transaction_id) WHERE transaction_type IN ('release', 'consume');
CREATE UNIQUE INDEX pass_transactions_restore_once
  ON public.pass_transactions(related_transaction_id) WHERE transaction_type = 'restore';
CREATE UNIQUE INDEX pass_transactions_purchase_once
  ON public.pass_transactions(user_pass_id) WHERE transaction_type = 'purchase_credit';
CREATE UNIQUE INDEX pass_transactions_expiration_once
  ON public.pass_transactions(user_pass_id) WHERE transaction_type = 'expiration';

ALTER TABLE public.booking_operations DROP CONSTRAINT booking_operations_operation_type_check;
ALTER TABLE public.booking_operations
  ADD CONSTRAINT booking_operations_operation_type_check
  CHECK (operation_type IN (
    'cancellation', 'transfer', 'transfer_request', 'extension',
    'extension_offer', 'force_majeure', 'late_payment_refund', 'service_refund'
  ));

CREATE FUNCTION public.expire_user_pass_balance(p_user_pass_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pass public.user_passes%ROWTYPE; v_remaining integer; v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_pass FROM public.user_passes WHERE id = p_user_pass_id FOR UPDATE;
  IF NOT FOUND OR v_pass.expires_at IS NULL OR v_pass.expires_at > v_now OR v_pass.reserved_hours <> 0 THEN RETURN; END IF;
  v_remaining := v_pass.remaining_hours;
  UPDATE public.user_passes SET remaining_hours = 0, status = 'expired', updated_at = v_now
  WHERE id = v_pass.id AND reserved_hours = 0;
  IF v_remaining > 0 THEN
    INSERT INTO public.pass_transactions(user_pass_id, transaction_type, remaining_delta, reserved_delta, idempotency_key, description)
    VALUES (v_pass.id, 'expiration', -v_remaining, 0, 'pass-expiration:' || v_pass.id::text, 'Expire unused pass hours');
  END IF;
END;
$$;

CREATE FUNCTION public.expire_due_user_passes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_pass_id uuid; v_count integer := 0;
BEGIN
  FOR v_pass_id IN
    SELECT id FROM public.user_passes
    WHERE expires_at <= pg_catalog.clock_timestamp()
      AND reserved_hours = 0
      AND (status <> 'expired' OR remaining_hours > 0)
    ORDER BY expires_at, id
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.expire_user_pass_balance(v_pass_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Allocation transitions update the balance and append the ledger in the same transaction.
CREATE FUNCTION public.apply_booking_pass_allocation_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_pass public.user_passes%ROWTYPE;
  v_reserve_transaction_id uuid;
  v_consume_transaction_id uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pass allocation booking was not found'; END IF;
  SELECT * INTO v_pass FROM public.user_passes WHERE id = NEW.user_pass_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pass allocation pass was not found'; END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_booking.user_id <> v_pass.user_id
       OR v_pass.city_id IS DISTINCT FROM (
         SELECT s.city_id FROM public.studio_tables st
         JOIN public.studios s ON s.id = st.studio_id WHERE st.id = v_booking.table_id
       ) THEN
      RAISE EXCEPTION 'Pass owner or city does not match the booking';
    END IF;
    IF v_booking.funding_method <> 'pass' THEN RAISE EXCEPTION 'Booking is not configured for pass funding'; END IF;
    IF v_pass.status <> 'active' OR v_pass.starts_at IS NULL OR v_pass.expires_at IS NULL
       OR v_pass.starts_at > v_booking.start_at OR v_booking.start_at >= v_pass.expires_at
       OR v_pass.expires_at <= v_now THEN
      RAISE EXCEPTION 'Pass is not valid for the selected booking slot';
    END IF;
    IF v_pass.remaining_hours < 1 THEN RAISE EXCEPTION 'Pass has no available hours'; END IF;

    UPDATE public.user_passes
    SET remaining_hours = remaining_hours - 1,
        reserved_hours = reserved_hours + 1,
        updated_at = v_now
    WHERE id = v_pass.id AND status = 'active' AND remaining_hours > 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pass balance changed before reservation'; END IF;

    INSERT INTO public.pass_transactions(
      user_pass_id, booking_id, transaction_type, remaining_delta,
      reserved_delta, idempotency_key, description
    ) VALUES (
      v_pass.id, NEW.booking_id, 'reserve', -1, 1,
      'pass-allocation:' || NEW.id::text || ':reserve', 'Reserve one pass hour for booking'
    );
    RETURN NULL;
  END IF;

  IF OLD.status = NEW.status THEN RETURN NULL; END IF;
  SELECT id INTO v_reserve_transaction_id
  FROM public.pass_transactions
  WHERE user_pass_id = v_pass.id AND booking_id = NEW.booking_id AND transaction_type = 'reserve';
  IF v_reserve_transaction_id IS NULL THEN RAISE EXCEPTION 'Pass reservation ledger entry is missing'; END IF;

  IF OLD.status = 'reserved' AND NEW.status = 'consumed' THEN
    IF v_booking.status <> 'confirmed' OR v_booking.payment_status <> 'succeeded' THEN
      RAISE EXCEPTION 'Pass hour can be consumed only for a confirmed booking';
    END IF;
    UPDATE public.user_passes
    SET reserved_hours = reserved_hours - 1,
        status = CASE WHEN remaining_hours = 0 AND reserved_hours = 1 THEN 'exhausted' ELSE status END,
        updated_at = v_now
    WHERE id = v_pass.id AND reserved_hours > 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pass reserved balance is inconsistent'; END IF;
    INSERT INTO public.pass_transactions(
      user_pass_id, booking_id, transaction_type, remaining_delta, reserved_delta,
      idempotency_key, related_transaction_id, description
    ) VALUES (
      v_pass.id, NEW.booking_id, 'consume', 0, -1,
      'pass-allocation:' || NEW.id::text || ':consume', v_reserve_transaction_id, 'Consume reserved pass hour'
    );

  ELSIF OLD.status = 'reserved' AND NEW.status = 'released' THEN
    IF v_booking.status NOT IN ('cancelled', 'expired') THEN
      RAISE EXCEPTION 'Reserved pass hour can be released only after booking cancellation or expiry';
    END IF;
    UPDATE public.user_passes
    SET remaining_hours = remaining_hours + 1,
        reserved_hours = reserved_hours - 1,
        updated_at = v_now
    WHERE id = v_pass.id AND reserved_hours > 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pass reserved balance is inconsistent'; END IF;
    INSERT INTO public.pass_transactions(
      user_pass_id, booking_id, transaction_type, remaining_delta, reserved_delta,
      idempotency_key, related_transaction_id, description
    ) VALUES (
      v_pass.id, NEW.booking_id, 'release', 1, -1,
      'pass-allocation:' || NEW.id::text || ':release', v_reserve_transaction_id,
      'Release pass hour after unpaid booking cancellation'
    );
    PERFORM public.expire_user_pass_balance(v_pass.id);

  ELSIF OLD.status = 'consumed' AND NEW.status = 'restored' THEN
    IF v_booking.status <> 'cancelled' OR v_booking.start_at <= v_now + interval '24 hours' THEN
      RAISE EXCEPTION 'Consumed pass hour can be restored only when cancellation is more than 24 hours before the booking';
    END IF;
    SELECT id INTO v_consume_transaction_id
    FROM public.pass_transactions
    WHERE user_pass_id = v_pass.id AND booking_id = NEW.booking_id AND transaction_type = 'consume';
    IF v_consume_transaction_id IS NULL THEN RAISE EXCEPTION 'Pass consumption ledger entry is missing'; END IF;
    UPDATE public.user_passes
    SET remaining_hours = remaining_hours + 1,
        status = CASE WHEN expires_at <= v_now THEN 'expired' ELSE 'active' END,
        updated_at = v_now
    WHERE id = v_pass.id AND remaining_hours + reserved_hours < total_hours;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pass balance cannot be restored'; END IF;
    INSERT INTO public.pass_transactions(
      user_pass_id, booking_id, transaction_type, remaining_delta, reserved_delta,
      idempotency_key, related_transaction_id, description
    ) VALUES (
      v_pass.id, NEW.booking_id, 'restore', 1, 0,
      'pass-allocation:' || NEW.id::text || ':restore', v_consume_transaction_id,
      'Restore pass hour after timely cancellation'
    );
    PERFORM public.expire_user_pass_balance(v_pass.id);
  ELSE
    RAISE EXCEPTION 'Unsupported pass allocation transition';
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER booking_pass_allocations_apply_ledger
AFTER INSERT OR UPDATE OF status ON public.booking_pass_allocations
FOR EACH ROW EXECUTE FUNCTION public.apply_booking_pass_allocation_ledger();

-- Direct admin cancellation, payment failure and timeout transitions are covered too.
CREATE FUNCTION public.sync_booking_pass_allocation_from_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_allocation public.booking_pass_allocations%ROWTYPE;
BEGIN
  SELECT * INTO v_allocation
  FROM public.booking_pass_allocations WHERE booking_id = NEW.id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;

  IF NEW.status = 'confirmed' AND NEW.payment_status = 'succeeded'
     AND v_allocation.status = 'reserved' THEN
    UPDATE public.booking_pass_allocations
    SET status = 'consumed', consumed_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_allocation.id;
  ELSIF NEW.status IN ('cancelled', 'expired') AND v_allocation.status = 'reserved' THEN
    UPDATE public.booking_pass_allocations
    SET status = 'released', released_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_allocation.id;
  ELSIF NEW.status = 'cancelled' AND v_allocation.status = 'consumed'
        AND NEW.start_at > pg_catalog.clock_timestamp() + interval '24 hours' THEN
    UPDATE public.booking_pass_allocations
    SET status = 'restored', restored_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_allocation.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bookings_sync_pass_allocation
AFTER UPDATE OF status, payment_status ON public.bookings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.payment_status IS DISTINCT FROM NEW.payment_status)
EXECUTE FUNCTION public.sync_booking_pass_allocation_from_booking();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ponglab-expire-user-passes') THEN
    PERFORM cron.schedule(
      'ponglab-expire-user-passes',
      '10 seconds',
      'SELECT public.expire_due_user_passes();'
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_city_timezone() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_studio_timezone_from_city() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_city_timezone_to_studios() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_user_pass_balance(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_due_user_passes() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_booking_pass_allocation_ledger() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_booking_pass_allocation_from_booking() FROM PUBLIC, anon, authenticated, service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.pass_transactions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.pass_transactions TO service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.booking_pass_allocations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.booking_pass_allocations TO service_role;

COMMIT;
