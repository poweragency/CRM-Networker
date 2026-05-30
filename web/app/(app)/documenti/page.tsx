import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listDocuments, listDocumentTags } from '@/lib/data/documents';
import { getNode } from '@/lib/data/genealogy';
import { DocumentsWorkspace } from '@/components/documents/documents-workspace';

/**
 * /documenti — the internal knowledge base (CRM, doc 01 §4.4 / ADR-009 #5 /
 * ADR-008 slug). Rich-text-only structured documents, NO file uploads.
 *
 * Server component. Reads the caller's visible documents (including archived, so
 * the client can toggle them in-memory) + the tag universe through the demo-safe
 * data layer, which falls back to the mock document set when Supabase env is
 * missing OR a query fails — so this page builds and renders with no env
 * (RESILIENCE). It also resolves the distinct author/editor marketer ids to
 * display names (demo-safe via the genealogy layer) so the reader can show
 * "Autore" + "Ultima modifica" by name. All data access happens here at request
 * time; the interactive library + editor receive plain serialized data and run
 * mutations through demo-safe Server Actions.
 *
 * Marked dynamic because the data layer reads request cookies/Supabase — keeps
 * prerender from crashing while still degrading to demo data with no env.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('documenti');
  return { title: t('title') };
}

export default async function DocumentiPage() {
  // Full set (including archived) + tag universe. The client filters archived
  // in-memory via the "Mostra archiviati" toggle, so a single read suffices.
  const [listRes, tagsRes] = await Promise.all([
    listDocuments({ includeArchived: true }),
    listDocumentTags(),
  ]);

  const documents = listRes.data;

  // Resolve the distinct author/editor marketer ids → display names (demo-safe).
  const authorIds = Array.from(
    new Set(
      documents.flatMap((d) => [d.created_by, d.updated_by]).filter(
        (id): id is string => Boolean(id),
      ),
    ),
  );
  const nodes = await Promise.all(authorIds.map((id) => getNode(id)));
  const authors: Record<string, string> = {};
  authorIds.forEach((id, i) => {
    const node = nodes[i]?.data;
    if (node) authors[id] = node.display_name;
  });

  const initialDemo = listRes.demo || tagsRes.demo;

  return (
    <DocumentsWorkspace
      initialDocuments={documents}
      initialTags={tagsRes.data}
      authors={authors}
      initialDemo={initialDemo}
    />
  );
}
