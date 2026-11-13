
-- ============================================================
-- PongLab — Stage 5: booking operations foundation
-- Version: 20261113143800
--
-- Adds:
--   1. booking_operations
--   2. booking_operation_events
--   3. payment_refunds
--
-- Does NOT modify existing booking/payment flows.
-- Does NOT change existing payment RPCs.
-- Does NOT create user-facing RLS policies.
-- All access is server-side through service_role.
-- ============================================================


-- ============================================================
-- 1. Booking operations
-- ============================================================

CREATE TABLE public.booking_operations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    idempotency_key text NOT NULL UNIQUE,

    booking_id uuid NOT NULL
        REFERENCES public.bookings(id)
        ON DELETE RESTRICT,

    user_id uuid NOT NULL
        REFERENCES public.users(id)
        ON DELETE RESTRICT,

    operation_type text NOT NULL
        CHECK (
            operation_type IN (
                'cancellation',
                'transfer',
                'transfer_request',
                'extension',
                'extension_offer',
                'force_majeure',
                'late_payment_refund'
            )
        ),

    status text NOT NULL DEFAULT 'requested'
        CHECK (
            status IN (
                'requested',
                'offered',
                'awaiting_payment',
                'processing',
                'completed',
                'rejected',
                'failed',
                'expired',
                'cancelled'
            )
        ),

    actor_type text NOT NULL
        CHECK (
            actor_type IN (
                'customer',
                'admin',
                'system'
            )
        ),

    actor_user_id uuid
        REFERENCES public.users(id)
        ON DELETE SET NULL,

    source_payment_group_id uuid
        REFERENCES public.payment_groups(id)
        ON DELETE RESTRICT,

    adjustment_payment_group_id uuid
        REFERENCES public.payment_groups(id)
        ON DELETE RESTRICT,

    source_start_at timestamptz,
    source_end_at timestamptz,

    target_table_id uuid
        REFERENCES public.studio_tables(id)
        ON DELETE RESTRICT,

    target_start_at timestamptz,
    target_end_at timestamptz,

    source_price_rub integer
        CHECK (
            source_price_rub IS NULL
            OR source_price_rub >= 0
        ),

    target_price_rub integer
        CHECK (
            target_price_rub IS NULL
            OR target_price_rub >= 0
        ),

    price_difference_rub integer,

    request_message text
        CHECK (
            request_message IS NULL
            OR char_length(request_message) <= 2000
        ),

    evidence_object_path text
        CHECK (
            evidence_object_path IS NULL
            OR char_length(evidence_object_path) <= 1000
        ),

    expires_at timestamptz,
    completed_at timestamptz,

    metadata jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(metadata) = 'object'),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT booking_operations_idempotency_key_length
        CHECK (
            char_length(idempotency_key) BETWEEN 1 AND 200
        ),

    CONSTRAINT booking_operations_source_time_check
        CHECK (
            source_start_at IS NULL
            OR source_end_at IS NULL
            OR source_start_at < source_end_at
        ),

    CONSTRAINT booking_operations_target_time_check
        CHECK (
            target_start_at IS NULL
            OR target_end_at IS NULL
            OR target_start_at < target_end_at
        ),

    CONSTRAINT booking_operations_extension_duration_check
        CHECK (
            operation_type NOT IN (
                'extension',
                'extension_offer'
            )
            OR (
                target_start_at IS NOT NULL
                AND target_end_at =
                    target_start_at + interval '60 minutes'
            )
        )
);


CREATE INDEX booking_operations_user_created_idx
    ON public.booking_operations (
        user_id,
        created_at DESC
    );

CREATE INDEX booking_operations_booking_created_idx
    ON public.booking_operations (
        booking_id,
        created_at DESC
    );

CREATE INDEX booking_operations_status_created_idx
    ON public.booking_operations (
        status,
        created_at
    );

CREATE INDEX booking_operations_type_status_idx
    ON public.booking_operations (
        operation_type,
        status,
        created_at
    );

CREATE UNIQUE INDEX booking_operations_adjustment_payment_group_uidx
    ON public.booking_operations (
        adjustment_payment_group_id
    )
    WHERE adjustment_payment_group_id IS NOT NULL;


-- ============================================================
-- 2. Immutable operation event history
-- ============================================================

CREATE TABLE public.booking_operation_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    operation_id uuid NOT NULL
        REFERENCES public.booking_operations(id)
        ON DELETE RESTRICT,

    event_type text NOT NULL
        CHECK (
            event_type IN (
                'created',
                'status_changed'
            )
        ),

    actor_type text NOT NULL
        CHECK (
            actor_type IN (
                'customer',
                'admin',
                'system'
            )
        ),

    actor_user_id uuid
        REFERENCES public.users(id)
        ON DELETE SET NULL,

    from_status text,
    to_status text NOT NULL,

    details jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(details) = 'object'),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);


CREATE INDEX booking_operation_events_operation_created_idx
    ON public.booking_operation_events (
        operation_id,
        created_at
    );


-- Automatically record operation creation and status changes.
-- The event history is append-only.

CREATE OR REPLACE FUNCTION public.log_booking_operation_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
    IF TG_OP = 'INSERT' THEN

        INSERT INTO public.booking_operation_events (
            operation_id,
            event_type,
            actor_type,
            actor_user_id,
            from_status,
            to_status,
            details
        )
        VALUES (
            NEW.id,
            'created',
            NEW.actor_type,
            NEW.actor_user_id,
            NULL,
            NEW.status,
            pg_catalog.jsonb_build_object(
                'operation_type', NEW.operation_type,
                'booking_id', NEW.booking_id,
                'source_start_at', NEW.source_start_at,
                'source_end_at', NEW.source_end_at,
                'target_table_id', NEW.target_table_id,
                'target_start_at', NEW.target_start_at,
                'target_end_at', NEW.target_end_at,
                'source_price_rub', NEW.source_price_rub,
                'target_price_rub', NEW.target_price_rub,
                'price_difference_rub', NEW.price_difference_rub
            )
        );

    ELSIF OLD.status IS DISTINCT FROM NEW.status THEN

        INSERT INTO public.booking_operation_events (
            operation_id,
            event_type,
            actor_type,
            actor_user_id,
            from_status,
            to_status,
            details
        )
        VALUES (
            NEW.id,
            'status_changed',
            NEW.actor_type,
            NEW.actor_user_id,
            OLD.status,
            NEW.status,
            pg_catalog.jsonb_build_object(
                'operation_type', NEW.operation_type,
                'booking_id', NEW.booking_id,
                'adjustment_payment_group_id',
                    NEW.adjustment_payment_group_id,
                'price_difference_rub',
                    NEW.price_difference_rub
            )
        );

    END IF;

    RETURN NEW;
END;
$function$;


REVOKE ALL ON FUNCTION public.log_booking_operation_event()
    FROM PUBLIC, anon, authenticated, service_role;


DROP TRIGGER IF EXISTS booking_operations_audit
    ON public.booking_operations;

CREATE TRIGGER booking_operations_audit
AFTER INSERT OR UPDATE OF status
ON public.booking_operations
FOR EACH ROW
EXECUTE FUNCTION public.log_booking_operation_event();


-- ============================================================
-- 3. Payment refunds
-- ============================================================

CREATE TABLE public.payment_refunds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    booking_operation_id uuid NOT NULL UNIQUE
        REFERENCES public.booking_operations(id)
        ON DELETE RESTRICT,

    payment_group_id uuid NOT NULL
        REFERENCES public.payment_groups(id)
        ON DELETE RESTRICT,

    provider text NOT NULL
        CHECK (
            provider IN (
                'yookassa',
                'tbank'
            )
        ),

    provider_payment_id text NOT NULL
        CHECK (
            char_length(provider_payment_id) BETWEEN 1 AND 200
        ),

    provider_refund_id text,

    amount_rub integer NOT NULL
        CHECK (amount_rub > 0),

    currency text NOT NULL DEFAULT 'RUB'
        CHECK (currency = 'RUB'),

    status text NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'succeeded',
                'cancelled',
                'failed'
            )
        ),

    idempotency_key text NOT NULL UNIQUE
        CHECK (
            char_length(idempotency_key) BETWEEN 1 AND 200
        ),

    failure_reason text,

    provider_response jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(provider_response) = 'object'),

    requested_by_user_id uuid
        REFERENCES public.users(id)
        ON DELETE SET NULL,

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    succeeded_at timestamptz,

    CONSTRAINT payment_refunds_provider_refund_id_length
        CHECK (
            provider_refund_id IS NULL
            OR char_length(provider_refund_id) BETWEEN 1 AND 200
        )
);


CREATE UNIQUE INDEX payment_refunds_provider_refund_uidx
    ON public.payment_refunds (
        provider,
        provider_refund_id
    )
    WHERE provider_refund_id IS NOT NULL;

CREATE INDEX payment_refunds_payment_group_created_idx
    ON public.payment_refunds (
        payment_group_id,
        created_at DESC
    );

CREATE INDEX payment_refunds_status_created_idx
    ON public.payment_refunds (
        status,
        created_at
    );


-- ============================================================
-- 4. Row Level Security
-- ============================================================

ALTER TABLE public.booking_operations
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.booking_operation_events
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_refunds
    ENABLE ROW LEVEL SECURITY;


-- No direct access from public-facing roles.
-- Application access is performed only by trusted server code.

REVOKE ALL ON TABLE public.booking_operations
    FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.booking_operation_events
    FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON TABLE public.payment_refunds
    FROM PUBLIC, anon, authenticated, service_role;


-- The server can manage operation records and refunds.
GRANT SELECT, INSERT, UPDATE
    ON TABLE public.booking_operations
    TO service_role;

GRANT SELECT
    ON TABLE public.booking_operation_events
    TO service_role;

GRANT SELECT, INSERT, UPDATE
    ON TABLE public.payment_refunds
    TO service_role;


-- ============================================================
-- End of migration
-- ============================================================
