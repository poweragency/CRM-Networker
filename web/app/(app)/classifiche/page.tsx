import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { getLeaderboard } from '@/lib/data/leaderboards';
import {
  LEADERBOARD_METRIC_ORDER,
  type BranchScope,
  type LeaderboardMetric,
  type LeaderboardScope,
} from '@/lib/types/db';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { LeaderboardBoard, LeaderboardControls } from '@/components/leaderboards';

/**
 * /classifiche — leaderboards (doc 11 §11, build seq §10). RSC.
 *
 * Reads the ranked dimension (metric / scope / branch) from `?metric=&scope=&
 * branch=` and pulls the precomputed snapshot through the demo-safe data layer
 * (mock fallback when env is missing OR a query fails). The controls are a small
 * client component that pushes new params; the board renders fully server-side.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('classifiche');
  return { title: t('title') };
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseMetric(value: string | string[] | undefined): LeaderboardMetric {
  const v = one(value) as LeaderboardMetric | undefined;
  return v && LEADERBOARD_METRIC_ORDER.includes(v) ? v : 'enrollments';
}

function parseScope(value: string | string[] | undefined): LeaderboardScope {
  const v = one(value);
  return v === 'team' || v === 'branch' ? v : 'org';
}

function parseBranch(value: string | string[] | undefined): BranchScope {
  const v = one(value);
  return v === 'RIGHT' ? 'RIGHT' : v === 'LEFT' ? 'LEFT' : 'GLOBAL';
}

export default async function ClassifichePage(props: {
  searchParams?: Promise<{ metric?: string | string[]; scope?: string | string[]; branch?: string | string[] }>;
}) {
  const searchParams = await props.searchParams;
  const t = await getTranslations('classifiche');
  const metric = parseMetric(searchParams?.metric);
  const scope = parseScope(searchParams?.scope);
  const branch = parseBranch(searchParams?.branch);

  const { data, demo } = await getLeaderboard(metric, scope, branch);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />

      <Card>
        <CardContent className="p-5">
          <LeaderboardControls metric={metric} scope={scope} branch={branch} />
        </CardContent>
      </Card>

      {demo && <ConfigNotice variant="inline" />}

      <LeaderboardBoard entries={data} metric={metric} />
    </div>
  );
}
