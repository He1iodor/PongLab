
BEGIN;

-- =========================================================
-- 1. OWNER TARIFF TEMPLATES
-- One tariff belongs to one city.
-- =========================================================

CREATE TABLE public.pass_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    description text,
    price_rub integer NOT NULL CHECK (price_rub > 0),
    hours_count integer NOT NULL CHECK (hours_count > 0),
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX pass_plans_city_active_idx
    ON public.pass_plans(city_id, is_active);


-- =========================================================
-- 2. PURCHASED USER PASSES
-- Snapshot preserves tariff conditions at purchase time.
-- Validity starts only after confirmed payment.
-- =========================================================

CREATE TABLE public.user_passes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    plan_id uuid REFERENCES public.pass_plans(id) ON DELETE SET NULL,
    city_id uuid NOT NULL REFERENCES public.cities(id) ON DELETE RESTRICT,

    purchase_payment_group_id uuid UNIQUE
        REFERENCES public.payment_groups(id) ON DELETE RESTRICT,

    plan_name_snapshot text NOT NULL,
    plan_price_rub_snapshot integer NOT NULL
        CHECK (plan_price_rub_snapshot > 0),

    total_hours integer NOT NULL CHECK (total_hours > 0),

    remaining_hours integer NOT NULL DEFAULT 0
        CHECK (remaining_hours >= 0),

    reserved_hours integer NOT NULL DEFAULT 0
        CHECK (reserved_hours >= 0),

    purchased_at timestamptz,
    starts_at timestamptz,
    expires_at timestamptz,

    status text NOT NULL DEFAULT 'pending_payment'
        CHECK (status IN (
            'pending_payment',
            'active',
            'exhausted',
            'expired',
            'cancelled'
        )),

    plan_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(plan_snapshot) = 'object'),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT user_passes_balance_limit
        CHECK (remaining_hours + reserved_hours <= total_hours),

    CONSTRAINT user_passes_validity_check
        CHECK (
            (starts_at IS NULL AND expires_at IS NULL)
            OR
            (starts_at IS NOT NULL AND expires_at > starts_at)
        )
);

CREATE INDEX user_passes_user_status_idx
    ON public.user_passes(user_id, status, expires_at);

CREATE INDEX user_passes_city_status_idx
    ON public.user_passes(city_id, status);


-- =========================================================
-- 3. PASS TRANSACTION LEDGER
-- Append-only journal.
-- =========================================================

CREATE TABLE public.pass_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    user_pass_id uuid NOT NULL
        REFERENCES public.user_passes(id) ON DELETE RESTRICT,

    booking_id uuid
        REFERENCES public.bookings(id) ON DELETE RESTRICT,

    transaction_type text NOT NULL
        CHECK (transaction_type IN (
            'purchase_credit',
            'reserve',
            'release',
            'consume',
            'restore',
            'adjustment',
            'expiration'
        )),

    remaining_delta integer NOT NULL DEFAULT 0,
    reserved_delta integer NOT NULL DEFAULT 0,

    idempotency_key text NOT NULL UNIQUE
        CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),

    description text,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT pass_transactions_delta_rules CHECK (
        CASE transaction_type
            WHEN 'purchase_credit' THEN
                remaining_delta > 0
                AND reserved_delta = 0
                AND booking_id IS NULL

            WHEN 'reserve' THEN
                remaining_delta = -1
                AND reserved_delta = 1
                AND booking_id IS NOT NULL

            WHEN 'release' THEN
                remaining_delta = 1
                AND reserved_delta = -1
                AND booking_id IS NOT NULL

            WHEN 'consume' THEN
                remaining_delta = 0
                AND reserved_delta = -1
                AND booking_id IS NOT NULL

            WHEN 'restore' THEN
                remaining_delta = 1
                AND reserved_delta = 0
                AND booking_id IS NOT NULL

            WHEN 'expiration' THEN
                remaining_delta < 0
                AND reserved_delta = 0
                AND booking_id IS NULL

            WHEN 'adjustment' THEN
                (remaining_delta <> 0 OR reserved_delta <> 0)

            ELSE false
        END
    )
);

CREATE INDEX pass_transactions_pass_created_idx
    ON public.pass_transactions(user_pass_id, created_at DESC);

CREATE INDEX pass_transactions_booking_idx
    ON public.pass_transactions(booking_id)
    WHERE booking_id IS NOT NULL;


-- =========================================================
-- 4. BOOKING TO PASS ALLOCATION
-- One booking consumes at most one pass hour.
-- =========================================================

CREATE TABLE public.booking_pass_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    booking_id uuid NOT NULL UNIQUE
        REFERENCES public.bookings(id) ON DELETE RESTRICT,

    user_pass_id uuid NOT NULL
        REFERENCES public.user_passes(id) ON DELETE RESTRICT,

    status text NOT NULL DEFAULT 'reserved'
        CHECK (status IN (
            'reserved',
            'consumed',
            'released',
            'restored'
        )),

    slot_price_snapshot_rub integer NOT NULL
        CHECK (slot_price_snapshot_rub > 0),

    reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    consumed_at timestamptz,
    released_at timestamptz,
    restored_at timestamptz,

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT booking_pass_allocation_timestamps CHECK (
        CASE status
            WHEN 'reserved' THEN
                consumed_at IS NULL
                AND released_at IS NULL
                AND restored_at IS NULL

            WHEN 'consumed' THEN
                consumed_at IS NOT NULL
                AND released_at IS NULL
                AND restored_at IS NULL

            WHEN 'released' THEN
                consumed_at IS NULL
                AND released_at IS NOT NULL
                AND restored_at IS NULL

            WHEN 'restored' THEN
                consumed_at IS NOT NULL
                AND released_at IS NULL
                AND restored_at IS NOT NULL

            ELSE false
        END
    )
);

CREATE INDEX booking_pass_allocations_pass_status_idx
    ON public.booking_pass_allocations(user_pass_id, status);


-- =========================================================
-- 4A. BOOKING PASS ALLOCATION STATE MACHINE
-- Allowed transitions:
-- reserved -> consumed
-- reserved -> released
-- consumed -> restored
-- released/restored are terminal states.
-- Pass balance is changed by separate atomic RPCs.
-- =========================================================

CREATE FUNCTION public.enforce_booking_pass_allocation_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'reserved'
           OR NEW.consumed_at IS NOT NULL
           OR NEW.released_at IS NOT NULL
           OR NEW.restored_at IS NOT NULL THEN
            RAISE EXCEPTION
                'A new booking pass allocation must start as reserved';
        END IF;

        RETURN NEW;
    END IF;

    IF ROW(
        OLD.booking_id,
        OLD.user_pass_id,
        OLD.slot_price_snapshot_rub,
        OLD.reserved_at
    ) IS DISTINCT FROM ROW(
        NEW.booking_id,
        NEW.user_pass_id,
        NEW.slot_price_snapshot_rub,
        NEW.reserved_at
    ) THEN
        RAISE EXCEPTION
            'Booking pass allocation identity and snapshot are immutable';
    END IF;

    IF OLD.status = NEW.status THEN
        IF ROW(
            OLD.consumed_at,
            OLD.released_at,
            OLD.restored_at
        ) IS DISTINCT FROM ROW(
            NEW.consumed_at,
            NEW.released_at,
            NEW.restored_at
        ) THEN
            RAISE EXCEPTION
                'Booking pass allocation timestamps cannot be edited';
        END IF;

        RETURN NEW;
    END IF;

    IF OLD.status = 'reserved' AND NEW.status = 'consumed' THEN
        IF NEW.consumed_at IS NULL
           OR NEW.released_at IS NOT NULL
           OR NEW.restored_at IS NOT NULL THEN
            RAISE EXCEPTION
                'Invalid reserved-to-consumed transition';
        END IF;

    ELSIF OLD.status = 'reserved' AND NEW.status = 'released' THEN
        IF NEW.consumed_at IS NOT NULL
           OR NEW.released_at IS NULL
           OR NEW.restored_at IS NOT NULL THEN
            RAISE EXCEPTION
                'Invalid reserved-to-released transition';
        END IF;

    ELSIF OLD.status = 'consumed' AND NEW.status = 'restored' THEN
        IF OLD.consumed_at IS NULL
           OR NEW.consumed_at IS DISTINCT FROM OLD.consumed_at
           OR NEW.released_at IS NOT NULL
           OR NEW.restored_at IS NULL THEN
            RAISE EXCEPTION
                'Invalid consumed-to-restored transition';
        END IF;

    ELSE
        RAISE EXCEPTION
            'Unsupported booking pass allocation transition: % -> %',
            OLD.status,
            NEW.status;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER booking_pass_allocations_state_machine
BEFORE INSERT OR UPDATE
ON public.booking_pass_allocations
FOR EACH ROW
EXECUTE FUNCTION public.enforce_booking_pass_allocation_transition();


-- =========================================================
-- 5. STUDIO SERVICE SETTINGS
-- One configuration per service type per studio.
-- =========================================================

CREATE TABLE public.studio_services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    studio_id uuid NOT NULL
        REFERENCES public.studios(id) ON DELETE RESTRICT,

    service_key text NOT NULL
        CHECK (service_key IN ('joint_play', 'coach_session')),

    title text NOT NULL
        CHECK (length(btrim(title)) BETWEEN 1 AND 120),

    description text,

    is_enabled boolean NOT NULL DEFAULT false,

    price_rub integer NOT NULL DEFAULT 0
        CHECK (price_rub >= 0),

    charge_mode text NOT NULL DEFAULT 'per_slot'
        CHECK (charge_mode IN ('per_slot', 'per_group')),

    availability_rules jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(availability_rules) = 'object'),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT studio_services_unique_type
        UNIQUE (studio_id, service_key),

    CONSTRAINT studio_services_enabled_price
        CHECK (NOT is_enabled OR price_rub > 0)
);

CREATE INDEX studio_services_studio_enabled_idx
    ON public.studio_services(studio_id, is_enabled);


-- =========================================================
-- 6. SERVICE GROUP SNAPSHOTS
-- One selection may cover one or multiple bookings.
-- =========================================================

CREATE TABLE public.booking_service_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id uuid NOT NULL
        REFERENCES public.users(id) ON DELETE RESTRICT,

    studio_service_id uuid
        REFERENCES public.studio_services(id) ON DELETE SET NULL,

    service_key text NOT NULL
        CHECK (service_key IN ('joint_play', 'coach_session')),

    title_snapshot text NOT NULL,
    description_snapshot text,

    charge_mode_snapshot text NOT NULL
        CHECK (charge_mode_snapshot IN ('per_slot', 'per_group')),

    unit_price_rub_snapshot integer NOT NULL
        CHECK (unit_price_rub_snapshot > 0),

    slot_count integer NOT NULL
        CHECK (slot_count > 0),

    total_price_rub integer NOT NULL
        CHECK (total_price_rub > 0),

    status text NOT NULL DEFAULT 'pending_payment'
        CHECK (status IN (
            'pending_payment',
            'active',
            'partially_refunded',
            'refunded',
            'cancelled'
        )),

    service_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(service_snapshot) = 'object'),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT booking_service_groups_price_formula CHECK (
        total_price_rub =
            CASE charge_mode_snapshot
                WHEN 'per_slot'
                    THEN unit_price_rub_snapshot * slot_count
                WHEN 'per_group'
                    THEN unit_price_rub_snapshot
            END
    )
);

CREATE INDEX booking_service_groups_user_created_idx
    ON public.booking_service_groups(user_id, created_at DESC);


-- =========================================================
-- 7. SERVICE ALLOCATION PER BOOKING
-- Each slot receives its own allocated amount.
-- =========================================================

CREATE TABLE public.booking_services (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    service_group_id uuid NOT NULL
        REFERENCES public.booking_service_groups(id) ON DELETE RESTRICT,

    booking_id uuid NOT NULL
        REFERENCES public.bookings(id) ON DELETE RESTRICT,

    allocated_amount_rub integer NOT NULL
        CHECK (allocated_amount_rub >= 0),

    refunded_amount_rub integer NOT NULL DEFAULT 0
        CHECK (
            refunded_amount_rub >= 0
            AND refunded_amount_rub <= allocated_amount_rub
        ),

    status text NOT NULL DEFAULT 'pending_payment'
        CHECK (status IN (
            'pending_payment',
            'active',
            'partially_refunded',
            'refunded',
            'cancelled'
        )),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT booking_services_group_booking_unique
        UNIQUE (service_group_id, booking_id)
);

CREATE INDEX booking_services_booking_idx
    ON public.booking_services(booking_id);

CREATE INDEX booking_services_group_idx
    ON public.booking_services(service_group_id);


-- =========================================================
-- 8. SERVICE PAYMENT ALLOCATIONS
-- Separates service payments from base booking price.
-- =========================================================

CREATE TABLE public.booking_service_payment_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    booking_service_id uuid NOT NULL
        REFERENCES public.booking_services(id) ON DELETE RESTRICT,

    payment_group_id uuid NOT NULL
        REFERENCES public.payment_groups(id) ON DELETE RESTRICT,

    amount_rub integer NOT NULL CHECK (amount_rub > 0),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT booking_service_payment_unique
        UNIQUE (booking_service_id, payment_group_id)
);

CREATE INDEX booking_service_payment_group_idx
    ON public.booking_service_payment_allocations(payment_group_id);


-- =========================================================
-- 9. SERVICE REFUND ALLOCATIONS
-- Links provider refunds to exact service-slot allocations.
-- =========================================================

CREATE TABLE public.payment_refund_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    payment_refund_id uuid NOT NULL
        REFERENCES public.payment_refunds(id) ON DELETE RESTRICT,

    booking_service_payment_allocation_id uuid NOT NULL
        REFERENCES public.booking_service_payment_allocations(id)
        ON DELETE RESTRICT,

    amount_rub integer NOT NULL CHECK (amount_rub > 0),

    idempotency_key text NOT NULL UNIQUE
        CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX payment_refund_allocations_refund_idx
    ON public.payment_refund_allocations(payment_refund_id);

CREATE INDEX payment_refund_allocations_service_payment_idx
    ON public.payment_refund_allocations(
        booking_service_payment_allocation_id
    );


-- =========================================================
-- 10. PASS LEDGER IMMUTABILITY
-- Ledger rows cannot be edited or deleted.
-- =========================================================

CREATE FUNCTION public.prevent_pass_transaction_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION
        'Pass transaction ledger is append-only';
END;
$$;

CREATE TRIGGER pass_transactions_immutable
BEFORE UPDATE OR DELETE ON public.pass_transactions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_pass_transaction_mutation();


-- =========================================================
-- 11. SERVICE SNAPSHOT IMMUTABILITY
-- Snapshot fields cannot be changed after creation.
-- Status and refund fields remain manageable by server logic.
-- =========================================================

CREATE FUNCTION public.prevent_service_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF TG_TABLE_NAME = 'booking_service_groups' THEN
        IF ROW(
            OLD.user_id,
            OLD.studio_service_id,
            OLD.service_key,
            OLD.title_snapshot,
            OLD.description_snapshot,
            OLD.charge_mode_snapshot,
            OLD.unit_price_rub_snapshot,
            OLD.slot_count,
            OLD.total_price_rub,
            OLD.service_snapshot
        ) IS DISTINCT FROM ROW(
            NEW.user_id,
            NEW.studio_service_id,
            NEW.service_key,
            NEW.title_snapshot,
            NEW.description_snapshot,
            NEW.charge_mode_snapshot,
            NEW.unit_price_rub_snapshot,
            NEW.slot_count,
            NEW.total_price_rub,
            NEW.service_snapshot
        ) THEN
            RAISE EXCEPTION
                'Service group snapshot fields are immutable';
        END IF;

    ELSIF TG_TABLE_NAME = 'booking_services' THEN
        IF ROW(
            OLD.service_group_id,
            OLD.booking_id,
            OLD.allocated_amount_rub
        ) IS DISTINCT FROM ROW(
            NEW.service_group_id,
            NEW.booking_id,
            NEW.allocated_amount_rub
        ) THEN
            RAISE EXCEPTION
                'Booking service allocation fields are immutable';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER booking_service_groups_snapshot_immutable
BEFORE UPDATE ON public.booking_service_groups
FOR EACH ROW
EXECUTE FUNCTION public.prevent_service_snapshot_mutation();

CREATE TRIGGER booking_services_snapshot_immutable
BEFORE UPDATE ON public.booking_services
FOR EACH ROW
EXECUTE FUNCTION public.prevent_service_snapshot_mutation();


-- =========================================================
-- 12. PAYMENT ALLOCATION IMMUTABILITY
-- Payment and refund allocation rows are append-only.
-- =========================================================

CREATE FUNCTION public.prevent_service_payment_allocation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION
        'Service payment allocation records are immutable';
END;
$$;

CREATE TRIGGER booking_service_payment_allocations_immutable
BEFORE UPDATE OR DELETE
ON public.booking_service_payment_allocations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_service_payment_allocation_mutation();

CREATE TRIGGER payment_refund_allocations_immutable
BEFORE UPDATE OR DELETE
ON public.payment_refund_allocations
FOR EACH ROW
EXECUTE FUNCTION public.prevent_service_payment_allocation_mutation();


-- =========================================================
-- 13. DEFERRED SERVICE GROUP TOTAL VALIDATION
-- At transaction commit:
-- - allocation count must equal slot_count;
-- - allocated amounts must equal total_price_rub.
-- =========================================================

CREATE FUNCTION public.check_booking_service_group_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_group_id uuid;
    v_expected_count integer;
    v_expected_total integer;
    v_actual_count bigint;
    v_actual_total bigint;
BEGIN
    IF TG_TABLE_NAME = 'booking_service_groups' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN NULL;
        END IF;

        v_group_id := NEW.id;
    ELSE
        IF TG_OP = 'DELETE' THEN
            v_group_id := OLD.service_group_id;
        ELSE
            v_group_id := NEW.service_group_id;
        END IF;
    END IF;

    SELECT slot_count, total_price_rub
    INTO v_expected_count, v_expected_total
    FROM public.booking_service_groups
    WHERE id = v_group_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT
        count(*),
        COALESCE(sum(allocated_amount_rub), 0)
    INTO v_actual_count, v_actual_total
    FROM public.booking_services
    WHERE service_group_id = v_group_id;

    IF v_actual_count <> v_expected_count THEN
        RAISE EXCEPTION
            'Service group % expects % slots, but has % allocations',
            v_group_id,
            v_expected_count,
            v_actual_count
            USING ERRCODE = '23514';
    END IF;

    IF v_actual_total <> v_expected_total THEN
        RAISE EXCEPTION
            'Service group % total is %, but allocated amount is %',
            v_group_id,
            v_expected_total,
            v_actual_total
            USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER booking_service_groups_totals_check
AFTER INSERT OR UPDATE OR DELETE
ON public.booking_service_groups
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_booking_service_group_totals();

CREATE CONSTRAINT TRIGGER booking_services_totals_check
AFTER INSERT OR UPDATE OR DELETE
ON public.booking_services
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.check_booking_service_group_totals();


-- =========================================================
-- 14. REFUND ALLOCATION VALIDATION
-- - only pending provider refunds can receive allocations;
-- - payment group must match;
-- - refund allocation cannot exceed refund amount;
-- - active/succeeded allocations cannot exceed paid service amount.
-- Rows are locked to serialize concurrent refund attempts.
-- =========================================================

CREATE FUNCTION public.validate_payment_refund_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_refund public.payment_refunds%ROWTYPE;
    v_service_payment public.booking_service_payment_allocations%ROWTYPE;
    v_refund_allocated bigint;
    v_service_allocated bigint;
BEGIN
    SELECT *
    INTO v_refund
    FROM public.payment_refunds
    WHERE id = NEW.payment_refund_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment refund does not exist';
    END IF;

    IF v_refund.status <> 'pending' THEN
        RAISE EXCEPTION
            'Service allocations can only be attached to pending refunds';
    END IF;

    SELECT *
    INTO v_service_payment
    FROM public.booking_service_payment_allocations
    WHERE id = NEW.booking_service_payment_allocation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Service payment allocation does not exist';
    END IF;

    IF v_refund.payment_group_id <> v_service_payment.payment_group_id THEN
        RAISE EXCEPTION
            'Refund and service payment allocation belong to different payment groups';
    END IF;

    SELECT COALESCE(sum(amount_rub), 0)
    INTO v_refund_allocated
    FROM public.payment_refund_allocations
    WHERE payment_refund_id = NEW.payment_refund_id;

    IF v_refund_allocated + NEW.amount_rub > v_refund.amount_rub THEN
        RAISE EXCEPTION
            'Service refund allocations exceed provider refund amount';
    END IF;

    SELECT COALESCE(sum(a.amount_rub), 0)
    INTO v_service_allocated
    FROM public.payment_refund_allocations a
    JOIN public.payment_refunds r
      ON r.id = a.payment_refund_id
    WHERE a.booking_service_payment_allocation_id =
              NEW.booking_service_payment_allocation_id
      AND r.status IN ('pending', 'succeeded');

    IF v_service_allocated + NEW.amount_rub > v_service_payment.amount_rub THEN
        RAISE EXCEPTION
            'Service refunds exceed the amount paid for this service';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER payment_refund_allocations_validate
BEFORE INSERT
ON public.payment_refund_allocations
FOR EACH ROW
EXECUTE FUNCTION public.validate_payment_refund_allocation();


-- =========================================================
-- 15. UPDATE SERVICE REFUND TOTALS
-- Refunded amount changes only after provider refund succeeds.
-- Failed/cancelled refunds do not count toward refunded amount.
-- =========================================================

CREATE FUNCTION public.sync_booking_service_refund_totals()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.status = 'succeeded' OR NEW.status = 'succeeded' THEN
        UPDATE public.booking_services bs
        SET
            refunded_amount_rub = totals.refunded_amount,
            status = CASE
                WHEN totals.refunded_amount >= bs.allocated_amount_rub
                    THEN 'refunded'
                WHEN totals.refunded_amount > 0
                    THEN 'partially_refunded'
                ELSE bs.status
            END,
            updated_at = clock_timestamp()
        FROM (
            SELECT
                bspa.booking_service_id,
                COALESCE(sum(pra.amount_rub), 0)::integer
                    AS refunded_amount
            FROM public.payment_refund_allocations pra
            JOIN public.booking_service_payment_allocations bspa
              ON bspa.id =
                 pra.booking_service_payment_allocation_id
            JOIN public.payment_refunds pr
              ON pr.id = pra.payment_refund_id
            WHERE bspa.booking_service_id IN (
                SELECT DISTINCT bspa2.booking_service_id
                FROM public.payment_refund_allocations pra2
                JOIN public.booking_service_payment_allocations bspa2
                  ON bspa2.id =
                     pra2.booking_service_payment_allocation_id
                WHERE pra2.payment_refund_id = NEW.id
            )
              AND pr.status = 'succeeded'
            GROUP BY bspa.booking_service_id
        ) totals
        WHERE bs.id = totals.booking_service_id;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER payment_refunds_sync_service_totals
AFTER UPDATE OF status
ON public.payment_refunds
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_booking_service_refund_totals();


-- =========================================================
-- 16. SECURITY
-- No direct client access.
-- Server APIs use service_role.
-- =========================================================

ALTER TABLE public.pass_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pass_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_pass_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_service_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_service_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_refund_allocations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
    public.pass_plans,
    public.user_passes,
    public.pass_transactions,
    public.booking_pass_allocations,
    public.studio_services,
    public.booking_service_groups,
    public.booking_services,
    public.booking_service_payment_allocations,
    public.payment_refund_allocations
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.pass_plans,
    public.user_passes,
    public.pass_transactions,
    public.booking_pass_allocations,
    public.studio_services,
    public.booking_service_groups,
    public.booking_services,
    public.booking_service_payment_allocations,
    public.payment_refund_allocations
TO service_role;

REVOKE ALL ON FUNCTION public.enforce_booking_pass_allocation_transition()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.prevent_pass_transaction_mutation()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.prevent_service_snapshot_mutation()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.prevent_service_payment_allocation_mutation()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.check_booking_service_group_totals()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.validate_payment_refund_allocation()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.sync_booking_service_refund_totals()
FROM PUBLIC, anon, authenticated;

COMMIT;
