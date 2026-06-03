import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getCurrentClaims } from '@/lib/data/session';
import { getNode } from '@/lib/data/genealogy';
import { listProspectBoard } from '@/lib/data/prospects';
import { listCentos } from '@/lib/data/centos';
import { getSevenWhysFor } from '@/lib/data/seven-whys';
import { getMarketerProfile } from '@/lib/data/team';
import { getWishlist } from '@/lib/data/wishlist';
import { getFormazioneProgress } from '@/lib/data/formazione';
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
 * /impostazioni — the caller's OWN profile hub (the "Profilo" menu item). RSC.
 * Mirrors the /team/[id] layout but scoped to the logged-in marketer: hero +
 * editable anagrafica, the Percorsi informativi / Lista contatti tabs, and the
 * personal files (7 Perché + 100's list) — same format as everyone else's card —
 * plus an Account + appearance block at the bottom. Demo-safe data layer.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('impostazioni');
  return { title: t('title') };
}

const TABS = ['prospects', 'centos'] as const;
type Tab = (typeof TABS)[number];

function parseTab(value: string | string[] | undefined): Tab {
  const v = Array.isArray(value) ? value[0] : value;
  return TABS.includes(v as Tab) ? (v as Tab) : 'prospects';
}

export default async function ImpostazioniPage({
  searchParams,
}: {
  searchParams?: { tab?: string | string[] };
}) {
  const tt = await getTranslations('team');

  const { claims, demo: claimsDemo, email } = await getCurrentClaims();
  const meId = claims.marketer_id;

  const [
    nodeRes,
    boardRes,
    centosRes,
    whysRes,
    profileRes,
    wishlistRes,
    formazioneRes,
  ] = await Promise.all([
    getNode(meId),
    listProspectBoard({ ownerMarketerId: meId }),
    listCentos(meId),
    getSevenWhysFor(meId),
    getMarketerProfile(meId),
    getWishlist(meId),
    getFormazioneProgress(meId),
  ]);

  const node = nodeRes.data;
  const profile = profileRes.data;
  const demo =
    claimsDemo ||
    nodeRes.demo ||
    boardRes.demo ||
    centosRes.demo ||
    whysRes.demo ||
    profileRes.demo;

  const ownerName = node?.display_name ?? (email ? email.split('@')[0]! : 'Profilo');

  // The caller's OWN prospects (stage + funnel-entry date) → personal KPIs.
  const personalProspects = boardRes.data.columns.flatMap((col) =>
    col.prospects.map((p) => ({
      stage: p.current_stage,
      enteredFunnelAt: p.entered_funnel_at,
    })),
  );

  // Board view (single owner → all rows carry the caller's name).
  const board: BoardView = {
    total: boardRes.data.total,
    columns: boardRes.data.columns.map((col) => {
      const prospects: ProspectView[] = col.prospects.map((p) => ({
        ...p,
        owner_name: ownerName,
      }));
      return { stage: col.stage, prospects };
    }),
  };

  const whysRow = whysRes.data;

  const prospectsPanel = (
    <ProspectBoard board={board} demo={demo} contacts={[]} ownerName={ownerName} />
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
    <EmptyState
      title={tt('seven_whys_unavailable')}
      description={tt('seven_whys_unavailable_body')}
    />
  );

  return (
    <div className="space-y-5">
      {demo && <ConfigNotice variant="inline" />}

      {/* Hero masthead (own profile) — the Anagrafica button rides to the right
          of the name so it stays visible from any tab. */}
      {node && (
        <MarketerHero
          node={node}
          isSelf
          crmAccess={claims.crm_access}
          action={profile ? <AnagraficaModal profile={profile} canEdit /> : null}
        />
      )}

      {/* Produzione (tutto l'operativo) + Formazione (playlist / libri).
          Lo switch sta subito sotto l'intestazione identità (sempre visibile);
          i numeri vivono dentro Produzione. */}
      <MarketerSections
        production={
          <>
            {node && <MarketerKpis node={node} prospects={personalProspects} />}
            <MarketerProfileTabs
              defaultTab={parseTab(searchParams?.tab)}
              prospects={prospectsPanel}
              centos={centosPanel}
            />
            <PersonalFiles
              sevenWhys={sevenWhysPanel}
              wishlistItems={wishlistRes.items}
              marketerId={meId}
              canEdit
            />
          </>
        }
        formazione={
          <MarketerFormazione marketerId={meId} initialDone={formazioneRes.done} />
        }
      />
    </div>
  );
}
