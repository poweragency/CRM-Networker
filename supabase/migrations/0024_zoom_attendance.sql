-- =============================================================================
-- File 0024 — Presenze Zoom (Zoom attendance)
-- Purpose: One row per (marketer, day, call) recording presence + camera state
--          on the three fixed weekly calls (Wake Up = Mon, Golden = Thu,
--          Join The Dream = Sun). Drives the /presenze grid.
--
-- Depends on: 0003 (organizations, set_updated_at), 0004 (marketers),
--             0005 (current_org_id, can_see_marketer, is_org_admin,
--             current_membership_active).
-- =============================================================================

CREATE TABLE public.zoom_attendance (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  marketer_id        uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,

  call_date          date NOT NULL,
  call               text NOT NULL
    CONSTRAINT zoom_attendance_call_chk
    CHECK (call IN ('wake_up', 'golden', 'join_the_dream')),

  present            boolean NOT NULL DEFAULT false,
  -- Camera on/off during the call (verde = attiva, rosso = spenta).
  cam                boolean NOT NULL DEFAULT false,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  -- One record per person per call per day.
  CONSTRAINT zoom_attendance_uq UNIQUE (org_id, marketer_id, call_date, call)
);

COMMENT ON TABLE public.zoom_attendance IS
  'Presenze Zoom: presence + camera state per (marketer, day, call). Visibility = closure subtree of marketer_id.';

CREATE INDEX zoom_attendance_member_idx
  ON public.zoom_attendance (org_id, marketer_id, call_date);
CREATE INDEX zoom_attendance_day_idx
  ON public.zoom_attendance (org_id, call_date);

CREATE TRIGGER trg_zoom_attendance_updated_at
  BEFORE UPDATE ON public.zoom_attendance
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Row-Level Security — subtree visibility, own-or-admin writes.
-- =============================================================================
ALTER TABLE public.zoom_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoom_attendance FORCE  ROW LEVEL SECURITY;

CREATE POLICY zoom_attendance_select ON public.zoom_attendance
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(marketer_id)
);

CREATE POLICY zoom_attendance_insert ON public.zoom_attendance
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND (public.is_org_admin() OR public.can_see_marketer(marketer_id))
);

CREATE POLICY zoom_attendance_update ON public.zoom_attendance
FOR UPDATE TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.can_see_marketer(marketer_id)
)
WITH CHECK (
  org_id = public.current_org_id()
  AND (public.is_org_admin() OR public.can_see_marketer(marketer_id))
);

CREATE POLICY zoom_attendance_delete ON public.zoom_attendance
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (public.is_org_admin() OR public.can_see_marketer(marketer_id))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoom_attendance TO authenticated;
