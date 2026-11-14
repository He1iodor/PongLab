
BEGIN;

-- ============================================================
-- Stage 5: payment allocations
-- Только фактически оплаченные суммы распределяются по броням.
-- ============================================================

CREATE TABLE public.booking_payment_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    booking_id uuid NOT NULL
        REFERENCES public.bookings(id) ON DELETE RESTRICT,

    payment_group_id uuid NOT NULL
        REFERENCES public.payment_groups(id) ON DELETE RESTRICT,

    amount_rub integer NOT NULL CHECK (amount_rub > 0),

    currency text NOT NULL DEFAULT 'RUB'
        CHECK (currency = 'RUB'),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT booking_payment_allocations_group_booking_unique
        UNIQUE (payment_group_id, booking_id)
);

-- Проверяем целостность исторических успешных платежей.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.payment_groups pg
        LEFT JOIN (
            SELECT
                b.payment_group_id,
                count(*) AS booking_count,
                sum(b.price_rub)::bigint AS booking_total
            FROM public.bookings b
            WHERE b.payment_group_id IS NOT NULL
              AND b.payment_status IN ('succeeded', 'refunded')
            GROUP BY b.payment_group_id
        ) paid ON paid.payment_group_id = pg.id
        WHERE pg.status IN ('succeeded', 'refunded')
          AND (
              COALESCE(paid.booking_count, 0) = 0
              OR paid.booking_total <> pg.amount_rub
          )
    ) THEN
        RAISE EXCEPTION
            'Stage 5 stopped: paid payment group totals do not match paid bookings';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.bookings b
        JOIN public.payment_groups pg
          ON pg.id = b.payment_group_id
        WHERE pg.status IN ('succeeded', 'refunded')
          AND b.payment_status IN ('succeeded', 'refunded')
          AND b.price_rub <= 0
    ) THEN
        RAISE EXCEPTION
            'Stage 5 stopped: non-positive paid booking allocation';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.payment_groups pg
        WHERE pg.status IN ('succeeded', 'refunded')
          AND pg.currency <> 'RUB'
    ) THEN
        RAISE EXCEPTION
            'Stage 5 stopped: unsupported currency in paid payment group';
    END IF;
END;
$$;

-- Исторические распределения только по реально оплаченным броням.
INSERT INTO public.booking_payment_allocations (
    booking_id,
    payment_group_id,
    amount_rub,
    currency
)
SELECT
    b.id,
    b.payment_group_id,
    b.price_rub,
    pg.currency
FROM public.bookings b
JOIN public.payment_groups pg
  ON pg.id = b.payment_group_id
WHERE pg.status IN ('succeeded', 'refunded')
  AND b.payment_status IN ('succeeded', 'refunded')
  AND b.payment_group_id IS NOT NULL
ON CONFLICT (payment_group_id, booking_id) DO NOTHING;

CREATE INDEX booking_payment_allocations_booking_idx
    ON public.booking_payment_allocations (booking_id);

CREATE INDEX booking_payment_allocations_group_idx
    ON public.booking_payment_allocations (payment_group_id);

ALTER TABLE public.booking_payment_allocations
    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_payment_allocations
    FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.booking_payment_allocations
    TO service_role;

COMMENT ON TABLE public.booking_payment_allocations IS
    'Historical and future paid amount allocations per booking and payment group.';

-- ============================================================
-- Один возврат на пару операция + исходная платёжная группа.
-- Это позволяет одной отмене вернуть деньги из нескольких платежей.
-- ============================================================

ALTER TABLE public.payment_refunds
    DROP CONSTRAINT payment_refunds_booking_operation_id_key;

ALTER TABLE public.payment_refunds
    ADD CONSTRAINT payment_refunds_operation_group_unique
    UNIQUE (booking_operation_id, payment_group_id);

COMMIT;
