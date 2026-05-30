import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, HelpCircle } from 'lucide-react';
import { PageHeader } from '@/components/crm/page-header';
import { ConfigNotice } from '@/components/config-notice';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getSevenWhysFor } from '@/lib/data/seven-whys';
import { SevenWhysDetail } from '@/components/seven-whys/seven-whys-detail';

/**
 * /sette-perche/[id] — the focused editor / review for one marketer's Sette
 * Perché (RSC).
 *
 * Reads the target marketer's record through the demo-safe, server-only data
 * layer (read-subtree: an upline may open a downline's record). Ownership is
 * resolved server-side: the caller's own record is EDITABLE (write-own), a
 * downline's is READ-ONLY. Out-of-subtree ids 404 (RLS-equivalent).
 *
 * Dynamic because the data layer reads request cookies/Supabase.
 */
export const dynamic = 'force-dynamic';

export default async function SevenWhyDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const t = await getTranslations('sette_perche');
  const tc = await getTranslations('crm');

  const res = await getSevenWhysFor(params.id);
  const row = res.data;
  if (!row) notFound();

  const readOnly = !row.is_self;

  return (
    <div className="space-y-5">
      <PageHeader
        title={readOnly ? row.person_name : t('my_card_title')}
        description={readOnly ? t('team_subtitle') : t('subtitle')}
        icon={<HelpCircle />}
        breadcrumbs={[
          { label: tc('section') },
          { label: t('title'), href: '/sette-perche' },
          { label: readOnly ? row.person_name : t('you') },
        ]}
        actions={
          <Link
            href="/sette-perche"
            className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t('back_to_list')}
          </Link>
        }
      />

      {res.demo && <ConfigNotice variant="inline" />}

      {/* Subject person header */}
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Avatar name={row.person_name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-foreground">
              {row.person_name}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('completion', { filled: row.filled })}
            </p>
          </div>
        </CardContent>
      </Card>

      <SevenWhysDetail
        record={row.record}
        personName={row.person_name}
        readOnly={readOnly}
        marketerId={row.marketer_id}
      />
    </div>
  );
}
