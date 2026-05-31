import type { StartingPackage } from '@/lib/types/db';

/**
 * Static content for the Informativa section: package prices + useful materials.
 * Prices and materials are placeholders for now (to be replaced with the official
 * values/files) — pure data, no env required.
 */

export interface PackageInfo {
  key: StartingPackage;
  /** Display price (indicative — replace with official figures). */
  price: string;
  tagline: string;
  features: string[];
  /** Highlight the flagship package. */
  featured?: boolean;
}

/** Highest → lowest, matching STARTING_PACKAGE_ORDER. */
export const PACKAGE_INFO: PackageInfo[] = [
  {
    key: 'signature',
    price: '€ 1.999',
    tagline: 'Il pacchetto completo, top di gamma.',
    featured: true,
    features: [
      'Accesso completo alla piattaforma',
      'Tutti i percorsi formativi',
      'Materiali premium e bonus',
      'Supporto prioritario',
    ],
  },
  {
    key: 'premium',
    price: '€ 999',
    tagline: 'Per chi vuole accelerare sul serio.',
    features: [
      'Accesso alla piattaforma',
      'Percorsi formativi avanzati',
      'Materiali premium',
    ],
  },
  {
    key: 'standard',
    price: '€ 499',
    tagline: 'Tutto l’essenziale per partire bene.',
    features: ['Accesso alla piattaforma', 'Percorsi formativi base'],
  },
  {
    key: 'starter',
    price: '€ 199',
    tagline: 'Il primo passo, per iniziare.',
    features: ['Accesso base alla piattaforma'],
  },
];

export type MaterialType = 'pdf' | 'video' | 'link';

export interface MaterialInfo {
  title: string;
  type: MaterialType;
  description: string;
  /** Placeholder until the real assets are uploaded. */
  url: string;
}

export const MATERIALS: MaterialInfo[] = [
  {
    title: 'Presentazione aziendale',
    type: 'pdf',
    description: 'La presentazione ufficiale del business (PDF).',
    url: '#',
  },
  {
    title: 'Listino pacchetti',
    type: 'pdf',
    description: 'Il dettaglio completo dei pacchetti e dei prezzi (PDF).',
    url: '#',
  },
  {
    title: 'Guida ai percorsi formativi',
    type: 'pdf',
    description: 'Come funzionano i percorsi informativi (PDF).',
    url: '#',
  },
  {
    title: 'Video introduttivo',
    type: 'video',
    description: 'Una panoramica in pochi minuti.',
    url: '#',
  },
];
