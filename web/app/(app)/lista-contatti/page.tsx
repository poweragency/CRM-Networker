import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listListaContatti } from '@/lib/data/lista-contatti';
import { ListaContattiManager } from '@/components/lista-contatti/lista-contatti-manager';
import { ListaContattiStoreProvider } from '@/components/team/lista-contatti-store';

/**
 * /lista-contatti — the "Lista contatti" (list of 100) manager (CRM, doc 01 §4.2 /
 * ADR-008 slug).
 *
 * Server component. Reads the caller's position-ordered Lista contatti entries through
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
  const t = await getTranslations('listaContatti');
  return { title: t('title') };
}

export default async function ListaContattiPage() {
  const listRes = await listListaContatti();

  return (
    <ListaContattiStoreProvider
      initialEntries={listRes.data}
      initialDemo={listRes.demo}
    >
      <ListaContattiManager />
    </ListaContattiStoreProvider>
  );
}
