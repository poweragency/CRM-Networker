-- =============================================================================
-- File 0035 — Grant service_role the privileges to activate a CRM login
-- Purpose: The server-side admin client (lib/data/account.ts → activateCrmAccess)
--          reads + writes `memberships` as the service_role to link a freshly
--          created auth user to an existing marketer. Earlier migrations granted
--          memberships only to `authenticated`, so the admin insert failed with
--          "permission denied for table memberships" (the action then rolled back
--          and deleted the orphaned auth user → misleading "email già in uso").
--          Grant the minimal set on the single table the flow touches.
--
-- Depends on: 0003_tenancy_identity.sql (memberships).
-- =============================================================================

GRANT SELECT, INSERT, UPDATE ON public.memberships TO service_role;
