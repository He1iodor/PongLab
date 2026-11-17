
-- Add optional customer comment to bookings.
-- The schema change has already been applied manually.
-- This migration is safe to run against that existing schema.

BEGIN;

-- 1. Ensure the comment column exists.
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS customer_comment text;

-- 2. Ensure the comment length constraint exists.
DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.bookings'::regclass
          AND conname = 'bookings_customer_comment_length_check'
    ) THEN
        ALTER TABLE public.bookings
        ADD CONSTRAINT bookings_customer_comment_length_check
        CHECK (
            customer_comment IS NULL
            OR (
                char_length(btrim(customer_comment)) >= 1
                AND char_length(btrim(customer_comment)) <= 500
            )
        );
    END IF;
END;
$migration$;

COMMENT ON COLUMN public.bookings.customer_comment
IS 'Optional customer comment supplied when creating a booking';

-- 3. Create the five-argument RPC overload.
--
-- The existing four-argument RPC remains the authoritative implementation
-- of booking validation, pricing, locking, payment-group creation and
-- booking creation. This wrapper adds the comment inside the same
-- PostgreSQL transaction.

CREATE OR REPLACE FUNCTION public.create_payment_group_with_bookings(
    p_user_id uuid,
    p_provider text,
    p_hold_expires_at timestamp with time zone,
    p_bookings jsonb,
    p_customer_comment text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_result jsonb;
    v_group_id uuid;
    v_expected_count integer;
    v_updated_count integer;
BEGIN
    -- Validate the normalized comment length.
    IF p_customer_comment IS NOT NULL
       AND pg_catalog.char_length(
           pg_catalog.btrim(p_customer_comment)
       ) > 500
    THEN
        RAISE EXCEPTION
            'Booking comment must not exceed 500 characters';
    END IF;

    -- Execute the original booking creation logic.
    -- This call creates the payment group and bookings atomically.
    v_result :=
        public.create_payment_group_with_bookings(
            p_user_id,
            p_provider,
            p_hold_expires_at,
            p_bookings
        );

    -- Validate the original RPC response before updating bookings.
    IF pg_catalog.jsonb_typeof(v_result)
       IS DISTINCT FROM 'object'
    THEN
        RAISE EXCEPTION
            'Payment group creation returned an invalid response';
    END IF;

    v_group_id :=
        NULLIF(v_result->>'payment_group_id', '')::uuid;

    IF v_group_id IS NULL THEN
        RAISE EXCEPTION
            'Payment group ID is missing from the RPC response';
    END IF;

    IF pg_catalog.jsonb_typeof(v_result->'bookings')
       IS DISTINCT FROM 'array'
    THEN
        RAISE EXCEPTION
            'Created bookings are missing from the RPC response';
    END IF;

    v_expected_count :=
        pg_catalog.jsonb_array_length(v_result->'bookings');

    -- Attach the same optional comment to every booking
    -- created within this payment group.
    UPDATE public.bookings
    SET customer_comment =
        NULLIF(pg_catalog.btrim(p_customer_comment), '')
    WHERE payment_group_id = v_group_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- Any unexpected mismatch rolls back the entire transaction.
    IF v_updated_count <> v_expected_count THEN
        RAISE EXCEPTION
            'Booking comment update count mismatch: expected %, updated %',
            v_expected_count,
            v_updated_count;
    END IF;

    RETURN v_result;
END;
$function$;

-- 4. Restrict execution to the server-side service role.
REVOKE ALL ON FUNCTION
    public.create_payment_group_with_bookings(
        uuid,
        text,
        timestamp with time zone,
        jsonb,
        text
    )
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
    public.create_payment_group_with_bookings(
        uuid,
        text,
        timestamp with time zone,
        jsonb,
        text
    )
TO service_role;

COMMIT;
