import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PanelLeft, PanelRight, Users } from 'lucide-react';
import { getNode } from '@/lib/data/genealogy';
import { getCurrentClaims } from '@/lib/data/session';
import { listProspectBoard } from '@/lib/data/prospects';
import { listCentos } from '@/lib/data/centos';
import { getSevenWhysFor } from '@/lib/data/seven-whys';
import { getMarketerProfile } from '@/lib/data/team';
import { getWishlist } from '@/lib/data/wishlist';
import { RANK_ORDER, STATUS_LABELS } from '@/lib/types/db';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { EmptyState } from '@/components/crm/empty-state';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { ProspectBoard } from '@/components/prospects/prospect-board';
import type { BoardView, ProspectView } from '@/components/prospects/types';
import { CentosManager } from '@/components/centos/centos-manager';
import { SevenWhysDetail } from '@/components/seven-whys/seven-whys-detail';
import { MarketerProfileTabs } from '@/components/team/marketer-profile-tabs';
import { MarketerAnagrafica } from '@/components/team/marketer-anagrafica';
import { PersonalFiles } from '@/components/team/personal-files';
import { formatNumber } from '@/lib/utils';

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
  const tc = await getTranslations('crm');

  const nodeRes = await getNode(params.id);
  const node = nodeRes.data;
  if (!node) notFound();

  const [claimsRes, boardRes, centosRes, whysRes, profileRes, wishlistRes] =
    await Promise.all([
      getCurrentClaims(),
      listProspectBoard({ ownerMarketerId: node.id }),
      listCentos(node.id),
      getSevenWhysFor(node.id),
      getMarketerProfile(node.id),
      getWishlist(node.id),
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
      <PageHeader
        title={node.display_name}
        description={isSelf ? t('subtitle_self') : t('subtitle_other')}
        breadcrumbs={[
          { label: t('breadcrumb'), href: '/statistiche' },
          { label: node.display_name },
        ]}
      />

      {demo && <ConfigNotice variant="inline" />}

      {/* Profile header */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Avatar name={node.display_name} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">
                {node.display_name}
                {isSelf && (
                  <Badge variant="default" className="ml-2 px-1.5 py-0">
                    {t('you')}
                  </Badge>
                )}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <RankBadge rank={node.rank} />
                <Badge
                  variant={
                    node.status === 'active'
                      ? 'success'
                      : node.status === 'suspended'
                        ? 'danger'
                        : node.status === 'pending'
                          ? 'warning'
                          : 'secondary'
                  }
                >
                  {STATUS_LABELS[node.status]}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1.5 text-branch-left">
              <PanelLeft className="h-4 w-4" aria-hidden />
              <span className="font-semibold tabular-nums">{formatNumber(node.left_count)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Users className="h-4 w-4" aria-hidden />
              <span className="font-semibold tabular-nums text-foreground">
                {formatNumber(node.team_size)}
              </span>{' '}
              {tc('all').toLowerCase()}
            </span>
            <span className="inline-flex items-center gap-1.5 text-branch-right">
              <PanelRight className="h-4 w-4" aria-hidden />
              <span className="font-semibold tabular-nums">{formatNumber(node.right_count)}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Anagrafica — the member's primary data (nome, sponsor, pacchetto, … ) */}
      {profile && <MarketerAnagrafica profile={profile} canEdit={canEdit} />}

      <MarketerProfileTabs
        defaultTab={parseTab(searchParams?.tab)}
        prospects={prospectsPanel}
        centos={centosPanel}
      />

      {/* Secondary personal files: 7 Perché + 100's list (open in a window) */}
      <PersonalFiles
        sevenWhys={sevenWhysPanel}
        wishlistItems={wishlistRes.items}
        marketerId={node.id}
        canEdit={isSelf}
      />
    </div>
  );
}
