import type { MarketerExtra, Occupation, StartingPackage } from '@/lib/types/db';
import { MOCK_NODES } from '@/lib/data/mock-genealogy';

/**
 * Deterministic demo anagrafica extras (città, regione, pacchetto, data di
 * nascita, studia/lavora, …) for each genealogy node, so /team/[id] and the
 * Statistiche roster render fully with no env (RESILIENCE). Frontend + mock only
 * for now — there are no DB columns yet (product decision). Pure & deterministic
 * (no Date/Math.random), keyed off the node's position in the demo tree.
 */

const CITIES: { city: string; region: string }[] = [
  { city: 'Milano', region: 'Lombardia' },
  { city: 'Roma', region: 'Lazio' },
  { city: 'Napoli', region: 'Campania' },
  { city: 'Torino', region: 'Piemonte' },
  { city: 'Bologna', region: 'Emilia-Romagna' },
  { city: 'Firenze', region: 'Toscana' },
  { city: 'Bari', region: 'Puglia' },
  { city: 'Palermo', region: 'Sicilia' },
  { city: 'Verona', region: 'Veneto' },
  { city: 'Genova', region: 'Liguria' },
];

const PACKAGES: StartingPackage[] = ['signature', 'premium', 'standard', 'starter'];
const OCCUPATIONS: Occupation[] = ['lavora', 'studia', 'entrambi', 'lavora', 'nessuno'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Stable index of an id within the demo tree (0 for unknown ids). */
function idIndex(id: string): number {
  const i = MOCK_NODES.findIndex((n) => n.id === id);
  return i < 0 ? 0 : i;
}

/** Deterministic, demo-only anagrafica extras for a marketer id. */
export function mockExtra(id: string): MarketerExtra {
  const i = idIndex(id);
  const loc = CITIES[i % CITIES.length]!;
  const birthYear = 1986 + (i % 18);
  const birthMonth = ((i * 7) % 12) + 1;
  const birthDay = ((i * 13) % 27) + 1;
  return {
    starting_package: PACKAGES[i % PACKAGES.length]!,
    // "addon" and "notes" are intentionally empty fields to fill in later.
    addon: null,
    platform_click: i % 3 !== 0,
    city: loc.city,
    region: loc.region,
    birth_date: `${birthYear}-${pad(birthMonth)}-${pad(birthDay)}`,
    occupation: OCCUPATIONS[i % OCCUPATIONS.length]!,
    notes: null,
  };
}
