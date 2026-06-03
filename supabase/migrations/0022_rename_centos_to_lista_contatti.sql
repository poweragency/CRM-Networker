-- =============================================================================
-- File 0022 — Rename "Centos List" → "Lista contatti" (+ rapporto / stato)
-- Purpose: The "list of 100" feature is renamed to its product name "Lista
--          contatti". Renames the table and its dependent objects (indexes,
--          constraints, trigger, RLS policies), and adds the two fields the app
--          now uses:
--            * rapporto  — warmth of the relationship (caldo / tiepido / freddo)
--            * stato     — explicit funnel status, replacing the old DERIVED
--                          contacted/promoted projection in the UI
--                          (non_invitato / invitato / iscritto / non_iscritto)
--          Legacy columns (rating, contacted, promoted_contact_id, phone) are
--          kept for back-compat; the UI no longer surfaces them.
--
-- Depends on: 0009_centos.sql (creates centos_list_entries).
-- NOTE: ALTER TABLE ... RENAME preserves data, FKs, indexes, RLS policies and
--       grants (they follow the table); we rename their identifiers too so the
--       schema reads consistently as `lista_contatti_*`.
-- =============================================================================

ALTER TABLE public.centos_list_entries RENAME TO lista_contatti_entries;

-- Indexes.
ALTER INDEX centos_owner_position_uq    RENAME TO lista_contatti_owner_position_uq;
ALTER INDEX centos_owner_idx            RENAME TO lista_contatti_owner_idx;
ALTER INDEX centos_promoted_contact_idx RENAME TO lista_contatti_promoted_contact_idx;
ALTER INDEX centos_org_idx              RENAME TO lista_contatti_org_idx;

-- Check constraints.
ALTER TABLE public.lista_contatti_entries
  RENAME CONSTRAINT centos_rating_range TO lista_contatti_rating_range;
ALTER TABLE public.lista_contatti_entries
  RENAME CONSTRAINT centos_position_positive TO lista_contatti_position_positive;

-- updated_at trigger.
ALTER TRIGGER trg_centos_list_entries_updated_at ON public.lista_contatti_entries
  RENAME TO trg_lista_contatti_entries_updated_at;

-- RLS policies.
ALTER POLICY centos_list_entries_select ON public.lista_contatti_entries RENAME TO lista_contatti_entries_select;
ALTER POLICY centos_list_entries_insert ON public.lista_contatti_entries RENAME TO lista_contatti_entries_insert;
ALTER POLICY centos_list_entries_update ON public.lista_contatti_entries RENAME TO lista_contatti_entries_update;
ALTER POLICY centos_list_entries_delete ON public.lista_contatti_entries RENAME TO lista_contatti_entries_delete;

-- New fields used by the app.
ALTER TABLE public.lista_contatti_entries
  ADD COLUMN rapporto text
    CONSTRAINT lista_contatti_rapporto_chk
    CHECK (rapporto IS NULL OR rapporto IN ('caldo', 'tiepido', 'freddo')),
  ADD COLUMN stato text NOT NULL DEFAULT 'non_invitato'
    CONSTRAINT lista_contatti_stato_chk
    CHECK (stato IN ('non_invitato', 'invitato', 'iscritto', 'non_iscritto'));

COMMENT ON TABLE public.lista_contatti_entries IS
  'Lista contatti ("Lista dei 100"): each marketer''s ordered list of people to approach. rapporto = warmth (caldo/tiepido/freddo); stato = funnel status (non_invitato/invitato/iscritto/non_iscritto). Distinct from contacts (working CRM); an entry can still be promoted into a contact via promoted_contact_id.';
COMMENT ON COLUMN public.lista_contatti_entries.rapporto IS
  'Warmth of the relationship: caldo / tiepido / freddo (NULL = non impostato).';
COMMENT ON COLUMN public.lista_contatti_entries.stato IS
  'Explicit funnel status: non_invitato / invitato / iscritto / non_iscritto (default non_invitato).';
