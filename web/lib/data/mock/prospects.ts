import type {
  Prospect,
  ProspectJourneyEvent,
  ProspectStage,
} from '@/lib/types/db';
import { STAGE_ORDER } from '@/lib/types/db';
import { DEMO_ORG_ID, DEMO_OWNER_ID, daysAgo } from './_shared';

/**
 * ~16 demo prospects spread across the 6 canonical stages, plus a generated
 * journey-event history per prospect (one event per stage it has passed
 * through, the latest left open). Drives the kanban board, the funnel counts
 * and the prospect-detail timeline in "modalità demo".
 */

interface Seed {
  id: string;
  full_name: string;
  stage: ProspectStage;
  owner?: string;
  contact_id?: string | null;
  expected_value?: number | null;
  /** days since entering the funnel (controls stage timestamps). */
  ageDays: number;
  notes?: string;
  outcome?: Prospect['outcome'];
}

const SEEDS: Seed[] = [
  { id: 'pr-001', full_name: 'Alessandro Greco', stage: 'business_info', contact_id: 'ct-001', expected_value: 1200, ageDays: 12, notes: 'Presentazione fissata per giovedì.' },
  { id: 'pr-002', full_name: 'Sara Lombardo', stage: 'follow_up', contact_id: 'ct-006', expected_value: 900, ageDays: 18, notes: 'Sta valutando con il marito.' },
  { id: 'pr-003', full_name: 'Andrea Costa', stage: 'closing', contact_id: 'ct-011', owner: 'nL', expected_value: 1500, ageDays: 21, notes: 'Pronto a chiudere, manca solo la conferma del pacchetto.' },
  { id: 'pr-004', full_name: 'Beatrice Moretti', stage: 'conoscitiva', contact_id: 'ct-016', owner: 'nLL', ageDays: 4 },
  { id: 'pr-005', full_name: 'Riccardo Sala', stage: 'business_info', contact_id: 'ct-019', owner: 'nLLL', expected_value: 800, ageDays: 9 },
  { id: 'pr-006', full_name: 'Giada Esposito', stage: 'iscrizione', contact_id: 'ct-004', expected_value: 2000, ageDays: 40, notes: 'Iscritta! Da inserire nel team.', outcome: 'enrolled' },
  { id: 'pr-007', full_name: 'Manuela Ricci', stage: 'check_soldi', expected_value: 1100, ageDays: 26, notes: 'Verifica budget in corso.' },
  { id: 'pr-008', full_name: 'Paolo Neri', stage: 'follow_up', expected_value: 700, ageDays: 15 },
  { id: 'pr-009', full_name: 'Cristina Mancini', stage: 'conoscitiva', ageDays: 2 },
  { id: 'pr-010', full_name: 'Fabio Testa', stage: 'closing', owner: 'nR', expected_value: 1300, ageDays: 23, notes: 'Ultima obiezione sul tempo da dedicare.' },
  { id: 'pr-011', full_name: 'Ilaria Longo', stage: 'business_info', owner: 'nR', expected_value: 950, ageDays: 8 },
  { id: 'pr-012', full_name: 'Stefano Caruso', stage: 'follow_up', owner: 'nRL', expected_value: 600, ageDays: 17 },
  { id: 'pr-013', full_name: 'Nicoletta Villa', stage: 'check_soldi', owner: 'nL', expected_value: 1400, ageDays: 29 },
  { id: 'pr-014', full_name: 'Gabriele Monti', stage: 'conoscitiva', owner: 'nLL', ageDays: 3 },
  { id: 'pr-015', full_name: 'Serena Palmieri', stage: 'iscrizione', owner: 'nL', expected_value: 1800, ageDays: 35, notes: 'Iscrizione completata.', outcome: 'enrolled' },
  { id: 'pr-016', full_name: 'Davide Fontana', stage: 'follow_up', contact_id: 'ct-005', expected_value: 850, ageDays: 14, notes: 'In pausa, ricontattare a fine mese.', outcome: 'on_hold' },
];

function buildProspect(s: Seed): Prospect {
  const owner = s.owner ?? DEMO_OWNER_ID;
  const stageIdx = STAGE_ORDER.indexOf(s.stage);
  // Spread the elapsed age across the stages reached so far.
  const perStage = s.ageDays / (stageIdx + 1);
  const sinceDays = perStage; // time in the current (latest) stage
  const enrolled = s.outcome === 'enrolled' || s.outcome === 'lost';
  return {
    id: s.id,
    org_id: DEMO_ORG_ID,
    owner_marketer_id: owner,
    contact_id: s.contact_id ?? null,
    full_name: s.full_name,
    current_stage: s.stage,
    outcome: s.outcome ?? 'open',
    current_stage_since: daysAgo(sinceDays),
    entered_funnel_at: daysAgo(s.ageDays),
    closed_at: enrolled ? daysAgo(sinceDays / 2) : null,
    expected_value: s.expected_value ?? null,
    notes: s.notes ?? null,
    created_by: owner,
    updated_by: owner,
    created_at: daysAgo(s.ageDays),
    updated_at: daysAgo(sinceDays),
    deleted_at: null,
  };
}

export const MOCK_PROSPECTS: Prospect[] = SEEDS.map(buildProspect);

/** Build the ordered journey-event history for one prospect. */
export function buildJourney(prospectId: string): ProspectJourneyEvent[] {
  const seed = SEEDS.find((s) => s.id === prospectId);
  if (!seed) return [];
  const owner = seed.owner ?? DEMO_OWNER_ID;
  const stageIdx = STAGE_ORDER.indexOf(seed.stage);
  const reached = STAGE_ORDER.slice(0, stageIdx + 1);
  const perStage = seed.ageDays / (stageIdx + 1);

  return reached.map((stage, i) => {
    const enteredDays = seed.ageDays - perStage * i;
    const exitedDays = i < reached.length - 1 ? seed.ageDays - perStage * (i + 1) : null;
    return {
      id: `${prospectId}-ev-${i + 1}`,
      org_id: DEMO_ORG_ID,
      prospect_id: prospectId,
      responsible_marketer_id: owner,
      from_stage: i === 0 ? null : reached[i - 1]!,
      to_stage: stage,
      entered_at: daysAgo(enteredDays),
      exited_at: exitedDays === null ? null : daysAgo(exitedDays),
      time_in_stage_secs:
        exitedDays === null
          ? null
          : Math.round((enteredDays - exitedDays) * 86_400),
      notes: null,
      created_at: daysAgo(enteredDays),
    };
  });
}

export const MOCK_JOURNEY_EVENTS: ProspectJourneyEvent[] = SEEDS.flatMap((s) =>
  buildJourney(s.id),
);
