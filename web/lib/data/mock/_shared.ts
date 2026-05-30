/**
 * Shared demo constants for the CRM mock datasets. Ties the CRM sample data to
 * the genealogy demo tree (`mock-genealogy.ts`) so a demo session — which is the
 * root marketer `nroot` (Marco De Santis) — sees a coherent "my data / my team"
 * slice. The data layer scopes mock reads to {@link DEMO_OWNER_ID} + the demo
 * downline when it needs to mimic the RLS subtree.
 */
import { MOCK_ROOT_ID } from '@/lib/data/mock-genealogy';

/** The demo org id (mirrors `DEMO_CLAIMS.org_id` in lib/data/session.ts). */
export const DEMO_ORG_ID = 'demo-org';

/** The demo caller's marketer id (root of the demo tree). */
export const DEMO_OWNER_ID = MOCK_ROOT_ID;

/**
 * A few downline marketer ids from the demo tree, used to spread ownership of
 * the CRM sample rows so "my team" views are non-trivial. These are real ids
 * from `mock-genealogy.ts` SEEDS.
 */
export const DEMO_TEAM_IDS = [
  MOCK_ROOT_ID, // Marco De Santis (self)
  'nL', // Giulia Bianchi
  'nR', // Luca Ferrari
  'nLL', // Sara Conti
  'nRL', // Elena Moretti
  'nLLL', // Anna Costa
] as const;

/** Deterministic ISO timestamp helper: now minus N days (+ optional hours). */
export function daysAgo(days: number, hours = 0): string {
  const base = new Date('2026-05-30T09:00:00.000Z').getTime();
  return new Date(base - days * 86_400_000 - hours * 3_600_000).toISOString();
}

/** Deterministic ISO timestamp helper: now plus N days (future follow-ups). */
export function daysFromNow(days: number, hours = 0): string {
  const base = new Date('2026-05-30T09:00:00.000Z').getTime();
  return new Date(base + days * 86_400_000 + hours * 3_600_000).toISOString();
}

/** Stable, dependency-free id generator for simulated (demo) mutations. */
export function demoId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}
