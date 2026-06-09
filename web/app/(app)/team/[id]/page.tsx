import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getNode } from '@/lib/data/genealogy';
import { getCurrentClaims } from '@/lib/data/session';
import { isOrgAdmin } from '@/lib/data/authz';
import { listProspectBoard } from '@/lib/data/prospects';
import { listListaContatti } from '@/lib/data/lista-contatti';
import { getSevenWhysFor } from '@/lib/data/seven-whys';
import { getMarketerProfile } from '@/lib/data/team';
import { getWishlist } from '@/lib/data/wishlist';
import { getFormazioneProgress } from '@/lib/data/formazione';
import { getDmoStatus } from '@/lib/data/streak';
import { ConfigNotice } from '@/components/config-notice';
import { EmptyState } from '@/components/crm/empty-state';
import { ProspectBoard } from '@/components/prospects/prospect-board';
import type { BoardView, ProspectView } from '@/components/prospects/types';
import { ListaContattiManager } from '@/components/lista-contatti/lista-contatti-manager';
import { ListaContattiStoreProvider } from '@/components/team/lista-contatti-store';
import { SevenWhysDetail } from '@/components/seven-whys/seven-whys-detail';
import { MarketerProfileTabs } from '@/components/team/marketer-profile-tabs';
import { AnagraficaModal } from '@/components/team/anagrafica-modal';
import { MarketerHero } from '@/components/team/marketer-hero';
import { MarketerKpis } from '@/components/team/marketer-kpis';
import { PerformanceModal } from '@/components/team/performance-modal';
import { MarketerSections } from '@/components/team/marketer-sections';
import { MarketerFormazione } from '@/components/team/marketer-formazione';
import { PersonalFiles } from '@/components/team/personal-files';

/**
 * /team/[id] — the single-marketer profile hub (the "person card"). RSC.
 *
 * Percorso Prospect, Lista 100 and Sette Perché are PER-PERSON files (owned by a
 * marketer), so they live here — scoped to this marketer — instead of the global
 * menu. Reached from the genealogy node panel, the admin registry and the
 * Dashboard (own profile). All data flows through the demo-safe layer (RLS scopes
 * reads to the caller's visible subtree; mock fallback with no env). The viewer's
 * OWN records are editable; a downline's Sette Perché is read-only.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const { data: node } = await getNode(params.id);
  return { title: node?.display_name ?? 'Marketer' };
}

const TABS = ['prospects', 'lista-contatti'] as const;
type Tab = (typeof TABS)[number];

function parseTab(value: string | string[] | undefined): Tab {
  const v = Array.isArray(value) ? value[0] : value;
  return TABS.includes(v as Tab) ? (v as Tab) : 'prospects';
}

export default async function MarketerProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string | string[] };
}) {
  const t = await getTranslations('team');

  const nodeRes = await getNode(params.id);
  const node = nodeRes.data;
  if (!node) notFound();

  const [
    claimsRes,
    boardRes,
    listaContattiRes,
    whysRes,
    profileRes,
    wishlistRes,
    formazioneRes,
  ] = await Promise.all([
    getCurrentClaims(),
    listProspectBoard({ ownerMarketerId: node.id }),
    listListaContatti(node.id),
    getSevenWhysFor(node.id),
    getMarketerProfile(node.id),
    getWishlist(node.id),
    getFormazioneProgress(node.id),
  ]);

  const isSelf = claimsRes.claims.marketer_id === node.id;
  // "Catena d'Oro" streak — own profile only (it's the caller's personal DMO).
  const dmo = isSelf ? await getDmoStatus() : null;
  // RLS scopes profiles to the viewer's subtree, so any profile that loads is the
  // viewer's own or a downline's — both editable. Rank/renewal: a downline (the
  // server re-enforces the strict-upline rule), PLUS the org admin/owner on their
  // OWN profile — there's no upline above them to set their rank, so they self-manage.
  const canEdit = true;
  const canEditIdentity = !isSelf || isOrgAdmin(claimsRes.claims);
  const profile = profileRes.data;
  const demo =
    nodeRes.demo ||
    claimsRes.demo ||
    boardRes.demo ||
    listaContattiRes.demo ||
    whysRes.demo ||
    profileRes.demo;

  // This marketer's OWN prospects (stage + funnel-entry date) → the personal
  // performance widget filters them by period client-side.
  const personalProspects = boardRes.data.columns.flatMap((col) =>
    col.prospects.map((p) => ({
      stage: p.current_stage,
      enteredFunnelAt: p.entered_funnel_at,
    })),
  );

  // Build the board view (single owner → all rows carry this marketer's name).
  const board: BoardView = {
    total: boardRes.data.total,
    columns: boardRes.data.columns.map((col) => {
      const prospects: ProspectView[] = col.prospects.map((p) => ({
        ...p,
        owner_name: node.display_name,
      }));
      return {
        stage: col.stage,
        prospects,
      };
    }),
  };

  const whysRow = whysRes.data;

  const prospectsPanel = (
    <ProspectBoard
      board={board}
      demo={demo}
      contacts={[]}
      ownerName={node.display_name}
      ownerMarketerId={node.id}
      backHref={`/team/${node.id}?tab=prospects`}
      // Lista mirror cards link to the Lista page only on the viewer's OWN board
      // (that page shows the caller's own list; not a downline's).
      listaHref={isSelf ? '/lista-contatti' : undefined}
    />
  );

  const listaContattiPanel = <ListaContattiManager />;

  const sevenWhysPanel = whysRow ? (
    <SevenWhysDetail
      record={whysRow.record}
      personName={whysRow.person_name}
      readOnly={!whysRow.is_self}
      marketerId={whysRow.marketer_id}
    />
  ) : (
    <EmptyState title={t('seven_whys_unavailable')} description={t('seven_whys_unavailable_body')} />
  );

  return (
    <div className="animate-fade-in space-y-5">
      {demo && <ConfigNotice variant="inline" />}

      {/* Identity masthead — always visible (the numbers live in Produzione).
          The Anagrafica button rides to the right of the name so it's reachable
          from any tab. Rank + renewal are editable only on a DOWNLINE. */}
      <MarketerHero
        node={node}
        isSelf={isSelf}
        phone={profile?.phone ?? null}
        streak={dmo}
        action={
          profile ? (
            <AnagraficaModal
              profile={profile}
              canEdit={canEdit}
              canEditIdentity={canEditIdentity}
            />
          ) : null
        }
      />

      {/* File personali (7 Perché + 100's list) — subito sotto l'intestazione,
          fuori dallo switch: restano visibili sia in Produzione che in Formazione. */}
      <PersonalFiles
        sevenWhys={sevenWhysPanel}
        wishlistItems={wishlistRes.items}
        marketerId={node.id}
        canEdit={isSelf}
      />

      {/* Produzione (tutto l'operativo) + Formazione (playlist / libri).
          I numeri vivono dentro Produzione. */}
      <MarketerSections
        production={
          <>
            <MarketerKpis node={node} />
            <div className="flex justify-center py-1">
              <PerformanceModal prospects={personalProspects} />
            </div>
            <ListaContattiStoreProvider
              initialEntries={listaContattiRes.data}
              initialDemo={demo}
            >
              <MarketerProfileTabs
                defaultTab={parseTab(searchParams?.tab)}
                prospects={prospectsPanel}
                listaContatti={listaContattiPanel}
              />
            </ListaContattiStoreProvider>
          </>
        }
        formazione={
          <MarketerFormazione
            marketerId={node.id}
            initialDone={formazioneRes.done}
            readOnly={!canEdit}
          />
        }
      />
    </div>
  );
}
