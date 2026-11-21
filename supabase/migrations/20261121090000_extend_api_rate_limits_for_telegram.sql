BEGIN;

ALTER TABLE public.api_rate_limits
DROP CONSTRAINT api_rate_limits_route_key_check;

ALTER TABLE public.api_rate_limits
ADD CONSTRAINT api_rate_limits_route_key_check
CHECK (
  route_key IN (
    'availability',
    'booking_hold',
    'telegram_link',
    'telegram_webhook',
    'support_message'
  )
);

COMMIT;
