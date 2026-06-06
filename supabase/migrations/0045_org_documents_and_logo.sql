-- 0045: org logo + admin-managed downloadable documents (Informativa) + storage.

-- (a) Org logo url (shown in the sidebar brand next to the org name).
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_url text;

-- (b) org_documents — downloadable files managed by admin (org-wide) and
-- co-admins (team scope, branch-filtered). Mirrors the zoom_calls visibility model.
CREATE TABLE IF NOT EXISTS public.org_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  file_path text NOT NULL,
  file_url text NOT NULL,
  scope text NOT NULL DEFAULT 'org' CHECK (scope IN ('org','team')),
  team_branch text CHECK (team_branch IN ('left','right','all')),
  created_by uuid REFERENCES public.marketers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_documents_select ON public.org_documents
  FOR SELECT TO authenticated USING (
    org_id = public.current_org_id() AND (
      public.is_org_admin()
      OR scope = 'org'
      OR created_by = public.current_marketer_id()
      OR (scope = 'team' AND EXISTS (
        SELECT 1 FROM public.marketer_tree_closure c
        WHERE c.org_id = org_documents.org_id
          AND c.ancestor_id = org_documents.created_by
          AND c.descendant_id = public.current_marketer_id()
          AND c.depth >= 1
          AND (COALESCE(org_documents.team_branch,'all') = 'all'
               OR (org_documents.team_branch = 'left'  AND c.branch_leg = 'LEFT')
               OR (org_documents.team_branch = 'right' AND c.branch_leg = 'RIGHT'))
      ))
    )
  );

CREATE POLICY org_documents_insert ON public.org_documents
  FOR INSERT TO authenticated WITH CHECK (
    org_id = public.current_org_id() AND public.current_membership_active() AND (
      (public.is_org_admin() AND scope = 'org')
      OR (public.is_co_admin() AND scope = 'team' AND created_by = public.current_marketer_id())
    )
  );

CREATE POLICY org_documents_delete ON public.org_documents
  FOR DELETE TO authenticated USING (
    org_id = public.current_org_id() AND (
      public.is_org_admin()
      OR (public.is_co_admin() AND created_by = public.current_marketer_id())
    )
  );

-- (c) Public storage bucket for org assets (logos + documents).
INSERT INTO storage.buckets (id, name, public)
VALUES ('org-assets', 'org-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users may write to the bucket (app-layer restricts who calls it);
-- reads are public (bucket is public).
DROP POLICY IF EXISTS "org_assets_auth_insert" ON storage.objects;
CREATE POLICY "org_assets_auth_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'org-assets');
DROP POLICY IF EXISTS "org_assets_auth_update" ON storage.objects;
CREATE POLICY "org_assets_auth_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'org-assets') WITH CHECK (bucket_id = 'org-assets');
DROP POLICY IF EXISTS "org_assets_auth_delete" ON storage.objects;
CREATE POLICY "org_assets_auth_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'org-assets');
DROP POLICY IF EXISTS "org_assets_public_read" ON storage.objects;
CREATE POLICY "org_assets_public_read" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'org-assets');
