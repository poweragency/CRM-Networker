-- =============================================================================
-- File 0033 — Anagrafica extra columns on marketers + upline rank/status edits
-- Purpose:
--   (1) The per-member anagrafica fields (pacchetto di partenza, addon, click
--       piattaforma, città, regione, data di nascita, occupazione) were frontend-
--       mock only — not persisted and not in sync between the profile and the
--       tree. Make them REAL columns on marketers so they persist and the profile,
--       the roster (/statistiche) and the tree all read one source. phone/notes
--       already exist on marketers and are reused.
--   (2) Let a non-admin UPLINE change rank/renewal status for someone in their
--       STRICT downline (never their own row). Structural/tenancy columns stay
--       admin-only. The guard becomes SECURITY DEFINER so its closure lookup is
--       not itself RLS-bound; the tenant filter is re-applied via OLD.org_id.
--
-- Depends on: 0004_marketers_tree.sql (marketers, closure, the guard function),
--             0006_rls_core.sql (the original guard + trigger).
-- =============================================================================

ALTER TABLE public.marketers
  ADD COLUMN IF NOT EXISTS starting_package text,
  ADD COLUMN IF NOT EXISTS addon            text,
  ADD COLUMN IF NOT EXISTS platform_click   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS city             text,
  ADD COLUMN IF NOT EXISTS region           text,
  ADD COLUMN IF NOT EXISTS birth_date       date,
  ADD COLUMN IF NOT EXISTS occupation       text;

CREATE OR REPLACE FUNCTION public.guard_marketer_structural_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_org_admin() THEN
    RETURN NEW;  -- admins/owners/platform may change anything
  END IF;

  -- Structural / tenancy columns: admin-only.
  IF NEW.parent_id     IS DISTINCT FROM OLD.parent_id
  OR NEW.leg           IS DISTINCT FROM OLD.leg
  OR NEW.sponsor_id    IS DISTINCT FROM OLD.sponsor_id
  OR NEW.org_id        IS DISTINCT FROM OLD.org_id
  OR NEW.external_code IS DISTINCT FROM OLD.external_code THEN
    RAISE EXCEPTION 'insufficient_privilege: structural columns are admin-only'
      USING ERRCODE = '42501';
  END IF;

  -- rank / status: only a STRICT upline of the target (depth >= 1) may change
  -- them. The self-row is depth 0, so this excludes self-promotion.
  IF NEW.rank IS DISTINCT FROM OLD.rank OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.marketer_tree_closure c
      WHERE c.org_id        = OLD.org_id
        AND c.ancestor_id   = public.current_marketer_id()
        AND c.descendant_id = NEW.id
        AND c.depth >= 1
    ) THEN
      RAISE EXCEPTION 'insufficient_privilege: rank/status can only be changed for your downline'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
