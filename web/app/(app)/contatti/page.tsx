import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listContacts, listContactTags } from '@/lib/data/contacts';
import { ContactsManager } from '@/components/contacts/contacts-manager';

/**
 * /contatti — the contact manager (CRM, doc 01 §4.1 / ADR-008 slug).
 *
 * Server component. Reads the caller's visible contacts + the tag universe
 * through the demo-safe data layer, which falls back to the mock contact set
 * when Supabase env is missing OR a query fails — so this page builds and
 * renders with no env (RESILIENCE). All data access happens here at request
 * time; the interactive table/sheets receive plain serialized rows and run the
 * mutations through demo-safe Server Actions.
 *
 * Marked dynamic because the data layer reads request cookies/Supabase — this
 * keeps prerender from crashing while still degrading to demo data with no env.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('contatti');
  return { title: t('title') };
}

export default async function ContattiPage() {
  // Initial unfiltered list (newest first) + tag universe for suggestions/filter.
  const [listRes, tagsRes] = await Promise.all([
    listContacts({ sortBy: 'created_at', sortDir: 'desc' }),
    listContactTags(),
  ]);

  const initialDemo = listRes.demo || tagsRes.demo;

  return (
    <ContactsManager
      initialContacts={listRes.data}
      initialTags={tagsRes.data}
      initialDemo={initialDemo}
    />
  );
}
