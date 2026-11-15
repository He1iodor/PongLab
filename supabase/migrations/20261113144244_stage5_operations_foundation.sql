CREATE OR REPLACE FUNCTION public.sync_transfer_operation_payment_terminal_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_operation_status text;
    v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
    IF TG_OP <> 'UPDATE'
       OR OLD.status <> 'pending'
       OR NEW.status NOT IN ('cancelled', 'failed')
    THEN
        RETURN NEW;
    END IF;

    v_operation_status := CASE
        WHEN NEW.failure_reason = 'payment_timeout_10m'
          OR NEW.failure_reason LIKE 'payment_timeout_10m|%'
        THEN 'expired'
        ELSE 'failed'
    END;

    UPDATE public.booking_operations AS bo
    SET
        status = v_operation_status,
        updated_at = v_now,
        metadata = bo.metadata || pg_catalog.jsonb_build_object(
            'payment_terminal_status', NEW.status,
            'payment_failure_reason', NEW.failure_reason,
            'payment_terminal_at', v_now
        )
    WHERE bo.operation_type = 'transfer'
      AND bo.status = 'awaiting_payment'
      AND bo.adjustment_payment_group_id = NEW.id
      AND EXISTS (
          SELECT 1
          FROM public.bookings AS b
          WHERE b.booking_operation_id = bo.id
            AND b.payment_group_id = NEW.id
      );

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_transfer_operation_payment_terminal_state()
FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS payment_group_transfer_operation_terminal_state
ON public.payment_groups;

CREATE TRIGGER payment_group_transfer_operation_terminal_state
AFTER UPDATE OF status, failure_reason
ON public.payment_groups
FOR EACH ROW
WHEN (
    OLD.status = 'pending'
    AND NEW.status IN ('cancelled', 'failed')
)
EXECUTE FUNCTION public.sync_transfer_operation_payment_terminal_state();
