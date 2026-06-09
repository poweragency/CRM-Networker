import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import type { ZoomCallDef } from '@/lib/data/attendance-shared';

/**
 * Zoom call definitions management (server-only) for the settings "Call" card.
 * Visibility + write permissions are RLS-enforced (admin → org/all; co-admin →
 * own team calls). Demo-safe.
 */

export async function listManageableCalls(): Promise<{ data: ZoomCallDef[]; demo: boolean }> {
  const supabase = getClient();
  if (!supabase) return { data: [], demo: true };
  try {
    const { data } = await supabase
      .from('zoom_calls')
      .select('id,title,weekday,start_time,scope,team_branch,created_by, creator:created_by(display_name)')
      .eq('active', true);
    const rows = ((data as Record<string, unknown>[] | null) ?? [])
      .map((r) => {
        const cr = (r.creator ?? null) as { display_name?: string } | null;
        return {
          id: String(r.id),
          title: String(r.title),
          weekday: Number(r.weekday),
          start_time: (r.start_time as string | null) ?? null,
          scope: (r.scope as 'org' | 'team') ?? 'org',
          team_branch: (r.team_branch as 'left' | 'right' | 'all' | null) ?? null,
          created_by: (r.created_by as string | null) ?? null,
          created_by_name: cr?.display_name ?? null,
        } satisfies ZoomCallDef;
      })
      .sort((a, b) => a.weekday - b.weekday || (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.title.localeCompare(b.title, 'it'));
    return { data: rows, demo: false };
  } catch {
    return { data: [], demo: false };
  }
}

export interface CallInput {
  title: string;
  weekday: number;
  start_time: string | null;
  scope: 'org' | 'team';
  /** Only for team scope: which branch of the downline ('all' | 'left' | 'right'). */
  team_branch?: 'left' | 'right' | 'all' | null;
}

export interface CallResult {
  ok: boolean;
  demo: boolean;
}

/** Create a call. Org scope → created_by null; team scope → owned by the caller. */
export async function createZoomCall(input: CallInput): Promise<CallResult> {
  const supabase = getClient();
  // Time is mandatory (admin + co-admin) — enforced here too, not just in the UI.
  if (!input.start_time || !input.start_time.trim()) {
    return { ok: false, demo: !supabase };
  }
  if (!supabase) return { ok: true, demo: true };
  try {
    const { orgId, marketerId } = await getOwnerContext();
    const createdBy = input.scope === 'team' ? marketerId : null;
    const teamBranch = input.scope === 'team' ? input.team_branch ?? 'all' : null;
    const { error } = await supabase.from('zoom_calls').insert({
      org_id: orgId,
      title: input.title,
      weekday: input.weekday,
      start_time: input.start_time,
      scope: input.scope,
      team_branch: teamBranch,
      created_by: createdBy,
    });
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}

/** Update a call's start time (RLS: admin any; co-admin own). Lets admins/co-admins
 *  backfill the orario on calls created before it became mandatory. */
export async function updateZoomCallStartTime(
  id: string,
  startTime: string,
): Promise<CallResult> {
  const supabase = getClient();
  if (!supabase) return { ok: true, demo: true };
  if (!startTime || !startTime.trim()) return { ok: false, demo: !supabase };
  try {
    const { error } = await supabase
      .from('zoom_calls')
      .update({ start_time: startTime })
      .eq('id', id);
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}

/** Delete a call (RLS: admin any; co-admin own). */
export async function deleteZoomCall(id: string): Promise<CallResult> {
  const supabase = getClient();
  if (!supabase) return { ok: true, demo: true };
  try {
    const { error } = await supabase.from('zoom_calls').delete().eq('id', id);
    return { ok: !error, demo: false };
  } catch {
    return { ok: false, demo: false };
  }
}
