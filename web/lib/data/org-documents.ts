import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';

/**
 * Org documents (Informativa) data access — admin-managed downloadable files.
 * Mirrors the zoom_calls model: admins publish org-wide files, co-admins publish
 * team files (branch-filtered to their downline). Visibility + write permissions
 * are RLS-enforced (see migration 0045). Demo-safe (no env → empty + simulated).
 *
 * The file bytes live in the public `org-assets` storage bucket; rows store the
 * storage path + public URL. Uploads happen client-side (browser client) to keep
 * large files off the server-action body; only metadata flows through the action.
 */

export interface OrgDocument {
  id: string;
  title: string;
  file_url: string;
  file_path: string;
  scope: 'org' | 'team';
  team_branch: 'left' | 'right' | 'all' | null;
  created_by: string | null;
  created_by_name: string | null;
}

const SELECT =
  'id,title,file_url,file_path,scope,team_branch,created_by, creator:created_by(display_name)';

/** Documents visible to the caller (RLS: org-wide + team docs targeting them). */
export async function listOrgDocuments(): Promise<{ data: OrgDocument[]; demo: boolean }> {
  const supabase = getClient();
  if (!supabase) return { data: [], demo: true };
  try {
    const { data } = await supabase
      .from('org_documents')
      .select(SELECT)
      .order('created_at', { ascending: false });
    const rows = ((data as Record<string, unknown>[] | null) ?? []).map((r) => {
      const cr = (r.creator ?? null) as { display_name?: string } | null;
      return {
        id: String(r.id),
        title: String(r.title),
        file_url: String(r.file_url),
        file_path: String(r.file_path),
        scope: (r.scope as 'org' | 'team') ?? 'org',
        team_branch: (r.team_branch as 'left' | 'right' | 'all' | null) ?? null,
        created_by: (r.created_by as string | null) ?? null,
        created_by_name: cr?.display_name ?? null,
      } satisfies OrgDocument;
    });
    return { data: rows, demo: false };
  } catch {
    return { data: [], demo: false };
  }
}

export interface CreateDocInput {
  title: string;
  file_path: string;
  file_url: string;
  scope: 'org' | 'team';
  /** Only for team scope: which branch of the downline. */
  team_branch?: 'left' | 'right' | 'all' | null;
}

export interface DocResult {
  ok: boolean;
  demo: boolean;
}

/** Insert a document row. Org scope → created_by null; team → owned by caller. */
export async function createOrgDocument(input: CreateDocInput): Promise<DocResult> {
  const supabase = getClient();
  if (!supabase) return { ok: true, demo: true };
  try {
    const { orgId, marketerId } = await getOwnerContext();
    const createdBy = input.scope === 'team' ? marketerId : null;
    const teamBranch = input.scope === 'team' ? input.team_branch ?? 'all' : null;
    const { error } = await supabase.from('org_documents').insert({
      org_id: orgId,
      title: input.title,
      file_path: input.file_path,
      file_url: input.file_url,
      scope: input.scope,
      team_branch: teamBranch,
      created_by: createdBy,
    });
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}

/** Delete a document (RLS: admin any; co-admin own) + remove the stored file. */
export async function deleteOrgDocument(id: string, filePath?: string): Promise<DocResult> {
  const supabase = getClient();
  if (!supabase) return { ok: true, demo: true };
  try {
    const { error } = await supabase.from('org_documents').delete().eq('id', id);
    if (error) return { ok: false, demo: false };
    if (filePath) {
      // Best-effort storage cleanup (row already gone if we got here).
      await supabase.storage.from('org-assets').remove([filePath]);
    }
    return { ok: true, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}
