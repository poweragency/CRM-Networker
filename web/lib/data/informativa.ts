import type { StartingPackage } from '@/lib/types/db';

/**
 * Static content for the Informativa section: package prices (in dollars + IVA).
 * Downloadable documents are NO LONGER static — they are admin/co-admin managed
 * and stored in the DB (see `lib/data/org-documents.ts`).
 */

export interface PackagePrice {
  /** Cadenza dell'abbonamento, mostrata come etichetta sopra il prezzo. */
  cadence: string;
  /** Display price in dollars (the "+ IVA" suffix is added by the UI). */
  price: string;
}

export interface PackageInfo {
  key: StartingPackage;
  /**
   * Tier di prezzo a scaletta, in ordine alto → basso: la versione **mensile** è
   * sempre l'ultima (ed è etichettata "Mensile").
   */
  prices: PackagePrice[];
  /** Highlight the flagship package. */
  featured?: boolean;
}

/** Highest → lowest, matching STARTING_PACKAGE_ORDER. */
export const PACKAGE_INFO: PackageInfo[] = [
  {
    key: 'signature',
    featured: true,
    prices: [
      { cadence: 'Annuale', price: '$ 2.879' },
      { cadence: 'Semestrale', price: '$ 2.299' },
      { cadence: 'Mensile', price: '$ 1.799' },
    ],
  },
  {
    key: 'premium',
    prices: [
      { cadence: 'Annuale', price: '$ 2.079' },
      { cadence: 'Semestrale', price: '$ 1.499' },
      { cadence: 'Mensile', price: '$ 999' },
    ],
  },
  {
    key: 'standard',
    prices: [
      { cadence: 'Annuale', price: '$ 1.579' },
      { cadence: 'Semestrale', price: '$ 999' },
      { cadence: 'Mensile', price: '$ 499' },
    ],
  },
  {
    // Starter: per ora solo mensile — le varianti annuale/semestrale sono da definire.
    key: 'starter',
    prices: [{ cadence: 'Mensile', price: '$ 199' }],
  },
];
