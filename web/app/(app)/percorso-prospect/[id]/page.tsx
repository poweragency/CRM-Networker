import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Clock, History, User } from 'lucide-react';
import { PageHeader } from '@/components/crm/page-header';
import { ConfigNotice } from '@/components/config-notice';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { getProspectById } from '@/lib/data/prospects';
import { getProspectExtra } from '@/lib/data/prospect-extras';
import { getContactById } from '@/lib/data/contacts';
import { getNode } from '@/lib/data/genealogy';
import { ProspectDetail } from '@/components/prospects/prospect-detail';
import { WhatsAppButton } from '@/components/crm/whatsapp-button';
import { formatDate, formatRelativeTime } from '@/lib/utils';

/**
 * /percorso-prospect/[id] — the prospect detail (RSC).
 *
 * Reads the prospect through the demo-safe data layer, resolves the owner name,
 * and renders a compact summary (responsabile + timing) plus the interactive
 * {@link ProspectDetail}: the funnel itself is the stage control (click a phase +
 * "Salva fase"), followed by the editable profilazione / pacchetto / note block.
 * The old stage-history timeline and the calls panel were removed.
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

  const ownerRes = await getNode(prospect.owner_marketer_id);
  const ownerName = ownerRes.data?.display_name ?? 'Marketer';
  const extra = getProspectExtra(prospect.id);

  // Phone for the WhatsApp quick-contact comes from the linked contact.
  const contactRes = prospect.contact_id
    ? await getContactById(prospect.contact_id)
    : null;
  const phone = contactRes?.data?.phone ?? null;

  const demo = res.demo || ownerRes.demo;

  return (
    <div className="space-y-5">
      <PageHeader
        title={prospect.full_name}
        breadcrumbs={[
          { label: t('title'), href: '/percorso-prospect' },
          { label: prospect.full_name },
        ]}
        actions={
          phone ? (
            <WhatsAppButton
              phone={phone}
              name={prospect.full_name}
              withLabel
              className="border border-[#25D366]/30"
            />
          ) : undefined
        }
      />

      {demo && <ConfigNotice variant="inline" />}

      {/* Compact summary: responsabile + timing */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div className="space-y-1">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3.5 w-3.5" aria-hidden />
              {t('owner')}
            </dt>
            <dd className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Avatar name={ownerName} size="sm" className="h-5 w-5 text-[9px]" />
              <span className="truncate">{ownerName}</span>
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {t('in_stage_since')}
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {formatRelativeTime(prospect.current_stage_since)}
            </dd>
          </div>
          <div className="space-y-1">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <History className="h-3.5 w-3.5" aria-hidden />
              {t('in_funnel_since')}
            </dt>
            <dd className="text-sm font-medium text-foreground">
              {formatDate(prospect.entered_funnel_at)}
            </dd>
          </div>
        </CardContent>
      </Card>

      <ProspectDetail prospect={prospect} extra={extra} />
    </div>
  );
}
