-- =============================================================================
-- File 0001 — Extensions & private schema
-- Purpose: Enable the Postgres extensions required by the canonical schema
--          (doc 01 §"Required extensions") and create the app_private schema
--          that hosts internal queue/maintenance objects (ADR-006:
--          app_private.dirty_metric_days lives here, created in a later file).
--
-- Depends on: (nothing — this is the first migration; runs on a clean db)
--
-- Notes:
--   * pg_cron is intentionally NOT created here. It is a superuser-managed
--     extension that is provisioned/guarded in a later (scheduling) migration
--     per the task brief ("pg_cron is handled later, guarded"). Creating it in
--     the foundation would break `supabase db reset` on environments where the
--     extension is unavailable.
--   * Extensions are created in the standard "extensions" schema on Supabase
--     when present; we use IF NOT EXISTS so a clean reset is idempotent.
-- =============================================================================

-- gen_random_uuid() and digest()/sha256 helpers for token hashing.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ltree: materialized genealogy path (marketers.path) + GiST subtree queries.
CREATE EXTENSION IF NOT EXISTS ltree;

-- btree_gist: composite / exclusion GiST indexes mixing btree-able columns.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- pg_trgm: fuzzy (trigram) search on contact / marketer display names.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- -----------------------------------------------------------------------------
-- app_private — internal schema for queue tables and maintenance objects that
-- must never be exposed to the `authenticated` / `anon` roles. RLS-bearing
-- tenant tables stay in `public`; app_private holds system-only structures
-- (e.g. ADR-006 app_private.dirty_metric_days).
-- -----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app_private;

COMMENT ON SCHEMA app_private IS
  'Internal/system-only schema: incremental-refresh queues and maintenance '
  'objects. Not granted to authenticated/anon. ADR-006 dirty_metric_days lives here.';

-- Default least-privilege posture: revoke any inherited access for app roles.
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
