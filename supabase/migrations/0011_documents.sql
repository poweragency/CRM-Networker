-- =============================================================================
-- File 0011 — Internal documents (structured rich-text knowledge base)
-- Purpose: The internal structured knowledge base (doc 01 §4.4). Rich-text only,
--          NO file uploads. Categories + status (draft/published/archived), full
--          version history, and duplicate support.
--          * internal_documents (title, category enum, status enum, body jsonb
--            (ProseMirror/Tiptap — ADR-009 #5), current_version, duplicated_from_id
--            provenance, tags text[], author/editor audit cols, archived_at,
--            soft-delete)
--          * document_versions (document_id, version_no, title, body jsonb,
--            change_note, edited_by, created_at; UNIQUE(document_id, version_no))
--          * indexes per doc 01 §4.4
--          * shared set_updated_at() trigger
--          * documents_snapshot_version() BEFORE UPDATE trigger: snapshots the
--            PRIOR (title, body) into document_versions and increments
--            current_version whenever body or title changes (doc 01 §4.4)
--          * save_document_version() — explicit "save a new version" RPC
--          * duplicate_document() — "Duplicate" RPC (provenance via duplicated_from_id)
--          * current_can_access_crm() / current_can_manage_documents() claim helpers
--          * RLS: ENABLE + FORCE. READ org-wide for CRM-eligible members
--            (crm_access claim OR admin/platform). WRITE/EDIT gated by
--            permissions->>'manage_documents' = true OR admin. Versions inherit
--            the parent document's visibility (read-only to users; trigger/RPC-written).
--          * least-privilege grants
--
-- Depends on: 0001_extensions.sql (pgcrypto/gen_random_uuid),
--             0002_enums.sql (document_category, document_status),
--             0003_tenancy_identity.sql (organizations, memberships, set_updated_at),
--             0004_marketers_tree.sql (marketers),
--             0005_auth_visibility.sql (current_org_id, current_marketer_id,
--             is_org_admin, is_platform_admin, current_membership_active)
--
-- ADR-009 #5: rich-text editor = Tiptap/ProseMirror; body is stored as ProseMirror
--             JSON (jsonb). No file uploads.
-- ADR-009 #7: internal documents are ORG-WIDE for CRM-eligible members (read);
--             write/edit gated by manage_documents permission OR admin.
--
-- NAMING NOTE (see issues): the canonical claim set (ADR-007) does NOT carry the
-- per-membership `permissions` object, so the write-gate cannot read
-- manage_documents from auth.jwt(). current_can_manage_documents() therefore live-
-- reads memberships.permissions (SECURITY DEFINER), mirroring assert_caller_active()
-- in 0005. The crm_access flag IS a top-level claim, so the read-gate reads it
-- directly from the JWT.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Claim / live-permission helpers used by the documents RLS policies.
-- -----------------------------------------------------------------------------

-- CRM-eligibility read gate (ADR-009 #7). True when the JWT crm_access claim is
-- set (the access-token hook derives it from ranks_meta.crm_eligible OR the
-- membership crm_access override — see 0005), OR the caller is admin/owner/platform.
CREATE OR REPLACE FUNCTION public.current_can_access_crm()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE((auth.jwt() ->> 'crm_access')::boolean, false)
      OR public.is_org_admin();
$$;

COMMENT ON FUNCTION public.current_can_access_crm() IS
  'Read gate for CRM-eligible surfaces: true if the crm_access JWT claim is set (hook-derived from ranks_meta.crm_eligible or the membership override) or the caller is admin/owner/platform. Used by internal_documents org-wide read (ADR-009 #7).';

-- manage_documents write gate. The permissions object is NOT in the JWT claim set
-- (ADR-007), so this live-reads memberships.permissions for the calling login in
-- the current org. SECURITY DEFINER to read memberships without recursing into its
-- RLS; re-applies the tenant filter internally. Admin/owner/platform always pass.
CREATE OR REPLACE FUNCTION public.current_can_manage_documents()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_org_admin()
      OR EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = auth.uid()
          AND m.org_id  = public.current_org_id()
          AND m.status  = 'active'
          AND m.deleted_at IS NULL
          AND COALESCE((m.permissions ->> 'manage_documents')::boolean, false)
      );
$$;

COMMENT ON FUNCTION public.current_can_manage_documents() IS
  'Write/edit gate for internal_documents (ADR-009 #7): true if the caller is admin/owner/platform OR their active membership carries permissions->>manage_documents = true. SECURITY DEFINER live-read of memberships (manage_documents is not a JWT claim); re-applies tenant filter.';

REVOKE EXECUTE ON FUNCTION public.current_can_manage_documents() FROM public;
GRANT  EXECUTE ON FUNCTION public.current_can_manage_documents() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4.4 internal_documents — structured rich-text knowledge base.
-- body is ProseMirror/Tiptap JSON (ADR-009 #5). current_version mirrors the
-- highest document_versions.version_no. duplicated_from_id records "Duplicate"
-- provenance. archived_at is set when status -> 'archived'.
-- -----------------------------------------------------------------------------
CREATE TABLE public.internal_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title              text NOT NULL,
  category           document_category NOT NULL DEFAULT 'altro',
  status             document_status   NOT NULL DEFAULT 'draft',
  body               jsonb NOT NULL DEFAULT '{}'::jsonb,  -- ProseMirror/Tiptap JSON (ADR-009 #5)
  current_version    int  NOT NULL DEFAULT 1,
  duplicated_from_id uuid REFERENCES public.internal_documents(id),  -- provenance for "Duplicate"
  tags               text[] NOT NULL DEFAULT '{}',
  created_by         uuid REFERENCES public.marketers(id),  -- author profile
  updated_by         uuid REFERENCES public.marketers(id),  -- last editor profile
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  archived_at        timestamptz,
  deleted_at         timestamptz,

  CONSTRAINT internal_documents_current_version_positive CHECK (current_version >= 1)
);

COMMENT ON TABLE public.internal_documents IS
  'Internal structured knowledge base (doc 01 §4.4). Rich-text only (body = ProseMirror/Tiptap JSON, ADR-009 #5); NO file uploads. Org-wide read for CRM-eligible members (ADR-009 #7); write gated by manage_documents permission OR admin. Full version history in document_versions.';
COMMENT ON COLUMN public.internal_documents.body IS
  'Rich-text document model: ProseMirror/Tiptap JSON (ADR-009 #5). Export-to-PDF renders from this model. No file uploads.';
COMMENT ON COLUMN public.internal_documents.current_version IS
  'Highest version_no in document_versions for this document. Incremented by documents_snapshot_version() when title/body changes, and by save_document_version().';
COMMENT ON COLUMN public.internal_documents.duplicated_from_id IS
  'Provenance: the source document this one was duplicated from (set by duplicate_document()). NULL for originals.';
COMMENT ON COLUMN public.internal_documents.created_by IS
  'Author marketer profile (acting profile per doc 01 §0 Audit columns). Nullable for system-created docs.';

-- -----------------------------------------------------------------------------
-- document_versions — immutable snapshots of prior (title, body) states.
-- One row per (document_id, version_no). edited_by = the profile that produced
-- the snapshot. Written ONLY by the snapshot trigger / save_document_version().
-- -----------------------------------------------------------------------------
CREATE TABLE public.document_versions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id   uuid NOT NULL REFERENCES public.internal_documents(id) ON DELETE CASCADE,
  version_no    int  NOT NULL,
  title         text NOT NULL,
  body          jsonb NOT NULL,
  change_note   text,
  created_by    uuid REFERENCES public.marketers(id),  -- edited_by: profile that authored this snapshot
  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT document_versions_doc_version_uq UNIQUE (document_id, version_no),
  CONSTRAINT document_versions_version_no_positive CHECK (version_no >= 1)
);

COMMENT ON TABLE public.document_versions IS
  'Immutable version snapshots of internal_documents (doc 01 §4.4). One row per (document_id, version_no). Written only by documents_snapshot_version() trigger and save_document_version(); inherits the parent document''s read visibility. No UPDATE/DELETE for users.';
COMMENT ON COLUMN public.document_versions.created_by IS
  'edited_by: the marketer profile that produced this version snapshot.';

-- -----------------------------------------------------------------------------
-- Indexes (doc 01 §4.4).
-- -----------------------------------------------------------------------------
-- Category/status listing for active documents.
CREATE INDEX internal_documents_cat_idx
  ON public.internal_documents (org_id, category, status)
  WHERE deleted_at IS NULL;

-- Tag filtering (text[] array).
CREATE INDEX internal_documents_tags_gin
  ON public.internal_documents USING gin (tags);

-- Tenant scan / FK support.
CREATE INDEX internal_documents_org_idx
  ON public.internal_documents (org_id);

-- Author lookup ("my documents").
CREATE INDEX internal_documents_created_by_idx
  ON public.internal_documents (org_id, created_by);

-- Duplicate-provenance traversal.
CREATE INDEX internal_documents_dup_from_idx
  ON public.internal_documents (duplicated_from_id)
  WHERE duplicated_from_id IS NOT NULL;

-- Version history (latest first) per document; also FK support.
CREATE INDEX document_versions_doc_idx
  ON public.document_versions (document_id, version_no DESC);

-- Tenant scan / FK support.
CREATE INDEX document_versions_org_idx
  ON public.document_versions (org_id);

-- -----------------------------------------------------------------------------
-- updated_at maintenance — shared trigger.
-- -----------------------------------------------------------------------------
CREATE TRIGGER trg_internal_documents_updated_at
  BEFORE UPDATE ON public.internal_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Version snapshotting (doc 01 §4.4)
-- A BEFORE UPDATE trigger on internal_documents snapshots the PRIOR (title, body)
-- into document_versions and increments current_version whenever body or title
-- changes. Snapshotting the OLD state means document_versions always holds the
-- complete history of superseded states; the live (newest) state stays on the
-- document row. archived_at is kept in sync with status here as well.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.documents_snapshot_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_change_note text;
BEGIN
  -- Keep archived_at consistent with status transitions.
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    NEW.archived_at := COALESCE(NEW.archived_at, now());
  ELSIF NEW.status <> 'archived' AND OLD.status = 'archived' THEN
    NEW.archived_at := NULL;
  END IF;

  -- Only snapshot + bump version when the editable content actually changed.
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body THEN

    -- Optional change note passed by save_document_version() via a txn-local GUC
    -- (NULL for plain UPDATEs / direct edits). current_setting(..., true) returns
    -- NULL when unset instead of erroring.
    v_change_note := NULLIF(current_setting('app.document_change_note', true), '');

    -- Snapshot the PRIOR state at the document's current_version number. The
    -- UNIQUE(document_id, version_no) constraint guarantees we never double-write
    -- the same version. SECURITY DEFINER lets this write the history row even
    -- though document_versions has no user-facing write policy.
    INSERT INTO public.document_versions
      (org_id, document_id, version_no, title, body, change_note, created_by)
    VALUES
      (OLD.org_id, OLD.id, OLD.current_version, OLD.title, OLD.body, v_change_note,
       COALESCE(NEW.updated_by, OLD.updated_by))
    ON CONFLICT (document_id, version_no) DO NOTHING;

    -- Advance the live version pointer.
    NEW.current_version := OLD.current_version + 1;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.documents_snapshot_version() IS
  'BEFORE UPDATE on internal_documents (doc 01 §4.4): when title/body change, snapshot the PRIOR (title, body) into document_versions at OLD.current_version and bump NEW.current_version. Also keeps archived_at in sync with status. Idempotent via UNIQUE(document_id, version_no).';

-- Runs BEFORE the shared set_updated_at trigger by alphabetical trigger-name
-- ordering ('trg_internal_documents_snapshot' < 'trg_internal_documents_updated_at'),
-- which is fine: both are BEFORE UPDATE row triggers and order is independent here.
CREATE TRIGGER trg_internal_documents_snapshot
  BEFORE UPDATE ON public.internal_documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_snapshot_version();

-- =============================================================================
-- save_document_version() — explicit "save a new version" RPC.
-- Applies new (title, body) to the document; the BEFORE UPDATE snapshot trigger
-- records the prior state (with the supplied change_note, passed via a txn-local
-- GUC) and bumps current_version. Returns the NEW current_version.
-- SECURITY INVOKER: the UPDATE on internal_documents goes through RLS, so the
-- manage_documents/admin write gate is enforced for the caller. The version row
-- itself is written by the SECURITY DEFINER trigger (no user write policy needed).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.save_document_version(
  p_document_id uuid,
  p_title       text,
  p_body        jsonb,
  p_change_note text DEFAULT NULL,
  p_editor_id   uuid DEFAULT NULL   -- acting marketer profile (edited_by); defaults to caller's
) RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_ver    int;
  v_new_ver     int;
  v_editor      uuid := COALESCE(p_editor_id, public.current_marketer_id());
BEGIN
  -- Read the current state (RLS on internal_documents bounds visibility; the
  -- UPDATE below additionally enforces the manage_documents/admin write gate).
  SELECT current_version
    INTO v_prev_ver
  FROM public.internal_documents
  WHERE id = p_document_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'save_document_version: document % not found or not visible', p_document_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Hand the change note to the snapshot trigger via a transaction-local setting
  -- (cleared right after the UPDATE so it never leaks to unrelated edits).
  PERFORM set_config('app.document_change_note', COALESCE(p_change_note, ''), true);

  -- Apply the edit. The snapshot trigger fires on this UPDATE: it writes the prior
  -- (title, body, change_note) into document_versions at v_prev_ver and sets
  -- current_version to v_prev_ver + 1 (only if title/body actually changed).
  UPDATE public.internal_documents
  SET title      = p_title,
      body       = p_body,
      updated_by = v_editor
  WHERE id = p_document_id;

  -- Reset the GUC so a later plain UPDATE in the same txn does not inherit the note.
  PERFORM set_config('app.document_change_note', '', true);

  SELECT current_version INTO v_new_ver
  FROM public.internal_documents
  WHERE id = p_document_id;

  RETURN v_new_ver;  -- equals v_prev_ver when nothing changed (no version created)
END;
$$;

COMMENT ON FUNCTION public.save_document_version(uuid, text, jsonb, text, uuid) IS
  'Saves a new version of an internal document: applies (title, body) (passing change_note to the snapshot trigger via a txn-local GUC), letting the trigger record the prior state and bump current_version. Returns the new current_version. SECURITY INVOKER — RLS enforces the manage_documents/admin write gate on the document UPDATE.';

-- =============================================================================
-- duplicate_document() — "Duplicate" RPC.
-- Creates a fresh document copying title/category/body/tags from the source, with
-- status reset to 'draft', current_version = 1, duplicated_from_id = source, and a
-- new author. Returns the new document id. SECURITY INVOKER so RLS gates both the
-- source read and the insert (manage_documents OR admin).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.duplicate_document(
  p_source_id  uuid,
  p_new_title  text DEFAULT NULL,   -- defaults to source title + ' (copia)'
  p_author_id  uuid DEFAULT NULL    -- acting marketer profile; defaults to caller's
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_src       public.internal_documents%ROWTYPE;
  v_new_id    uuid;
  v_author    uuid := COALESCE(p_author_id, public.current_marketer_id());
BEGIN
  -- Read the source (RLS bounds visibility to readable docs).
  SELECT * INTO v_src
  FROM public.internal_documents
  WHERE id = p_source_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'duplicate_document: source document % not found or not visible', p_source_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Insert the copy as a fresh draft (RLS WITH CHECK enforces the write gate).
  INSERT INTO public.internal_documents
    (org_id, title, category, status, body, current_version,
     duplicated_from_id, tags, created_by, updated_by)
  VALUES
    (v_src.org_id,
     COALESCE(p_new_title, v_src.title || ' (copia)'),
     v_src.category,
     'draft',
     v_src.body,
     1,
     v_src.id,
     v_src.tags,
     v_author,
     v_author)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.duplicate_document(uuid, text, uuid) IS
  'Duplicates an internal document: copies title/category/body/tags into a fresh draft (status=draft, current_version=1, duplicated_from_id=source). Returns the new id. SECURITY INVOKER — RLS gates the source read and the insert (manage_documents/admin).';

-- =============================================================================
-- Row-Level Security
-- ENABLE + FORCE on both tables.
-- READ:  org-wide for CRM-eligible members (current_can_access_crm()).
-- WRITE: manage_documents permission OR admin (current_can_manage_documents()).
-- Versions: read inherits the parent document's read gate; never user-written.
-- =============================================================================
ALTER TABLE public.internal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_documents FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.document_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_versions  FORCE  ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- internal_documents
-- -----------------------------------------------------------------------------
-- READ: any CRM-eligible member of the org (ADR-009 #7). Documents are org-wide
-- knowledge, NOT closure-scoped. Soft-deleted rows are hidden from everyone.
CREATE POLICY internal_documents_select ON public.internal_documents
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND deleted_at IS NULL
  AND public.current_can_access_crm()
);

-- INSERT: create a document in the caller's org; gated by manage_documents OR
-- admin. Live active-membership re-check defeats stale/suspended JWTs.
CREATE POLICY internal_documents_insert ON public.internal_documents
FOR INSERT TO authenticated
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_membership_active()
  AND public.current_can_manage_documents()
);

-- UPDATE: edit/publish/archive/soft-delete a document; gated by manage_documents
-- OR admin. WITH CHECK keeps the row in the caller's org.
CREATE POLICY internal_documents_update ON public.internal_documents
FOR UPDATE TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.current_can_manage_documents()
)
WITH CHECK (
  org_id = public.current_org_id()
  AND public.current_can_manage_documents()
);

-- DELETE: hard delete reserved to manage_documents/admin within the org. (Routine
-- removal is a soft-delete via UPDATE deleted_at.)
CREATE POLICY internal_documents_delete ON public.internal_documents
FOR DELETE TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.current_can_manage_documents()
);

-- -----------------------------------------------------------------------------
-- document_versions — read inherits the parent document's read gate; write is
-- trigger/RPC-only (no INSERT/UPDATE/DELETE policy for authenticated). The
-- snapshot trigger and RPCs run with sufficient rights (SECURITY DEFINER trigger;
-- RPC inserts the version under the document owner's write path) so users never
-- write versions directly.
-- -----------------------------------------------------------------------------
CREATE POLICY document_versions_select ON public.document_versions
FOR SELECT TO authenticated
USING (
  org_id = public.current_org_id()
  AND public.current_can_access_crm()
  AND EXISTS (
    SELECT 1 FROM public.internal_documents d
    WHERE d.id = document_versions.document_id
      AND d.org_id = public.current_org_id()
      AND d.deleted_at IS NULL
  )
);
-- No INSERT/UPDATE/DELETE policy: versions are immutable and system-written.

-- -----------------------------------------------------------------------------
-- Least-privilege table grants (doc 10 §4.2). RLS narrows further.
-- internal_documents: full CRUD (RLS/permission-bound).
-- document_versions: read-only to users. Version rows are written exclusively by
--   the SECURITY DEFINER snapshot trigger (which bypasses RLS), so no INSERT/
--   UPDATE/DELETE is granted and no version write policy exists — versions are
--   immutable from the user's perspective.
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_documents TO authenticated;
GRANT SELECT ON public.document_versions TO authenticated;
