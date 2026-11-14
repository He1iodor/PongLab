
BEGIN;

-- Распределение фактически оплаченной суммы между бронированиями.
-- Одна бронь может иметь несколько распределений после переноса
-- или дополнительных оплаченных операций.
CREATE TABLE IF NOT EXISTS public.booking_payment_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    booking_id uuid NOT NULL
        REFERENCES public.bookings(id) ON DELETE RESTRICT,

    payment_group_id uuid NOT NULL
        REFERENCES public.payment_groups(id) ON DELETE RESTRICT,

    amount_rub integer NOT NULL
        CHECK (amount_rub > 0),

    currency text NOT NULL DEFAULT 'RUB'
        CHECK (currency = 'RUB'),

    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT booking_payment_allocations_group_booking_unique
        UNIQUE (payment_group_id, booking_id)
);

-- Перед заполнением проверяем, что исторические суммы
-- можно распределить без расхождений.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.payment_groups pg
        JOIN (
            SELECT
                payment_group_id,
                SUM(price_rub)::integer AS bookings_total
            FROM public.bookings
            WHERE payment_group_id IS NOT NULL
            GROUP BY payment_group_id
        ) b ON b.payment_group_id = pg.id
        WHERE b.bookings_total <> pg.amount_rub
    ) THEN
        RAISE EXCEPTION
            'Stage 5 migration stopped: payment group totals do not match booking totals';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.payment_group_id IS NOT NULL
          AND b.price_rub <= 0
    ) THEN
        RAISE EXCEPTION
            'Stage 5 migration stopped: non-positive booking allocation found';
    END IF;
END;
$$;

-- Историческое распределение.
-- Каждая бронь получает свою исходную сумму из платёжной группы.
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
WHERE b.payment_group_id IS NOT NULL
ON CONFLICT (payment_group_id, booking_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS
    booking_payment_allocations_booking_idx
ON public.booking_payment_allocations (booking_id);

CREATE INDEX IF NOT EXISTS
    booking_payment_allocations_group_idx
ON public.booking_payment_allocations (payment_group_id);

-- Только серверный доступ.
ALTER TABLE public.booking_payment_allocations
    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.booking_payment_allocations
    FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.booking_payment_allocations
    TO service_role;

COMMENT ON TABLE public.booking_payment_allocations IS
    'Per-booking allocation of payment group amounts. Used for safe partial refunds and booking transfers.';

COMMIT;
