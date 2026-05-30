import { getTranslations } from 'next-intl/server';
import { GitBranch } from 'lucide-react';
import { PageHeader } from '@/components/crm/page-header';
import { listProspectBoard } from '@/lib/data/prospects';
import { listContacts } from '@/lib/data/contacts';
import { getNode } from '@/lib/data/genealogy';
import { getCurrentClaims } from '@/lib/data/session';
import { ProspectBoard } from '@/components/prospects/prospect-board';
import type { ContactOption } from '@/components/prospects/new-prospect-sheet';
import type { BoardView, ProspectView } from '@/components/prospects/types';

/**
 * /percorso-prospect — the prospect-journey kanban board (RSC).
 *
 * Reads the funnel board (prospects grouped by the 6 canonical stages) and the
 * contact list through the demo-safe, server-only data layer (Supabase-then-MOCK
 * fallback), resolves each owner's display name via the genealogy data layer,
 * and hands a plain serialized board to the client orchestrator. All Supabase
 * access happens here at request time; the client tree receives only props.
 *
 * Marked dynamic because the data layer reads request cookies/Supabase — this
 * keeps prerender from crashing while still degrading to demo data with no env.
 */
export const dynamic = 'force-dynamic';

export default async function PercorsoProspectPage() {
  const t = await getTranslations('prospect');

  const [boardRes, contactsRes, { claims, demo: claimsDemo }] =
    await Promise.all([
      listProspectBoard(),
      listContacts({ sortBy: 'first_name', sortDir: 'asc' }),
      getCurrentClaims(),
    ]);

  // Resolve owner display names once (unique ids → node lookup, demo-safe).
  const ownerIds = Array.from(
    new Set(
      boardRes.data.columns.flatMap((c) =>
        c.prospects.map((p) => p.owner_marketer_id),
      ),
    ),
  );
  const ownerEntries = await Promise.all(
    ownerIds.map(async (id) => {
      const node = await getNode(id);
      return [id, node.data?.display_name ?? 'Marketer'] as const;
    }),
  );
  const ownerNames = new Map(ownerEntries);

  const board: BoardView = {
    total: boardRes.data.total,
    columns: boardRes.data.columns.map((col) => {
      const prospects: ProspectView[] = col.prospects.map((p) => ({
        ...p,
        owner_name: ownerNames.get(p.owner_marketer_id) ?? 'Marketer',
      }));
      return {
        stage: col.stage,
        prospects,
        value_total: prospects.reduce(
          (acc, p) => acc + (p.expected_value ?? 0),
          0,
        ),
      };
    }),
  };

  // Contact options for the "Da un contatto" select.
  const contacts: ContactOption[] = contactsRes.data.map((c) => ({
    id: c.id,
    label: `${c.first_name} ${c.last_name ?? ''}`.trim(),
  }));

  // The caller's own display name → owner of optimistically created prospects.
  const self = await getNode(claims.marketer_id);
  const ownerName = self.data?.display_name ?? 'Tu';

  const demo = claimsDemo || boardRes.demo || contactsRes.demo;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        icon={<GitBranch className="rotate-90" />}
        breadcrumbs={[
          { label: 'CRM' },
          { label: t('title') },
        ]}
      />

      <ProspectBoard
        board={board}
        demo={demo}
        contacts={contacts}
        ownerName={ownerName}
      />
    </div>
  );
}
