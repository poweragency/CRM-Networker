import type { StartingPackage } from '@/lib/types/db';

/**
 * Static content for the Informativa section: package prices + downloadable PDFs.
 * Prices are shown in dollars (+ IVA); PDF urls are placeholders for now (to be
 * replaced with the official files) — pure data, no env required.
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
  { key: 'signature', price: '$ 1.999', featured: true },
  { key: 'premium', price: '$ 999' },
  { key: 'standard', price: '$ 499' },
  { key: 'starter', price: '$ 199' },
];

export type MaterialType = 'pdf' | 'link';

export interface MaterialItem {
  title: string;
  type: MaterialType;
  /** Placeholder until the real assets are uploaded. */
  url: string;
}

/** A named folder grouping downloadable materials. */
export interface MaterialFolder {
  title: string;
  items: MaterialItem[];
}

/** The PDF section: downloadable materials organised in folders. */
export const MATERIAL_FOLDERS: MaterialFolder[] = [
  {
    title: 'Business Info',
    items: [
      { title: 'Business Info', type: 'pdf', url: '#' },
      { title: 'Linktree materiale post Business Info', type: 'link', url: '#' },
    ],
  },
  {
    title: 'Follow Up',
    items: [
      { title: 'Follow Up', type: 'pdf', url: '#' },
      { title: 'Linktree materiale post Follow Up', type: 'link', url: '#' },
    ],
  },
  {
    title: 'GPS',
    items: [
      { title: 'GPS 1', type: 'pdf', url: '#' },
      { title: 'GPS 2', type: 'pdf', url: '#' },
      { title: 'GPS 3', type: 'pdf', url: '#' },
      { title: 'GPS Freddi', type: 'pdf', url: '#' },
    ],
  },
];
