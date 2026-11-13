-- PongLab: remove direct service_role access to the owner login limits table.
-- The application calls owner_login_attempt through PostgREST RPC.
-- The SECURITY DEFINER function is owned by postgres, uses an empty search_path,
-- and accesses public.owner_login_limits with a schema-qualified name.
-- Direct table privileges are therefore unnecessary for the runtime role.
REVOKE ALL PRIVILEGES ON TABLE public.owner_login_limits FROM service_role;
