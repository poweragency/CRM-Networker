-- =============================================================================
-- File 0014 — Notifications (in-app, realtime-subscribed)
-- Purpose: In-app notification inbox (doc 01 §6.7). One row = one notification
--          addressed to ONE marketer profile. Drives the /notifiche surface and
--          is Realtime-subscribed by the frontend. Producers: bottleneck cron,
--          rank-change trigger, monthly-report cron, follow-up enqueuer,
--          invitation flow, generic system messages (notification_type enum).
--          * notifications table (recipient_marketer_id, type, title_it, body_it,
--            payload jsonb, read_at, soft-delete + created_at)
--          * indexes per doc 01 §6.7 (recipient inbox scan; org coverage; FK
--            coverage) + unread partial index
--          * shared set_updated_at() is NOT used — doc 01 §6.7 has NO updated_at
--            column (append-then-mark-read model); only read_at mutates
--          * RLS: ENABLE + FORCE; STRICTLY SELF read (ADR-009 #7):
--            recipient_marketer_id = current_marketer_id(); admins/owners/platform
--            may read the whole org (doc 01 §8). UPDATE limited to flipping
--            read_at on one's OWN rows. INSERT is admin/owner only (members do not
--            hand-author notifications; system producers use the service role,
--            which bypasses RLS).
--          * least-privilege grants
--
-- Depends on: 0001_extensions.sql   (pgcrypto / gen_random_uuid),
--             0002_enums.sql        (notification_type),
--             0003_tenancy_identity.sql (organizations),
--             0004_marketers_tree.sql   (marketers),
--             0005_auth_visibility.sql  (current_org_id, current_marketer_id,
--                                        is_org_admin, current_membership_active)
--
-- NOTES:
--   * Column names follow CANONICAL doc 01 §6.7: title_it / body_it (NOT the
--     brief's shorthand "title / body"). Italian-localized copy is stored ready
--     to render; see manifest `issues`.
--   * The brief's "Index on (recipient, read_at)" is SUPERSET-satisfied by the
--     canonical doc 01 §6.7 composite (org_id, recipient_marketer_id, read_at,
--     created_at DESC) which serves the inbox query (newest-first, unread-first)
--     in one index. A dedicated unread partial index is added for the unread-badge
--     count.
--   * "admins may read org" (doc 01 §8) does NOT contradict ADR-009 #7
--     ("notifications strictly self"): self is the MEMBER rule; the org-wide read
--     is the admin/owner/platform bypass, identical to every other tenant table.
--   * Notifications carry NO audit-actor columns and NO updated_at (doc 01 §6.7).
--     They are producer-written facts; recipients only mark them read/deleted.
--   * No app_private.dirty_metric_days enqueue (ADR-006): notifications are an
--     analytics SINK, never a metrics source.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6.7 notifications — per-marketer in-app notification inbox.
-- -----------------------------------------------------------------------------
CREATE TABLE public.notifications (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- The addressee profile. ON DELETE CASCADE: a marketer's notifications are
  -- meaningless once the profile is gone (hard delete is admin-only & rare).
  recipient_marketer_id  uuid NOT NULL REFERENCES public.marketers(id) ON DELETE CASCADE,

  type                   notification_type NOT NULL,
  title_it               text NOT NULL,                 -- Italian short title (rendered as-is)
  body_it                text,                          -- optional Italian body
  payload                jsonb NOT NULL DEFAULT '{}'::jsonb,  -- deep-link refs (prospect_id, report_id, …)

  read_at                timestamptz,                   -- NULL = unread
  created_at             timestamptz NOT NULL DEFAULT now(),
  deleted_at             timestamptz                    -- recipient-dismissed; soft delete
);

COMMENT ON TABLE public.notifications IS
  'In-app notifications, one row per addressee (doc 01 §6.7). Realtime-subscribed. Visibility is STRICTLY SELF (recipient_marketer_id = current_marketer_id), ADR-009 #7; admins/owners/platform read org-wide.';
COMMENT ON COLUMN public.notifications.recipient_marketer_id IS
  'The single addressee profile. RLS read key: recipient_marketer_id = current_marketer_id() (strictly self), with admin/owner/platform org-wide bypass.';
COMMENT ON COLUMN public.notifications.type IS
  'notification_type enum: follow_up_due, rank_changed, bottleneck_alert, monthly_report_ready, invitation, system.';
COMMENT ON COLUMN public.notifications.payload IS
  'jsonb deep-link references (e.g. {"prospect_id":…, "report_id":…}) for the frontend to route on click. Defaults to {}.';
COMMENT ON COLUMN public.notifications.read_at IS
  'NULL = unread. The only column a recipient may mutate (mark-read), enforced by the update policy WITH CHECK.';
COMMENT ON COLUMN public.notifications.deleted_at IS
  'Soft delete: recipient dismissed the notification. Active rows = deleted_at IS NULL.';

-- -----------------------------------------------------------------------------
-- Indexes (doc 01 §6.7 + FK / org_id coverage).
-- -----------------------------------------------------------------------------
-- Canonical inbox index: scan a recipient's notifications newest-first, with
-- read_at leading so unread-first / unread-count queries stay index-only.
-- (Brief's "(recipient, read_at)" is a strict prefix of this — covered.)
CREATE INDEX notifications_recipient_inbox_idx
  ON public.notifications (org_id, recipient_marketer_id, read_at, created_at DESC);

-- Unread badge: count/list a recipient's UNREAD, undeleted notifications cheaply.
CREATE INDEX notifications_unread_idx
  ON public.notifications (org_id, recipient_marketer_id, created_at DESC)
  WHERE read_at IS NULL AND deleted_at IS NULL;

-- Tenant-wide org scan coverage (admin org-wide reads / housekeeping prune).
CREATE INDEX notifications_org_idx
  ON public.notifications (org_id, created_at DESC);

-- =============================================================================
-- Row-Level Security
-- ENABLE + FORCE; tenant isolation via current_org_id(); visibility is STRICTLY
-- SELF (recipient_marketer_id = current_marketer_id()), ADR-009 #7. Admin/owner/
-- platform read the whole org (is_org_admin() bypass). System producers run as
-- the service role (BYPASSRLS) so cron/Edge can write to any recipient.
-- =============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE  ROW LEVEL SECURITY;

-- READ: strictly the caller's OWN notifications; admins/owners/platform see org.
-- NOTE: this intentionally does NOT use can_see_marketer() — a notification is a
-- private message to its recipient, so an upline must NOT read a downline's inbox.
CREATE POLICY notifications_select ON public.notifications
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR recipient_marketer_id = public.current_marketer_id()
  )
);

-- INSERT: admin/owner/platform only (e.g. an admin broadcasting a system notice).
-- Day-to-day producers (bottleneck/report/follow-up cron, rank trigger, invitation
-- flow) write via the service role, which bypasses RLS entirely. Members never
-- author notifications. WITH CHECK keeps the row tenant-scoped; the live
-- membership re-check defeats stale / suspended JWTs.
CREATE POLICY notifications_insert ON public.notifications
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND public.is_org_admin()
);

-- UPDATE: a recipient may mutate ONLY their own row, and only to mark it
-- read/dismissed — the WITH CHECK forbids re-targeting it to a different
-- recipient or moving it to another org. Admins/owners may update org-wide.
CREATE POLICY notifications_update ON public.notifications
FOR UPDATE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR recipient_marketer_id = public.current_marketer_id()
  )
)
WITH CHECK (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR recipient_marketer_id = public.current_marketer_id()
  )
);

-- DELETE: a hard DELETE is allowed for one's OWN notifications (soft-delete via
-- deleted_at is the UPDATE path; a member may also purge). Admins/owners may
-- delete org-wide (housekeeping / prune).
CREATE POLICY notifications_delete ON public.notifications
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND (
        public.is_org_admin()
     OR recipient_marketer_id = public.current_marketer_id()
  )
);

-- -----------------------------------------------------------------------------
-- Least-privilege table grants (doc 10 §4.2). RLS narrows further. The service
-- role used by cron/Edge producers bypasses RLS and needs no explicit grant here.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
