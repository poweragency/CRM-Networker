-- =============================================================================
-- File 0026 — Formazione (training checklist progress)
-- Purpose: Tracks which fixed catalogue items (playlist WOW / Click + libri) a
--          marketer has ticked as visto/letto. The catalogue itself is FIXED in
--          the app (FORMAZIONE_CATALOG); only the ticked set is per-person, so
--          this is a thin presence table: one row per ticked item.
--
-- Depends on: 0003 (organizations), 0004 (marketers), 0005 (current_org_id,
--             can_see_marketer, is_org_admin, current_membership_active).
-- =============================================================================

CREATE TABLE public.formazione_progress (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketer_id        uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,

  -- Catalogue item id, e.g. 'wow_analisi_tecnica_base', 'book_go_pro'.
  item_key           text NOT NULL,

  created_at         timestamptz NOT NULL DEFAULT now(),

  -- A row exists iff the item is ticked; one per (marketer, item).
  CONSTRAINT formazione_progress_uq UNIQUE (org_id, marketer_id, item_key)
);

COMMENT ON TABLE public.formazione_progress IS
  'Formazione: ticked catalogue items (playlist/libri) per marketer. Row presence = item done. Visibility = closure subtree of marketer_id.';

CREATE INDEX formazione_progress_member_idx
  ON public.formazione_progress (org_id, marketer_id);
CREATE INDEX formazione_progress_org_idx
  ON public.formazione_progress (org_id);

-- =============================================================================
-- Row-Level Security — subtree visibility, own-or-admin writes.
-- =============================================================================
ALTER TABLE public.formazione_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formazione_progress FORCE  ROW LEVEL SECURITY;

CREATE POLICY formazione_progress_select ON public.formazione_progress
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(marketer_id)
);

CREATE POLICY formazione_progress_insert ON public.formazione_progress
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (public.is_org_admin() OR public.can_see_marketer(marketer_id))
);

CREATE POLICY formazione_progress_delete ON public.formazione_progress
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (public.is_org_admin() OR public.can_see_marketer(marketer_id))
);

GRANT SELECT, INSERT, DELETE ON public.formazione_progress TO authenticated;
