import type { StartingPackage } from '@/lib/types/db';

/**
 * Static content for the Informativa section: package prices (in dollars + IVA).
 * Downloadable documents are NO LONGER static — they are admin/co-admin managed
 * and stored in the DB (see `lib/data/org-documents.ts`).
 */

export interface PackageInfo {
  key: StartingPackage;
  /** Display price in dollars (the "+ IVA" suffix is added by the UI). */
  price: string;
  /** Highlight the flagship package. */
  featured?: boolean;
}

/** Highest → lowest, matching STARTING_PACKAGE_ORDER. */
export const PACKAGE_INFO: PackageInfo[] = [
  { key: 'signature', price: '$ 1.799', featured: true },
  { key: 'premium', price: '$ 999' },
  { key: 'standard', price: '$ 499' },
  { key: 'starter', price: '$ 199' },
];
