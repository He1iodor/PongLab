
CREATE OR REPLACE FUNCTION public.reserve_phone_auth_challenge(p_phone text)
 RETURNS TABLE(allowed boolean, challenge_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_count integer;
    v_id uuid;
BEGIN
    IF p_phone !~ '^79[0-9]{9}$' THEN
        RAISE EXCEPTION 'Invalid phone format';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_phone, 0)
    );

    SELECT pg_catalog.count(*)::integer
    INTO v_count
    FROM public.phone_auth_challenges
    WHERE phone = p_phone
      AND created_at >= pg_catalog.now() - interval '30 minutes';

    IF v_count >= 5 THEN
        RETURN QUERY SELECT false, NULL::uuid;
        RETURN;
    END IF;

    v_id := pg_catalog.gen_random_uuid();

    INSERT INTO public.phone_auth_challenges (
        id, phone, provider_check_id, status, expires_at
    )
    VALUES (
        v_id,
        p_phone,
        'reserved:' || v_id::text,
        'pending',
        pg_catalog.now() + interval '5 minutes'
    );

    RETURN QUERY SELECT true, v_id;
END;
$function$;
