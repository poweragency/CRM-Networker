import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listSevenWhys } from '@/lib/data/seven-whys';
import { SevenWhysManager } from '@/components/seven-whys/seven-whys-manager';

/**
 * /sette-perche — the Sette Perché methodology screen (CRM, doc 01 §4.3 /
 * ADR-008 slug).
 *
 * Server component. Reads the caller's roster — their own record plus every
 * visible downline marketer's record (read-subtree) — through the demo-safe data
 * layer, which falls back to the mock dataset when Supabase env is missing OR a
 * query fails, so this page builds and renders with no env (RESILIENCE). The
 * interactive hero/grid/editor receive plain serialized rows and run the
 * write-own mutation through a demo-safe Server Action.
 *
 * Dynamic because the data layer reads request cookies/Supabase.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('sette_perche');
  return { title: t('title') };
}

export default async function SettePerchePage() {
  const res = await listSevenWhys();
  return <SevenWhysManager initialRows={res.data} initialDemo={res.demo} />;
}
