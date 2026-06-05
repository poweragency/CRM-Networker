-- Stage 3: dynamic zoom calls. The 3 hardcoded calls become editable records;
-- admins manage org-wide calls, co-admins add team-scoped calls (visible only to
-- their downline). zoom_attendance references a call by id.
-- (Named zoom_calls to avoid the existing public.calls = prospect call log.)

CREATE TABLE IF NOT EXISTS public.zoom_calls (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title       text NOT NULL,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Sun .. 6=Sat
  start_time  text,                                               -- "HH:MM", optional
  scope       text NOT NULL DEFAULT 'team' CHECK (scope IN ('org','team')),
  created_by  uuid REFERENCES public.marketers(id) ON DELETE SET NULL, -- NULL = org default
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS zoom_calls_org_weekday_idx ON public.zoom_calls (org_id, weekday) WHERE active;
CREATE INDEX IF NOT EXISTS zoom_calls_created_by_idx  ON public.zoom_calls (created_by);

ALTER TABLE public.zoom_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zoom_calls FORCE  ROW LEVEL SECURITY;

-- SELECT: admin sees all; org calls visible to everyone; team calls visible to
-- the creator + the creator's DOWNLINE only (uplines above a co-admin do NOT see).
CREATE POLICY zoom_calls_select ON public.zoom_calls
  FOR SELECT USING (
    org_id = public.current_org_id() AND (
      public.is_org_admin()
      OR scope = 'org'
      OR created_by = public.current_marketer_id()
      OR EXISTS (
        SELECT 1 FROM public.marketer_tree_closure c
        WHERE c.org_id = zoom_calls.org_id
          AND c.ancestor_id = zoom_calls.created_by
          AND c.descendant_id = public.current_marketer_id()
      )
    )
  );

-- INSERT: admins create org/team calls; co-admins create team calls owned by self.
CREATE POLICY zoom_calls_insert ON public.zoom_calls
  FOR INSERT WITH CHECK (
    org_id = public.current_org_id() AND public.current_membership_active() AND (
      public.is_org_admin()
      OR (public.is_co_admin() AND scope = 'team' AND created_by = public.current_marketer_id())
    )
  );

-- UPDATE/DELETE: admins manage all; co-admins manage their own calls.
CREATE POLICY zoom_calls_update ON public.zoom_calls
  FOR UPDATE USING (
    org_id = public.current_org_id() AND (
      public.is_org_admin()
      OR (public.is_co_admin() AND created_by = public.current_marketer_id())
    )
  ) WITH CHECK (
    org_id = public.current_org_id() AND (
      public.is_org_admin()
      OR (public.is_co_admin() AND created_by = public.current_marketer_id())
    )
  );

CREATE POLICY zoom_calls_delete ON public.zoom_calls
  FOR DELETE USING (
    org_id = public.current_org_id() AND (
      public.is_org_admin()
      OR (public.is_co_admin() AND created_by = public.current_marketer_id())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zoom_calls TO authenticated;

-- Seed the 3 historical fixed calls as org-wide defaults (idempotent per org).
INSERT INTO public.zoom_calls (org_id, title, weekday, scope, created_by)
SELECT o.id, v.title, v.weekday, 'org', NULL
FROM public.organizations o
CROSS JOIN (VALUES ('Wake Up Call', 1), ('Golden Call', 4), ('Join The Dream', 0)) AS v(title, weekday)
WHERE NOT EXISTS (
  SELECT 1 FROM public.zoom_calls c WHERE c.org_id = o.id AND c.title = v.title
);

-- zoom_attendance now references a dynamic call by id.
ALTER TABLE public.zoom_attendance ADD COLUMN IF NOT EXISTS call_id uuid REFERENCES public.zoom_calls(id) ON DELETE CASCADE;

-- Backfill existing attendance to the seeded call rows.
UPDATE public.zoom_attendance za
SET call_id = c.id
FROM public.zoom_calls c
WHERE za.call_id IS NULL
  AND c.org_id = za.org_id
  AND c.title = CASE za.call
    WHEN 'wake_up'        THEN 'Wake Up Call'
    WHEN 'golden'         THEN 'Golden Call'
    WHEN 'join_the_dream' THEN 'Join The Dream'
    ELSE NULL
  END;

-- New rows key on call_id; legacy text column becomes optional.
ALTER TABLE public.zoom_attendance ALTER COLUMN call DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS zoom_attendance_call_id_uq
  ON public.zoom_attendance (org_id, marketer_id, call_date, call_id);
