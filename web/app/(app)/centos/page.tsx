import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listCentos } from '@/lib/data/centos';
import { CentosManager } from '@/components/centos/centos-manager';

/**
 * /centos — the "Lista Centos" (list of 100) manager (CRM, doc 01 §4.2 /
 * ADR-008 slug).
 *
 * Server component. Reads the caller's position-ordered Centos entries through
 * the demo-safe data layer, which falls back to the mock list when Supabase env
 * is missing OR a query fails — so this page builds and renders with no env
 * (RESILIENCE). All data access happens here at request time; the interactive
 * list/sheets receive plain serialized rows and run mutations through demo-safe
 * Server Actions.
 *
 * Marked dynamic because the data layer reads request cookies/Supabase — this
 * keeps prerender from crashing while still degrading to demo data with no env.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('centos');
  return { title: t('title') };
}

export default async function CentosPage() {
  const listRes = await listCentos();

  return (
    <CentosManager initialEntries={listRes.data} initialDemo={listRes.demo} />
  );
}
