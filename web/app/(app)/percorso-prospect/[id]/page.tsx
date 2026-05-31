import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Clock, History, Phone, User } from 'lucide-react';
import { PageHeader } from '@/components/crm/page-header';
import { StatusPill } from '@/components/crm/status-pill';
import { ConfigNotice } from '@/components/config-notice';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { getProspectById } from '@/lib/data/prospects';
import { listCalls } from '@/lib/data/calls';
import { getNode } from '@/lib/data/genealogy';
import { JourneyTimeline } from '@/components/prospects/journey-timeline';
import { ProspectCalls } from '@/components/prospects/prospect-calls';
import { FunnelProgress } from '@/components/prospects/funnel-progress';
import { StageChanger } from '@/components/prospects/stage-changer';
import { stageIndex, type ProspectJourneyEvent } from '@/lib/types/db';
import { formatDate, formatRelativeTime } from '@/lib/utils';

/**
 * /percorso-prospect/[id] — the prospect detail (RSC).
 *
 * Reads the prospect joined with its ordered journey history and the calls
 * linked to it through the demo-safe, server-only data layer, resolves the
 * owner + responsible marketer names via the genealogy layer, and renders the
 * funnel position, the stage-history timeline and the call log. The "Cambia
 * fase" control (client) commits transitions via the server action.
 *
 * Dynamic because the data layer reads request cookies/Supabase.
 */
export const dynamic = 'force-dynamic';

export default async function ProspectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const t = await getTranslations('prospect');

  const res = await getProspectById(params.id);
  const prospect = res.data;
  if (!prospect) notFound();

  const callsRes = await listCalls({ prospectId: prospect.id });

  // Resolve owner + every responsible marketer in the journey to display names.
  const marketerIds = Array.from(
    new Set([
      prospect.owner_marketer_id,
      ...prospect.journey.map((e: ProspectJourneyEvent) => e.responsible_marketer_id),
    ]),
  );
  const nameEntries = await Promise.all(
    marketerIds.map(async (id) => {
      const node = await getNode(id);
      return [id, node.data?.display_name ?? 'Marketer'] as const;
    }),
  );
  const names = Object.fromEntries(nameEntries);
  const ownerName = names[prospect.owner_marketer_id] ?? 'Marketer';

  const demo = res.demo || callsRes.demo;
  const idx = stageIndex(prospect.current_stage);

  return (
    <div className="space-y-5">
      <PageHeader
        title={prospect.full_name}
        breadcrumbs={[
          { label: 'CRM' },
          { label: t('title'), href: '/percorso-prospect' },
          { label: prospect.full_name },
        ]}
        actions={
          <StageChanger
            prospectId={prospect.id}
            currentStage={prospect.current_stage}
          />
        }
      />

      {demo && <ConfigNotice variant="inline" />}

      {/* Summary card */}
      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill kind="stage" value={prospect.current_stage} />
            <span className="text-xs tabular-nums text-muted-foreground">
              Fase {idx}/6
            </span>
            <StatusPill kind="prospect" value={prospect.outcome} />
          </div>

          <FunnelProgress current={prospect.current_stage} />

          <Separator />

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3.5 w-3.5" aria-hidden />
                Responsabile
              </dt>
              <dd className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Avatar name={ownerName} size="sm" className="h-5 w-5 text-[9px]" />
                <span className="truncate">{ownerName}</span>
              </dd>
            </div>

            <div className="space-y-1">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                In fase da
              </dt>
              <dd className="text-sm font-medium text-foreground">
                {formatRelativeTime(prospect.current_stage_since)}
              </dd>
            </div>

            <div className="space-y-1">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <History className="h-3.5 w-3.5" aria-hidden />
                Nel funnel da
              </dt>
              <dd className="text-sm font-medium text-foreground">
                {formatDate(prospect.entered_funnel_at)}
              </dd>
            </div>
          </dl>

          {prospect.notes && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Note</p>
                <p className="text-sm text-foreground">{prospect.notes}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Journey history */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex-row items-center gap-2 space-y-0 p-5 pb-3">
            <History className="h-4 w-4 text-muted-foreground" aria-hidden />
            <CardTitle>{t('journey_history')}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-2">
            <JourneyTimeline
              events={prospect.journey}
              responsibleNames={names}
            />
          </CardContent>
        </Card>

        {/* Calls */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between space-y-0 p-5 pb-3">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle>Chiamate</CardTitle>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
              {callsRes.data.length}
            </span>
          </CardHeader>
          <CardContent className="p-5 pt-2">
            <ProspectCalls calls={callsRes.data} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
