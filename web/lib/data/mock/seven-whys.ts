import type { SevenWhys } from '@/lib/types/db';
import { DEMO_ORG_ID, DEMO_OWNER_ID, daysAgo } from './_shared';

/**
 * Demo "Sette Perché" records (one per marketer, UNIQUE). The demo caller has a
 * fully-filled record; a couple of downline marketers have partial/empty ones
 * so the editor's empty/partial states are exercisable in "modalità demo".
 */

export const MOCK_SEVEN_WHYS: SevenWhys[] = [
  {
    id: 'sw-001',
    org_id: DEMO_ORG_ID,
    marketer_id: DEMO_OWNER_ID,
    subject: 'Libertà finanziaria e tempo per la famiglia',
    why_1: 'Dare ai miei figli le opportunità che io non ho avuto.',
    why_2: 'Estinguere il mutuo entro tre anni.',
    why_3: 'Avere la libertà di gestire il mio tempo.',
    why_4: 'Costruire una rendita che non dipenda da un singolo stipendio.',
    why_5: 'Poter aiutare i miei genitori quando ne avranno bisogno.',
    why_6: 'Crescere come leader e ispirare il mio team.',
    why_7: 'Dimostrare a me stesso che posso costruire qualcosa di grande.',
    primary_why_index: 1,
    created_at: daysAgo(200),
    updated_at: daysAgo(12),
  },
  {
    id: 'sw-002',
    org_id: DEMO_ORG_ID,
    marketer_id: 'nL',
    subject: 'Indipendenza e crescita personale',
    why_1: 'Smettere di dipendere da un capo.',
    why_2: 'Viaggiare almeno tre volte all’anno.',
    why_3: 'Mettere da parte per il futuro di mia figlia.',
    why_4: 'Superare le mie paure parlando in pubblico.',
    why_5: 'Circondarmi di persone ambiziose.',
    why_6: null,
    why_7: null,
    primary_why_index: 2,
    created_at: daysAgo(120),
    updated_at: daysAgo(20),
  },
  {
    id: 'sw-003',
    org_id: DEMO_ORG_ID,
    marketer_id: 'nR',
    subject: null,
    why_1: 'Avere entrate extra per uscire dai debiti.',
    why_2: 'Costruire qualcosa di mio.',
    why_3: null,
    why_4: null,
    why_5: null,
    why_6: null,
    why_7: null,
    primary_why_index: 1,
    created_at: daysAgo(60),
    updated_at: daysAgo(30),
  },
];
