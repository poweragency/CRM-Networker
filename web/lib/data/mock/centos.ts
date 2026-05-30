import type { CentosEntry } from '@/lib/types/db';
import { DEMO_ORG_ID, DEMO_OWNER_ID, daysAgo } from './_shared';

/**
 * The demo "Lista Centos" (list of 100) for the demo caller — ~22 ordered
 * names with relationships, ratings and contacted/promoted flags. Drives the
 * ordered list, ratings, the contacted toggle and the "promote to contact"
 * action in "modalità demo".
 */

interface Seed {
  position: number;
  full_name: string;
  phone?: string;
  relationship: string;
  rating: number;
  contacted: boolean;
  promoted?: string | null;
  notes?: string;
}

const SEEDS: Seed[] = [
  { position: 1, full_name: 'Alessandro Greco', phone: '+39 340 1122334', relationship: 'Ex collega', rating: 5, contacted: true, promoted: 'ct-001', notes: 'Già nel CRM come prospect.' },
  { position: 2, full_name: 'Sara Lombardo', phone: '+39 345 7654321', relationship: 'Amica di università', rating: 5, contacted: true, promoted: 'ct-006' },
  { position: 3, full_name: 'Riccardo Sala', phone: '+39 340 3434343', relationship: 'Vicino di casa', rating: 4, contacted: true, promoted: 'ct-019' },
  { position: 4, full_name: 'Marta Vendramin', phone: '+39 333 1010101', relationship: 'Cugina', rating: 4, contacted: true, notes: 'Interessata, da richiamare.' },
  { position: 5, full_name: 'Giorgio Pavan', phone: '+39 347 2020202', relationship: 'Amico palestra', rating: 3, contacted: true },
  { position: 6, full_name: 'Letizia Marchi', relationship: 'Mamma a scuola figli', rating: 4, contacted: false },
  { position: 7, full_name: 'Antonio Russo', phone: '+39 320 3030303', relationship: 'Ex cliente', rating: 5, contacted: true, notes: 'Apertissimo, fissare call.' },
  { position: 8, full_name: 'Debora Fini', relationship: 'Amica della sorella', rating: 3, contacted: false },
  { position: 9, full_name: 'Carlo Benedetti', phone: '+39 351 4040404', relationship: 'Vecchio compagno di classe', rating: 4, contacted: true },
  { position: 10, full_name: 'Nadia Orlando', relationship: 'Conoscente al bar', rating: 2, contacted: false },
  { position: 11, full_name: 'Pietro Sanna', phone: '+39 333 5050505', relationship: 'Ex collega', rating: 4, contacted: false },
  { position: 12, full_name: 'Veronica Greco', relationship: 'Cognata', rating: 5, contacted: true, notes: 'Vuole più info sul prodotto.' },
  { position: 13, full_name: 'Lorenzo Bellini', phone: '+39 348 6060606', relationship: 'Amico di famiglia', rating: 3, contacted: false },
  { position: 14, full_name: 'Sabrina Pinna', relationship: 'Parrucchiera', rating: 4, contacted: true },
  { position: 15, full_name: 'Emanuele Costa', phone: '+39 366 7070707', relationship: 'Compagno di calcetto', rating: 3, contacted: false },
  { position: 16, full_name: 'Giulia Ferraro', relationship: 'Amica della palestra', rating: 4, contacted: false },
  { position: 17, full_name: 'Daniele Mauro', phone: '+39 329 8080808', relationship: 'Ex collega', rating: 2, contacted: true },
  { position: 18, full_name: 'Roberta Leone', relationship: 'Vicina di casa', rating: 3, contacted: false },
  { position: 19, full_name: 'Filippo Negri', phone: '+39 340 9090909', relationship: 'Amico di vecchia data', rating: 5, contacted: true, notes: 'Promettente, alta priorità.' },
  { position: 20, full_name: 'Camilla Riva', relationship: 'Conoscente social', rating: 3, contacted: false },
  { position: 21, full_name: 'Matteo Sorrentino', phone: '+39 333 1111222', relationship: 'Ex compagno corso', rating: 4, contacted: false },
  { position: 22, full_name: 'Eleonora Vianello', relationship: 'Amica della cognata', rating: 3, contacted: false },
];

export const MOCK_CENTOS: CentosEntry[] = SEEDS.map((s) => ({
  id: `cn-${String(s.position).padStart(3, '0')}`,
  org_id: DEMO_ORG_ID,
  owner_marketer_id: DEMO_OWNER_ID,
  position: s.position,
  full_name: s.full_name,
  phone: s.phone ?? null,
  relationship: s.relationship,
  rating: s.rating,
  contacted: s.contacted,
  promoted_contact_id: s.promoted ?? null,
  notes: s.notes ?? null,
  created_at: daysAgo(50 - s.position),
  updated_at: daysAgo(5),
  deleted_at: null,
}));
