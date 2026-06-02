import 'server-only';
import type {
  MarketerExtra,
  TeamMemberProfile,
  TeamMemberRow,
} from '@/lib/types/db';
import { getNode } from '@/lib/data/genealogy';
import { listMarketers } from '@/lib/data/admin';
import { mockExtra } from '@/lib/data/mock/team';

/**
 * Team-member profile data access (server-only) for the Statistiche roster and
 * the /team/[id] anagrafica. The base identity (nome/cognome/sponsor/rank/data
 * iscrizione) flows through the existing demo-safe genealogy + registry layers;
 * the extra anagrafica fields (pacchetto, addon, click, città, regione, data di
 * nascita, studia/lavora, note) are FRONTEND + MOCK only for now — there are no
 * DB columns yet (product decision). Edits are kept in an in-memory override map
 * so a save reflects within the running server; they do not yet persist.
 */

export interface TeamResult<T> {
  data: T;
  demo: boolean;
}

/** In-memory edit store (mock-only; resets on server restart). */
const overrides = new Map<string, Partial<MarketerExtra>>();

function resolveExtra(id: string): MarketerExtra {
  const base = mockExtra(id);
  const ov = overrides.get(id);
  return ov ? { ...base, ...ov } : base;
}

/** The team roster: one compact row per marketer, clickable → /team/[id]. */
export async function listTeamMembers(): Promise<TeamResult<TeamMemberRow[]>> {
  const { data, demo } = await listMarketers();
  const rows: TeamMemberRow[] = data.map((m) => {
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
  // Alphabetical by name (it-IT), not by rank/registry order.
  rows.sort((a, b) => a.display_name.localeCompare(b.display_name, 'it'));
  return { data: rows, demo };
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

  // Registration date lives on the registry projection (not on the tree node).
  const reg = await listMarketers();
  const row = reg.data.find((r) => r.id === id);
  const ex = resolveExtra(id);

  return {
    data: {
      ...ex,
      id: node.id,
      first_name: node.first_name,
      last_name: node.last_name,
      display_name: node.display_name,
      rank: node.rank,
      status: node.status,
      crm_access: row?.crm_access ?? false,
      sponsor_id: node.sponsor_id,
      sponsor_name: sponsorName,
      registration_date: row?.registration_date ?? null,
    },
    demo: nodeRes.demo || reg.demo,
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
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const results: UpcomingBirthday[] = [];

  for (const m of data) {
    const { birth_date } = resolveExtra(m.id);
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
      results.push({
        id: m.id,
        display_name: m.display_name,
        birth_date,
        daysUntil,
      });
    }
  }

  results.sort((a, b) => a.daysUntil - b.daysUntil);
  return { data: results, demo };
}

export interface UpdateExtraResult {
  ok: boolean;
  /** Always true for now — the anagrafica is mock-backed (no DB columns yet). */
  demo: boolean;
}

/** Patch the anagrafica extras of a marketer (in-memory, demo-safe). */
export async function updateMarketerExtra(
  id: string,
  patch: Partial<MarketerExtra>,
): Promise<UpdateExtraResult> {
  const prev = overrides.get(id) ?? {};
  overrides.set(id, { ...prev, ...patch });
  return { ok: true, demo: true };
}
