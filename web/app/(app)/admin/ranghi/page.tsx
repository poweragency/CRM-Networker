import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getRankDistribution, listRankHistory } from '@/lib/data/admin';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RankDistribution, RankHistoryList } from '@/components/admin';

/**
 * /admin/ranghi — rank distribution + immutable rank-change history (doc 01 §2).
 * RSC; both panels read through the demo-safe data layer (mock fallback when env
 * is missing OR a query fails).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin_ranghi');
  return { title: t('title') };
}

export default async function RanghiPage() {
  const t = await getTranslations('admin_ranghi');
  const [distRes, historyRes] = await Promise.all([
    getRankDistribution(),
    listRankHistory(),
  ]);
  const demo = distRes.demo || historyRes.demo;

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {demo && <ConfigNotice variant="inline" />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle>{t('distribution_title')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('distribution_desc')}</p>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <RankDistribution data={distRes.data} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle>{t('history_title')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('history_desc')}</p>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <RankHistoryList data={historyRes.data} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
