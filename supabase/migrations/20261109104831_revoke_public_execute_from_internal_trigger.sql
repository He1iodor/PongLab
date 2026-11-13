-- This function is called only by the studio_slot_price_rules trigger.
-- Remove the default PUBLIC EXECUTE grant; trigger invocation remains intact.
REVOKE EXECUTE ON FUNCTION public.prevent_overlapping_price_rules() FROM PUBLIC;
