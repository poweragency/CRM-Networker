-- =============================================================================
-- File 0025 — 100's list (wishlist)
-- Purpose: Per-marketer personal "100's list" — the things a person wants to
--          do/have, catalogued from nearest (vicino) to furthest (lontano).
--          Drives the wishlist editor in the marketer profile.
--
-- Depends on: 0003 (organizations, set_updated_at), 0004 (marketers),
--             0005 (current_org_id, can_see_marketer, is_org_admin,
--             current_membership_active).
-- =============================================================================

CREATE TABLE public.wishlist_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_marketer_id  uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,

  title              text NOT NULL,
  horizon            text NOT NULL DEFAULT 'vicino'
    CONSTRAINT wishlist_horizon_chk
    CHECK (horizon IN ('vicino', 'medio', 'lontano')),
  done               boolean NOT NULL DEFAULT false,
  -- Ordering slot within the list (1..100).
  position           smallint NOT NULL DEFAULT 1
    CONSTRAINT wishlist_position_positive CHECK (position >= 1),

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

COMMENT ON TABLE public.wishlist_items IS
  '100''s list: each marketer''s personal goals (title + horizon vicino/medio/lontano + done). Visibility = closure subtree of owner_marketer_id.';

CREATE INDEX wishlist_owner_idx
  ON public.wishlist_items (org_id, owner_marketer_id)
  WHERE deleted_at IS NULL;
CREATE INDEX wishlist_org_idx
  ON public.wishlist_items (org_id);

CREATE TRIGGER trg_wishlist_items_updated_at
  BEFORE UPDATE ON public.wishlist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Row-Level Security — subtree visibility, own-or-admin writes.
-- =============================================================================
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items FORCE  ROW LEVEL SECURITY;

CREATE POLICY wishlist_items_select ON public.wishlist_items
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(owner_marketer_id)
);

CREATE POLICY wishlist_items_insert ON public.wishlist_items
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (public.is_org_admin() OR public.can_see_marketer(owner_marketer_id))
);

CREATE POLICY wishlist_items_update ON public.wishlist_items
FOR UPDATE TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(owner_marketer_id)
)
WITH CHECK (
  org_id = public.current_org_id()
  AND (public.is_org_admin() OR public.can_see_marketer(owner_marketer_id))
);

CREATE POLICY wishlist_items_delete ON public.wishlist_items
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (public.is_org_admin() OR public.can_see_marketer(owner_marketer_id))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist_items TO authenticated;
