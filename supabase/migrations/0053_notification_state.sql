-- 0053: per-recipient read/dismiss state for the DERIVED notifications (birthday /
-- new_member). They have no stored row, so this table records, by stable key, when
-- the caller marked one read or dismissed it — making the inbox actually clearable.
CREATE TABLE IF NOT EXISTS public.notification_state (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_marketer_id uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,
  notif_key text NOT NULL,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (recipient_marketer_id, notif_key)
);

ALTER TABLE public.notification_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_state FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_state_select ON public.notification_state
  FOR SELECT TO authenticated
  USING (org_id = public.current_org_id() AND recipient_marketer_id = public.current_marketer_id());

CREATE POLICY notification_state_insert ON public.notification_state
  FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_org_id() AND recipient_marketer_id = public.current_marketer_id());

CREATE POLICY notification_state_update ON public.notification_state
  FOR UPDATE TO authenticated
  USING (org_id = public.current_org_id() AND recipient_marketer_id = public.current_marketer_id())
  WITH CHECK (org_id = public.current_org_id() AND recipient_marketer_id = public.current_marketer_id());

GRANT SELECT, INSERT, UPDATE ON public.notification_state TO authenticated;
