import type { Call, CallOutcome, CallType } from '@/lib/types/db';
import { DEMO_ORG_ID, DEMO_OWNER_ID, daysAgo } from './_shared';

/**
 * ~22 demo calls tied to the demo prospects/contacts, spread over the last
 * ~30 days with varied type/outcome/duration. Drives the calls log, the stats
 * strip and per-prospect call history in "modalità demo".
 */

interface Seed {
  id: string;
  type: CallType;
  outcome: CallOutcome;
  /** duration in minutes (converted to seconds). */
  mins: number;
  daysAgo: number;
  marketer?: string;
  prospect_id?: string | null;
  contact_id?: string | null;
  target_name: string;
  notes?: string;
}

const SEEDS: Seed[] = [
  { id: 'cl-001', type: 'outbound', outcome: 'appuntamento', mins: 14, daysAgo: 1, prospect_id: 'pr-001', target_name: 'Alessandro Greco', notes: 'Fissato incontro di presentazione.' },
  { id: 'cl-002', type: 'video', outcome: 'connesso', mins: 32, daysAgo: 2, prospect_id: 'pr-002', target_name: 'Sara Lombardo', notes: 'Presentato il piano compensi.' },
  { id: 'cl-003', type: 'outbound', outcome: 'no_risposta', mins: 0, daysAgo: 2, contact_id: 'ct-003', target_name: 'Marco Pellegrini' },
  { id: 'cl-004', type: 'whatsapp', outcome: 'richiamare', mins: 3, daysAgo: 3, contact_id: 'ct-008', target_name: 'Elena Vitale', notes: 'Chiede di risentirsi la prossima settimana.' },
  { id: 'cl-005', type: 'outbound', outcome: 'iscritto', mins: 27, daysAgo: 4, prospect_id: 'pr-006', target_name: 'Giada Esposito', notes: 'Iscrizione confermata in chiamata.' },
  { id: 'cl-006', type: 'inbound', outcome: 'connesso', mins: 11, daysAgo: 4, contact_id: 'ct-002', target_name: 'Francesca Rinaldi' },
  { id: 'cl-007', type: 'outbound', outcome: 'non_interessato', mins: 6, daysAgo: 5, contact_id: 'ct-007', target_name: 'Luca Marchetti', notes: 'Non in target.' },
  { id: 'cl-008', type: 'video', outcome: 'appuntamento', mins: 19, daysAgo: 6, prospect_id: 'pr-003', marketer: 'nL', target_name: 'Andrea Costa' },
  { id: 'cl-009', type: 'outbound', outcome: 'connesso', mins: 9, daysAgo: 7, prospect_id: 'pr-007', target_name: 'Manuela Ricci' },
  { id: 'cl-010', type: 'whatsapp', outcome: 'richiamare', mins: 2, daysAgo: 7, contact_id: 'ct-005', target_name: 'Davide Fontana' },
  { id: 'cl-011', type: 'outbound', outcome: 'no_risposta', mins: 0, daysAgo: 8, prospect_id: 'pr-008', target_name: 'Paolo Neri' },
  { id: 'cl-012', type: 'inbound', outcome: 'connesso', mins: 16, daysAgo: 9, contact_id: 'ct-006', target_name: 'Sara Lombardo' },
  { id: 'cl-013', type: 'outbound', outcome: 'appuntamento', mins: 12, daysAgo: 10, prospect_id: 'pr-005', marketer: 'nLLL', target_name: 'Riccardo Sala' },
  { id: 'cl-014', type: 'video', outcome: 'connesso', mins: 41, daysAgo: 11, prospect_id: 'pr-010', marketer: 'nR', target_name: 'Fabio Testa', notes: 'Gestite obiezioni sul tempo.' },
  { id: 'cl-015', type: 'outbound', outcome: 'iscritto', mins: 23, daysAgo: 12, prospect_id: 'pr-015', marketer: 'nL', target_name: 'Serena Palmieri', notes: 'Iscrizione completata.' },
  { id: 'cl-016', type: 'outbound', outcome: 'richiamare', mins: 5, daysAgo: 13, contact_id: 'ct-015', marketer: 'nLL', target_name: 'Giovanni Conti' },
  { id: 'cl-017', type: 'whatsapp', outcome: 'connesso', mins: 4, daysAgo: 14, prospect_id: 'pr-012', marketer: 'nRL', target_name: 'Stefano Caruso' },
  { id: 'cl-018', type: 'outbound', outcome: 'no_risposta', mins: 0, daysAgo: 16, contact_id: 'ct-009', target_name: 'Roberto Ferrara' },
  { id: 'cl-019', type: 'inbound', outcome: 'connesso', mins: 8, daysAgo: 18, prospect_id: 'pr-013', marketer: 'nL', target_name: 'Nicoletta Villa' },
  { id: 'cl-020', type: 'outbound', outcome: 'appuntamento', mins: 15, daysAgo: 21, prospect_id: 'pr-011', marketer: 'nR', target_name: 'Ilaria Longo' },
  { id: 'cl-021', type: 'video', outcome: 'connesso', mins: 28, daysAgo: 24, contact_id: 'ct-016', marketer: 'nLL', target_name: 'Beatrice Moretti' },
  { id: 'cl-022', type: 'outbound', outcome: 'non_interessato', mins: 7, daysAgo: 28, contact_id: 'ct-010', target_name: 'Chiara Galli' },
];

function build(s: Seed): Call {
  const marketer = s.marketer ?? DEMO_OWNER_ID;
  return {
    id: s.id,
    org_id: DEMO_ORG_ID,
    marketer_id: marketer,
    prospect_id: s.prospect_id ?? null,
    contact_id: s.contact_id ?? null,
    call_type: s.type,
    outcome: s.outcome,
    duration_secs: s.mins * 60,
    occurred_at: daysAgo(s.daysAgo, 3),
    notes: s.notes ?? null,
    created_by: marketer,
    created_at: daysAgo(s.daysAgo, 3),
    updated_at: daysAgo(s.daysAgo, 3),
    deleted_at: null,
  };
}

export const MOCK_CALLS: Call[] = SEEDS.map(build);

/** Quick lookup of the demo target name for a call (list display). */
export const MOCK_CALL_TARGETS: Record<string, string> = Object.fromEntries(
  SEEDS.map((s) => [s.id, s.target_name]),
);
