
-- PongLab: allow the server-side service_role to read payment groups.
-- Required by the account bookings API.
-- No privileges are granted to anon or authenticated.

GRANT SELECT ON TABLE public.payment_groups TO service_role;
