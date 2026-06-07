import 'server-only';
import type {
  MarketerExtra,
  MarketerRank,
  MarketerStatus,
  Occupation,
  StartingPackage,
  TeamMemberProfile,
  TeamMemberRow,
} from '@/lib/types/db';
import { getNode } from '@/lib/data/genealogy';
import { listMarketers } from '@/lib/data/admin';
import { fetchAllRows, getClient, getOwnerContext } from '@/lib/data/crm-shared';
import { logError } from '@/lib/log';
import { setMarketerIdentity } from '@/lib/data/mock/runtime';
import { mockExtra } from '@/lib/data/mock/team';

/**
 * Team-member profile data access (server-only). The anagrafica extras (pacchetto,
 * addon, click, telefono, città, regione, data di nascita, occupazione, note) are
 * REAL columns on `marketers` (RLS-scoped to the caller's visible subtree), so the
 * profile, the roster and the tree all read the same source. In pure demo mode (no
 * env) a deterministic default + an in-memory override map are used. Never throws.
 */

export interface TeamResult<T> {
  data: T;
  demo: boolean;
}

/** In-memory edit store (demo-only; resets on server restart). */
const overrides = new Map<string, Partial<MarketerExtra>>();

const EMPTY_EXTRA: MarketerExtra = {
  starting_package: null,
  addon: null,
  platform_click: false,
  phone: null,
  city: null,
  region: null,
  birth_date: null,
  occupation: null,
  notes: null,
};

const EXTRA_COLS =
  'id,starting_package,addon,platform_click,phone,city,region,birth_date,occupation,notes';
/** Editable anagrafica keys = the marketers columns we map a patch onto. */
const EXTRA_KEYS: readonly (keyof MarketerExtra)[] = [
  'starting_package',
  'addon',
  'platform_click',
  'phone',
  'city',
  'region',
  'birth_date',
  'occupation',
  'notes',
];

function rowToExtra(r: Record<string, unknown>): MarketerExtra {
  return {
    starting_package: (r.starting_package as StartingPackage | null) ?? null,
    addon: (r.addon as string | null) ?? null,
    platform_click: Boolean(r.platform_click),
    phone: (r.phone as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    region: (r.region as string | null) ?? null,
    birth_date: (r.birth_date as string | null) ?? null,
    occupation: (r.occupation as Occupation | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

/** Fetch the anagrafica extras for a set of marketers in one query (DB only). */
async function fetchExtras(ids: string[]): Promise<Map<string, MarketerExtra>> {
  const map = new Map<string, MarketerExtra>();
  const supabase = getClient();
  if (!supabase || ids.length === 0) return map;
  try {
    const { data } = await supabase.from('marketers').select(EXTRA_COLS).in('id', ids);
    for (const r of (data as Record<string, unknown>[] | null) ?? []) {
      map.set(String(r.id), rowToExtra(r));
    }
  } catch {
    /* leave map empty */
  }
  return map;
}

/** Demo-only resolver (mock default + in-memory override). */
function resolveExtra(id: string): MarketerExtra {
  const base = mockExtra(id);
  const ov = overrides.get(id);
  return ov ? { ...base, ...ov } : base;
}

/** The team roster: one compact row per marketer, clickable → /team/[id]. */
export async function listTeamMembers(): Promise<TeamResult<TeamMemberRow[]>> {
  const { marketerId: selfId } = await getOwnerContext();
  const supabase = getClient();

  // Demo (no env): mock rows + the in-memory extra resolver.
  if (!supabase) {
    const { data } = await listMarketers();
    const rows: TeamMemberRow[] = data
      .filter((m) => m.id !== selfId)
      .map((m) => {
        const ex = resolveExtra(m.id);
        return {
          id: m.id,
          display_name: m.display_name,
          rank: m.rank,
          status: m.status,
          starting_package: ex.starting_package,
          phone: ex.phone,
          city: ex.city,
          region: ex.region,
          registration_date: m.registration_date,
          team_size: m.team_size,
        };
      });
    rows.sort((a, b) => a.display_name.localeCompare(b.display_name, 'it'));
    return { data: rows, demo: true };
  }

  // Live: ONE paginated read of identity + anagrafica extras (the extras are columns
  // on `marketers`, so we no longer fetch the roster twice). Team sizes come from the
  // server-aggregated `team_counts` RPC (chunked) — never truncated by the row cap.
  try {
    const data = await fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from('marketers')
        .select(
          'id,first_name,last_name,display_name,rank,status,registration_date,starting_package,phone,city,region',
        )
        .is('deleted_at', null)
        .neq('id', selfId)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (data === null) return { data: [], demo: false };

    const ids = data.map((r) => String(r.id));
    const sizes = new Map<string, number>();
    const CHUNK = 5000;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { data: tc, error } = await supabase.rpc('team_counts', {
        p_ids: ids.slice(i, i + CHUNK),
      });
      if (error || !Array.isArray(tc)) break;
      for (const c of tc as { marketer_id: string; team: number }[]) {
        sizes.set(c.marketer_id, Number(c.team) || 0);
      }
    }

    const rows: TeamMemberRow[] = data.map((r) => ({
      id: String(r.id),
      display_name:
        (r.display_name as string | null) ??
        `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      rank: r.rank as MarketerRank,
      status: r.status as MarketerStatus,
      starting_package: (r.starting_package as StartingPackage | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      city: (r.city as string | null) ?? null,
      region: (r.region as string | null) ?? null,
      registration_date: (r.registration_date as string | null) ?? null,
      team_size: sizes.get(String(r.id)) ?? 0,
    }));
    rows.sort((a, b) => a.display_name.localeCompare(b.display_name, 'it'));
    return { data: rows, demo: false };
  } catch {
    return { data: [], demo: false };
  }
}

const ROSTER_COLS =
  'id,first_name,last_name,display_name,rank,status,registration_date,starting_package,phone,city,region';

function rowToTeamMember(r: Record<string, unknown>, team: number): TeamMemberRow {
  return {
    id: String(r.id),
    display_name:
      (r.display_name as string | null) ??
      `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
    rank: r.rank as MarketerRank,
    status: r.status as MarketerStatus,
    starting_package: (r.starting_package as StartingPackage | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    region: (r.region as string | null) ?? null,
    registration_date: (r.registration_date as string | null) ?? null,
    team_size: team,
  };
}

export interface TeamPage {
  rows: TeamMemberRow[];
  /** Count of rows matching the current search (for "X risultati"). */
  total: number;
  /** Org-wide totals for the summary cards (independent of the search). */
  totalAll: number;
  activeAll: number;
}

export interface TeamPageQuery {
  search?: string;
  offset?: number;
  limit?: number;
  /** Compute the org-wide summary totals. Only needed on the first load — search /
   *  load-more skip it (the client keeps the initial totals) to save round-trips. */
  withTotals?: boolean;
}

/**
 * Server-side roster page: returns only ONE page of members (search-filtered) plus
 * the totals — so /statistiche sends ~50 rows instead of the whole org. Search runs
 * on the server (trigram index on display_name); team sizes only for the page rows.
 */
export async function listTeamMembersPage(
  q: TeamPageQuery = {},
): Promise<TeamResult<TeamPage>> {
  const search = (q.search ?? '').trim();
  const offset = Math.max(0, q.offset ?? 0);
  const limit = Math.min(200, Math.max(1, q.limit ?? 50));
  const withTotals = q.withTotals !== false;
  const { marketerId: selfId } = await getOwnerContext();
  const supabase = getClient();

  // Demo (no env): mock rows filtered/sliced in memory.
  if (!supabase) {
    const { data } = await listMarketers();
    const team = data.filter((m) => m.id !== selfId);
    const needle = search.toLowerCase();
    const filt = needle
      ? team.filter((m) => m.display_name.toLowerCase().includes(needle))
      : team;
    const rows = filt
      .slice(offset, offset + limit)
      .map((m) => rowToTeamMember({ ...m, ...resolveExtra(m.id) }, m.team_size));
    return {
      data: {
        rows,
        total: filt.length,
        totalAll: team.length,
        activeAll: team.filter((m) => m.status === 'active').length,
      },
      demo: true,
    };
  }

  try {
    const like = search ? `%${search.replace(/[\\%_]/g, (m) => `\\${m}`)}%` : null;
    const orFilter = like
      ? `display_name.ilike.${like},city.ilike.${like},region.ilike.${like}`
      : null;

    // ONE request returns the page rows AND the matching total (count:'exact'),
    // so there's no separate match-count round-trip.
    let pageQ = supabase
      .from('marketers')
      .select(ROSTER_COLS, { count: 'exact' })
      .is('deleted_at', null)
      .neq('id', selfId);
    if (orFilter) pageQ = pageQ.or(orFilter);
    const { data, error, count } = await pageQ
      .order('display_name', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error || !data) {
      return { data: { rows: [], total: 0, totalAll: 0, activeAll: 0 }, demo: false };
    }

    // Org-wide summary totals: only on the first load (search/load-more skip them).
    let totalAll = 0;
    let activeAll = 0;
    if (withTotals) {
      const [allRes, activeRes] = await Promise.all([
        supabase
          .from('marketers')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .neq('id', selfId),
        supabase
          .from('marketers')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
          .neq('id', selfId)
          .eq('status', 'active'),
      ]);
      totalAll = allRes.count ?? 0;
      activeAll = activeRes.count ?? 0;
    }

    // Team size only for THIS page's rows (≤ limit ids → one RPC call).
    const ids = (data as Record<string, unknown>[]).map((r) => String(r.id));
    const sizes = new Map<string, number>();
    if (ids.length > 0) {
      const { data: tc } = await supabase.rpc('team_counts', { p_ids: ids });
      for (const c of (tc as { marketer_id: string; team: number }[] | null) ?? []) {
        sizes.set(c.marketer_id, Number(c.team) || 0);
      }
    }

    const rows = (data as Record<string, unknown>[]).map((r) =>
      rowToTeamMember(r, sizes.get(String(r.id)) ?? 0),
    );
    return {
      data: { rows, total: count ?? rows.length, totalAll, activeAll },
      demo: false,
    };
  } catch {
    return { data: { rows: [], total: 0, totalAll: 0, activeAll: 0 }, demo: true };
  }
}

/** Full anagrafica for one marketer (identity + sponsor + extras). */
export async function getMarketerProfile(
  id: string,
): Promise<TeamResult<TeamMemberProfile | null>> {
  const nodeRes = await getNode(id);
  const node = nodeRes.data;
  if (!node) return { data: null, demo: nodeRes.demo };

  let sponsorName: string | null = null;
  if (node.sponsor_id) {
    const sp = await getNode(node.sponsor_id);
    sponsorName = sp.data?.display_name ?? null;
  }

  const supabase = getClient();
  let extra: MarketerExtra = EMPTY_EXTRA;
  let registrationDate: string | null = null;
  let crmAccess = false;
  let demo = nodeRes.demo;

  if (!supabase) {
    extra = resolveExtra(id);
    const reg = await listMarketers();
    const row = reg.data.find((r) => r.id === id);
    registrationDate = row?.registration_date ?? null;
    crmAccess = row?.crm_access ?? false;
    demo = true;
  } else {
    try {
      const { data } = await supabase
        .from('marketers')
        .select(
          'registration_date,starting_package,addon,platform_click,phone,city,region,birth_date,occupation,notes,memberships(status)',
        )
        .eq('id', id)
        .maybeSingle();
      if (data) {
        const d = data as Record<string, unknown>;
        extra = rowToExtra(d);
        registrationDate = (d.registration_date as string | null) ?? null;
        const mems =
          (d.memberships as { status?: string }[] | null) ?? [];
        crmAccess = mems.some((m) => m.status === 'active');
      }
    } catch {
      /* keep EMPTY_EXTRA */
    }
  }

  return {
    data: {
      ...extra,
      id: node.id,
      first_name: node.first_name,
      last_name: node.last_name,
      display_name: node.display_name,
      rank: node.rank,
      status: node.status,
      crm_access: crmAccess,
      sponsor_id: node.sponsor_id,
      sponsor_name: sponsorName,
      registration_date: registrationDate,
    },
    demo,
  };
}

/** A team member whose birthday falls within the look-ahead window. */
export interface UpcomingBirthday {
  id: string;
  display_name: string;
  /** ISO `YYYY-MM-DD`. */
  birth_date: string;
  /** Whole days until the next occurrence (0 = today). */
  daysUntil: number;
}

/**
 * Team members whose birthday lands within `withinDays` from `now` (inclusive,
 * 0 = today), nearest first. Anchored on the month/day of `birth_date` (the year
 * is ignored), parsed without timezone drift. Demo-safe; drives the birthday
 * notifications. `now` is injected so callers control the clock.
 */
export async function listUpcomingBirthdays(
  withinDays = 7,
  now = new Date(),
): Promise<TeamResult<UpcomingBirthday[]>> {
  const { data, demo } = await listMarketers();
  const supabase = getClient();
  const extras = supabase ? await fetchExtras(data.map((m) => m.id)) : null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const results: UpcomingBirthday[] = [];

  for (const m of data) {
    const ex = extras ? extras.get(m.id) : resolveExtra(m.id);
    const birth_date = ex?.birth_date;
    if (!birth_date) continue;
    const parts = birth_date.split('-').map(Number);
    const month = parts[1];
    const day = parts[2];
    if (!month || !day) continue;

    // Next occurrence of this month/day on/after today.
    let next = new Date(today.getFullYear(), month - 1, day);
    if (next.getTime() < today.getTime()) {
      next = new Date(today.getFullYear() + 1, month - 1, day);
    }
    const daysUntil = Math.round(
      (next.getTime() - today.getTime()) / 86_400_000,
    );
    if (daysUntil <= withinDays) {
      results.push({ id: m.id, display_name: m.display_name, birth_date, daysUntil });
    }
  }

  results.sort((a, b) => a.daysUntil - b.daysUntil);
  return { data: results, demo };
}

export interface UpdateExtraResult {
  ok: boolean;
  /** true only when simulated (pure demo mode). */
  demo: boolean;
}

/** Patch the anagrafica extras of a marketer (real columns; demo = in-memory). */
export async function updateMarketerExtra(
  id: string,
  patch: Partial<MarketerExtra>,
): Promise<UpdateExtraResult> {
  const supabase = getClient();
  if (!supabase) {
    const prev = overrides.get(id) ?? {};
    overrides.set(id, { ...prev, ...patch });
    return { ok: true, demo: true };
  }
  const update: Record<string, unknown> = {};
  for (const k of EXTRA_KEYS) {
    if (k in patch) update[k] = patch[k] ?? null;
  }
  if (Object.keys(update).length === 0) return { ok: true, demo: false };
  try {
    const { data: rows, error } = await supabase
      .from('marketers')
      .update(update)
      .eq('id', id)
      .select('id');
    if (error) {
      logError('updateMarketerExtra', error, { id });
      return { ok: false, demo: false };
    }
    // 0 rows + no error = RLS-denied (not visible/out of subtree): honest failure.
    return { ok: (rows?.length ?? 0) > 0, demo: false };
  } catch (e) {
    logError('updateMarketerExtra', e, { id });
    return { ok: false, demo: false };
  }
}

export interface UpdateIdentityResult {
  ok: boolean;
  demo: boolean;
}

/**
 * Update a marketer's rank and/or renewal status. RLS scopes the UPDATE to the
 * caller's visible subtree and the structural-column guard additionally restricts
 * rank/status to a STRICT downline (never self) for non-admins. Demo = in-memory.
 */
export async function updateMarketerIdentity(
  id: string,
  patch: {
    rank?: MarketerRank;
    status?: MarketerStatus;
    /** Enrollment date (YYYY-MM-DD) — editable for a downline. */
    registration_date?: string | null;
  },
): Promise<UpdateIdentityResult> {
  const supabase = getClient();
  if (!supabase) {
    setMarketerIdentity(id, { rank: patch.rank, status: patch.status });
    return { ok: true, demo: true };
  }
  const update: Record<string, unknown> = {};
  if (patch.rank !== undefined) update.rank = patch.rank;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.registration_date !== undefined)
    update.registration_date = patch.registration_date;
  if (Object.keys(update).length === 0) return { ok: true, demo: false };
  try {
    const { data: rows, error } = await supabase
      .from('marketers')
      .update(update)
      .eq('id', id)
      .select('id');
    if (error) {
      logError('updateMarketerIdentity', error, { id });
      return { ok: false, demo: false };
    }
    return { ok: (rows?.length ?? 0) > 0, demo: false };
  } catch (e) {
    logError('updateMarketerIdentity', e, { id });
    return { ok: false, demo: false };
  }
}
