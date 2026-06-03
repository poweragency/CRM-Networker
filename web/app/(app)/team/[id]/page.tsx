import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getNode } from '@/lib/data/genealogy';
import { getCurrentClaims } from '@/lib/data/session';
import { listProspectBoard } from '@/lib/data/prospects';
import { listCentos } from '@/lib/data/centos';
import { getSevenWhysFor } from '@/lib/data/seven-whys';
import { getMarketerProfile } from '@/lib/data/team';
import { getWishlist } from '@/lib/data/wishlist';
import { getFormazioneProgress } from '@/lib/data/formazione';
import { RANK_ORDER } from '@/lib/types/db';
import { ConfigNotice } from '@/components/config-notice';
import { EmptyState } from '@/components/crm/empty-state';
import { ProspectBoard } from '@/components/prospects/prospect-board';
import type { BoardView, ProspectView } from '@/components/prospects/types';
import { CentosManager } from '@/components/centos/centos-manager';
import { SevenWhysDetail } from '@/components/seven-whys/seven-whys-detail';
import { MarketerProfileTabs } from '@/components/team/marketer-profile-tabs';
import { AnagraficaModal } from '@/components/team/anagrafica-modal';
import { MarketerHero } from '@/components/team/marketer-hero';
import { MarketerKpis } from '@/components/team/marketer-kpis';
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

const TABS = ['prospects', 'centos'] as const;
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
    centosRes,
    whysRes,
    profileRes,
    wishlistRes,
    formazioneRes,
  ] = await Promise.all([
    getCurrentClaims(),
    listProspectBoard({ ownerMarketerId: node.id }),
    listCentos(node.id),
    getSevenWhysFor(node.id),
    getMarketerProfile(node.id),
    getWishlist(node.id),
    getFormazioneProgress(node.id),
  ]);

  const isSelf = claimsRes.claims.marketer_id === node.id;
  const claims = claimsRes.claims;
  // The viewer can edit this anagrafica if it's their own profile, or they are an
  // admin/owner, or rank ≥ team_leader (consistent with the activation gating).
  const canEdit =
    isSelf ||
    claims.role === 'admin' ||
    claims.role === 'owner' ||
    RANK_ORDER.indexOf(claims.rank) >= RANK_ORDER.indexOf('team_leader');
  const profile = profileRes.data;
  const demo =
    nodeRes.demo ||
    claimsRes.demo ||
    boardRes.demo ||
    centosRes.demo ||
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
    <ProspectBoard board={board} demo={demo} contacts={[]} ownerName={node.display_name} />
  );

  const centosPanel = (
    <CentosManager initialEntries={centosRes.data} initialDemo={demo} />
  );

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
    <div className="space-y-5">
      {demo && <ConfigNotice variant="inline" />}

      {/* Identity masthead — always visible (the numbers live in Produzione).
          The Anagrafica button rides to the right of the name so it's reachable
          from any tab. Rank + renewal are editable only on a DOWNLINE. */}
      <MarketerHero
        node={node}
        isSelf={isSelf}
        crmAccess={profile?.crm_access ?? false}
        phone={profile?.phone ?? null}
        action={
          profile ? (
            <AnagraficaModal
              profile={profile}
              canEdit={canEdit}
              canEditIdentity={canEdit && !isSelf}
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
            <MarketerKpis node={node} prospects={personalProspects} />
            <MarketerProfileTabs
              defaultTab={parseTab(searchParams?.tab)}
              prospects={prospectsPanel}
              centos={centosPanel}
            />
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
