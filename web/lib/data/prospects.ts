import 'server-only';
import type {
  Prospect,
  ProspectJourneyEvent,
  ProspectStage,
  ProspectWithJourney,
} from '@/lib/types/db';
import { STAGE_ORDER } from '@/lib/types/db';
import { logError } from '@/lib/log';
import { kpisFromStages, type ProspectKpis } from '@/lib/prospect-kpis';
import {
  MOCK_JOURNEY_EVENTS,
  MOCK_PROSPECTS,
  buildJourney,
} from '@/lib/data/mock/prospects';
import {
  type CrmResult,
  type MutationResult,
  getClient,
  getOwnerContext,
  matchesText,
  nowIso,
  ok,
} from '@/lib/data/crm-shared';
import { demoId } from '@/lib/data/mock/_shared';

/**
 * Prospects data access (server-only, Supabase-then-MOCK, never throws). Adds a
 * board view (prospects grouped by the 6 canonical stages) and the transactional
 * `change_prospect_stage` RPC; in demo mode the stage change is simulated
 * (optimistic local transition + a synthetic journey event).
 */

const SELECT =
  'id,org_id,owner_marketer_id,contact_id,full_name,current_stage,outcome,current_stage_since,entered_funnel_at,closed_at,notes,created_by,updated_by,created_at,updated_at,deleted_at';

export interface ProspectFilters {
  search?: string;
  /** restrict to open prospects (exclude enrolled/lost). default false. */
  openOnly?: boolean;
  /** scope to one owner marketer (the per-person profile view). default = all visible. */
  ownerMarketerId?: string;
}

/** A board column: one stage + its prospects, in canonical order. */
export interface StageColumn {
  stage: ProspectStage;
  prospects: Prospect[];
}

/** The board envelope: ordered columns + total/funnel counts. */
export interface ProspectBoard {
  columns: StageColumn[];
  total: number;
}

/**
 * Personal funnel KPIs derived from a marketer's OWN board — strictly their own
 * prospects, never rolled up from the downline. Thin wrapper over the shared,
 * client-safe {@link kpisFromStages} (the interactive performance widget reuses
 * the same math after applying its period filter).
 */
export function computeProspectKpis(board: ProspectBoard): ProspectKpis {
  return kpisFromStages(board.columns.flatMap((c) => c.prospects.map((p) => p.current_stage)));
}

function filterMock(filters: ProspectFilters): Prospect[] {
  const { search = '', openOnly = false, ownerMarketerId } = filters;
  return MOCK_PROSPECTS.filter((p) => !p.deleted_at)
    .filter((p) => (ownerMarketerId ? p.owner_marketer_id === ownerMarketerId : true))
    .filter((p) => (openOnly ? p.outcome === 'open' : true))
    .filter((p) => matchesText(p.full_name, search));
}

function groupByStage(prospects: Prospect[]): StageColumn[] {
  return STAGE_ORDER.map((stage) => ({
    stage,
    prospects: prospects
      .filter((p) => p.current_stage === stage)
      .sort(
        (a, b) =>
          new Date(b.current_stage_since).getTime() -
          new Date(a.current_stage_since).getTime(),
      ),
  }));
}

/** List prospects grouped by the 6 stages (kanban board). */
export async function listProspectBoard(
  filters: ProspectFilters = {},
): Promise<CrmResult<ProspectBoard>> {
  const supabase = getClient();
  if (!supabase) {
    const rows = filterMock(filters);
    return ok({ columns: groupByStage(rows), total: rows.length }, true);
  }
  try {
    let query = supabase.from('prospects').select(SELECT).is('deleted_at', null);
    if (filters.ownerMarketerId)
      query = query.eq('owner_marketer_id', filters.ownerMarketerId);
    if (filters.openOnly) query = query.eq('outcome', 'open');
    if (filters.search) query = query.ilike('full_name', `%${filters.search}%`);
    const { data, error } = await query;
    if (error || !data) {
      const rows = filterMock(filters);
      return ok({ columns: groupByStage(rows), total: rows.length }, true);
    }
    const rows = data as Prospect[];
    return ok({ columns: groupByStage(rows), total: rows.length }, false);
  } catch {
    const rows = filterMock(filters);
    return ok({ columns: groupByStage(rows), total: rows.length }, true);
  }
}

/** Flat prospect list (table view). */
export async function listProspects(
  filters: ProspectFilters = {},
): Promise<CrmResult<Prospect[]>> {
  const board = await listProspectBoard(filters);
  return ok(
    board.data.columns.flatMap((c) => c.prospects),
    board.demo,
  );
}

/** A prospect with its ordered journey history. */
export async function getProspectById(
  id: string,
): Promise<CrmResult<ProspectWithJourney | null>> {
  const supabase = getClient();
  if (!supabase) {
    const p = MOCK_PROSPECTS.find((x) => x.id === id);
    if (!p) return ok(null, true);
    return ok({ ...p, journey: buildJourney(id) }, true);
  }
  try {
    const { data: p, error } = await supabase
      .from('prospects')
      .select(SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error || !p) {
      const m = MOCK_PROSPECTS.find((x) => x.id === id);
      return m ? ok({ ...m, journey: buildJourney(id) }, true) : ok(null, false);
    }
    const { data: events } = await supabase
      .from('prospect_journey_events')
      .select(
        'id,org_id,prospect_id,responsible_marketer_id,from_stage,to_stage,entered_at,exited_at,time_in_stage_secs,notes,created_at',
      )
      .eq('prospect_id', id)
      .order('entered_at', { ascending: true });
    return ok(
      { ...(p as Prospect), journey: (events as ProspectJourneyEvent[]) ?? [] },
      false,
    );
  } catch {
    const m = MOCK_PROSPECTS.find((x) => x.id === id);
    return m ? ok({ ...m, journey: buildJourney(id) }, true) : ok(null, true);
  }
}

export interface ProspectInput {
  full_name: string;
  contact_id?: string | null;
  current_stage?: ProspectStage;
  notes?: string | null;
  owner_marketer_id?: string;
}

/** Create a prospect (entry event auto-stamped server-side / simulated). */
export async function createProspect(
  input: ProspectInput,
): Promise<MutationResult<Prospect>> {
  const { orgId, marketerId, demo } = await getOwnerContext();
  const supabase = getClient();
  const stage = input.current_stage ?? 'conoscitiva';

  const optimistic: Prospect = {
    id: demoId('pr'),
    org_id: orgId,
    owner_marketer_id: input.owner_marketer_id ?? marketerId,
    contact_id: input.contact_id ?? null,
    full_name: input.full_name,
    current_stage: stage,
    outcome: 'open',
    current_stage_since: nowIso(),
    entered_funnel_at: nowIso(),
    closed_at: null,
    notes: input.notes ?? null,
    created_by: marketerId,
    updated_by: marketerId,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  };

  if (!supabase || demo) return { data: optimistic, demo: true, ok: true };

  try {
    const { data, error } = await supabase
      .from('prospects')
      .insert({ ...optimistic, id: undefined })
      .select(SELECT)
      .single();
    if (error || !data) return { data: optimistic, demo: false, ok: false };
    return { data: data as Prospect, demo: false, ok: true };
  } catch {
    return { data: optimistic, demo: false, ok: false };
  }
}

export interface ChangeStageResult {
  prospect: Prospect;
  event: ProspectJourneyEvent;
}

/**
 * Move a prospect to a new stage. Real path calls the transactional
 * `change_prospect_stage` RPC (doc 01 §5.2); demo path simulates the transaction
 * (closes the open event, opens a new one, advances current_stage).
 */
export async function changeStage(
  prospectId: string,
  toStage: ProspectStage,
  notes?: string,
): Promise<MutationResult<ChangeStageResult>> {
  const { orgId, marketerId } = await getOwnerContext();
  const supabase = getClient();

  const current =
    MOCK_PROSPECTS.find((p) => p.id === prospectId) ?? MOCK_PROSPECTS[0]!;
  const isEnrollment = toStage === 'iscrizione';
  const simulatedProspect: Prospect = {
    ...current,
    id: prospectId,
    current_stage: toStage,
    current_stage_since: nowIso(),
    outcome: isEnrollment ? 'enrolled' : 'open',
    closed_at: isEnrollment ? nowIso() : null,
    updated_at: nowIso(),
  };
  const simulatedEvent: ProspectJourneyEvent = {
    id: demoId('ev'),
    org_id: orgId,
    prospect_id: prospectId,
    responsible_marketer_id: marketerId,
    from_stage: current.current_stage,
    to_stage: toStage,
    entered_at: nowIso(),
    exited_at: null,
    time_in_stage_secs: null,
    notes: notes ?? null,
    created_at: nowIso(),
  };

  if (!supabase) {
    return {
      data: { prospect: simulatedProspect, event: simulatedEvent },
      demo: true,
      ok: true,
    };
  }

  try {
    const { error } = await supabase.rpc('change_prospect_stage', {
      p_prospect_id: prospectId,
      p_new_stage: toStage,
      p_notes: notes ?? null,
      // Reaching the terminal stage stamps the enrollment outcome (+closed_at);
      // moving to ANY earlier stage forces outcome back to 'open' (clears closed_at),
      // so dragging a card out of "Iscritto" cleanly un-enrolls it. (The RPC does
      // COALESCE(p_outcome, outcome), so a null here would KEEP a stale 'enrolled'.)
      p_outcome: isEnrollment ? 'enrolled' : 'open',
    });
    if (error) {
      logError('changeStage', error, { prospectId, toStage });
      return {
        data: { prospect: simulatedProspect, event: simulatedEvent },
        demo: false,
        ok: false,
      };
    }
    // Re-read the canonical state after the transactional RPC.
    const fresh = await getProspectById(prospectId);
    const p = fresh.data ?? simulatedProspect;
    const openEvent =
      fresh.data?.journey.find((e) => e.exited_at === null) ?? simulatedEvent;
    return {
      data: { prospect: p, event: openEvent },
      demo: false,
      ok: true,
    };
  } catch {
    return {
      data: { prospect: simulatedProspect, event: simulatedEvent },
      demo: false,
      ok: false,
    };
  }
}

/**
 * Soft-delete a prospect (sets `deleted_at`; the board filters it out). RLS
 * (`prospects_update` / visibility) allows the owner's upline + admins. Demo-safe.
 */
export async function deleteProspect(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  const supabase = getClient();
  if (!supabase) return { data: { id }, demo: true, ok: true };
  try {
    const { error } = await supabase
      .from('prospects')
      .update({ deleted_at: nowIso() })
      .eq('id', id);
    return { data: { id }, demo: false, ok: !error };
  } catch {
    return { data: { id }, demo: false, ok: false };
  }
}

export { MOCK_JOURNEY_EVENTS };
