import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getCurrentClaims } from '@/lib/data/session';
import { getNode } from '@/lib/data/genealogy';
import { ROLE_LABELS } from '@/lib/types/db';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';

/**
 * /impostazioni — personal settings (ADR-008 footer item). RSC. Shows the
 * caller's profile (read-only — profile edits are an admin action) and the
 * appearance preference. Demo-safe via the session/genealogy data layer.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('impostazioni');
  return { title: t('title') };
}

export default async function ImpostazioniPage() {
  const t = await getTranslations('impostazioni');
  const { claims, demo, email } = await getCurrentClaims();
  const { data: self } = await getNode(claims.marketer_id);
  const displayName = self?.display_name ?? (email ? email.split('@')[0]! : '—');

  const rows: ReadonlyArray<{ label: string; value: ReactNode }> = [
    { label: t('name'), value: displayName },
    { label: t('email'), value: email ?? '—' },
    { label: t('rank'), value: <RankBadge rank={claims.rank} /> },
    { label: t('role'), value: ROLE_LABELS[claims.role] },
    {
      label: t('crm_access'),
      value: (
        <Badge variant={claims.crm_access ? 'success' : 'secondary'}>
          {claims.crm_access ? t('crm_on') : t('crm_off')}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      {demo && <ConfigNotice variant="inline" />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="p-5 pb-3">
            <CardTitle>{t('section_profile')}</CardTitle>
            <p className="text-sm text-muted-foreground">{t('section_profile_desc')}</p>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <dl className="divide-y">
              {rows.map((row, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
                >
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm font-medium text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-muted-foreground">{t('read_only_note')}</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="p-5 pb-3">
            <CardTitle>{t('section_appearance')}</CardTitle>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            <div className="flex items-center justify-between rounded-lg border bg-background p-3">
              <span className="text-sm font-medium text-foreground">{t('theme')}</span>
              <ThemeToggle />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
