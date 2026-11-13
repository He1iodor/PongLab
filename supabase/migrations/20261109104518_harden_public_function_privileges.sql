-- PongLab: harden default function privileges and isolate btree_gist.
-- Existing application tables remain owned by postgres and keep their current grants.
--
-- PostgreSQL's global function defaults grant EXECUTE to PUBLIC. Schema-level
-- REVOKE does not remove this global grant, so revoke it for future functions
-- created by postgres in every schema. Grant EXECUTE explicitly where required.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- rls_auto_enable is an event-trigger handler, not an application RPC.
-- Its handler continues to run through the event trigger after this revoke.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC;

-- btree_gist is relocatable and is used by bookings_no_overlap through its
-- GiST UUID operator class. Moving the extension preserves the dependent index.
ALTER EXTENSION btree_gist SET SCHEMA extensions;
