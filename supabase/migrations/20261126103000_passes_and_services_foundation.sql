
BEGIN;

-- =========================================================
-- 1. OWNER TARIFF TEMPLATES
-- One tariff belongs to one city.
-- Validity is fixed to one month in application logic.
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
-- Snapshot preserves the tariff conditions at purchase time.
-- The validity period starts only after confirmed payment.
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
-- Every balance change must have an idempotent ledger entry.
-- Reserve: remaining -1, reserved +1.
-- Release: remaining +1, reserved -1.
-- Consume: remaining 0, reserved -1.
-- Restore: remaining +1, reserved 0.
-- =========================================================

CREATE TABLE public.pass_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_pass_id uuid NOT NULL
        REFERENCES public.user_passes(id) ON DELETE RESTRICT,

    booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,

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

    CONSTRAINT pass_transactions_nonzero_delta
        CHECK (remaining_delta <> 0 OR reserved_delta <> 0)
);

CREATE INDEX pass_transactions_pass_created_idx
    ON public.pass_transactions(user_pass_id, created_at DESC);

CREATE INDEX pass_transactions_booking_idx
    ON public.pass_transactions(booking_id)
    WHERE booking_id IS NOT NULL;


-- =========================================================
-- 4. BOOKING TO PASS ALLOCATION
-- One booking can consume at most one pass hour.
-- Transfer must preserve this allocation, not create another.
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
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX booking_pass_allocations_pass_status_idx
    ON public.booking_pass_allocations(user_pass_id, status);


-- =========================================================
-- 5. STUDIO SERVICE SETTINGS
-- One configuration per service type per studio.
-- Availability rules are stored as structured JSON.
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
        UNIQUE (studio_id, service_key)
);

CREATE INDEX studio_services_studio_enabled_idx
    ON public.studio_services(studio_id, is_enabled);


-- =========================================================
-- 6. SERVICE GROUP SNAPSHOTS
-- One selection may cover one or multiple bookings.
-- Price and settings are immutable order snapshots.
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
        CHECK (unit_price_rub_snapshot >= 0),

    slot_count integer NOT NULL CHECK (slot_count > 0),

    total_price_rub integer NOT NULL
        CHECK (total_price_rub >= 0),

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
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX booking_service_groups_user_created_idx
    ON public.booking_service_groups(user_id, created_at DESC);


-- =========================================================
-- 7. SERVICE ALLOCATION PER BOOKING
-- Each slot receives its own allocated amount.
-- This supports proportional refunds on partial cancellation.
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
-- Separates service payments from the base booking price.
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
-- A booking service can be refunded through multiple operations,
-- but idempotency keys prevent duplicate processing.
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
-- 10. SECURITY
-- No direct client access. Server APIs use service_role.
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

COMMIT;
