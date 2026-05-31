import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Check, FileText, LinkIcon, Video } from 'lucide-react';
import { PageHeader } from '@/components/crm/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STARTING_PACKAGE_LABELS } from '@/lib/types/db';
import { MATERIALS, PACKAGE_INFO, type MaterialType } from '@/lib/data/informativa';

/**
 * /informativa — package prices + useful materials (RSC). Static content for now
 * (placeholders to be replaced with the official figures/files). Lives in the
 * sidebar provisionally; can be relocated later.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('informativa');
  return { title: t('title') };
}

const MATERIAL_ICON: Record<MaterialType, typeof FileText> = {
  pdf: FileText,
  video: Video,
  link: LinkIcon,
};

export default async function InformativaPage() {
  const t = await getTranslations('informativa');

  return (
    <div className="space-y-8">
      <PageHeader title={t('title')} description={t('subtitle')} />

      {/* Package prices */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t('packages_title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('packages_subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PACKAGE_INFO.map((p) => (
            <Card
              key={p.key}
              className={cn('flex flex-col', p.featured && 'border-primary/50 ring-1 ring-primary/20')}
            >
              <CardHeader className="space-y-2 p-5 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle>{STARTING_PACKAGE_LABELS[p.key]}</CardTitle>
                  {p.featured && <Badge variant="default">Top</Badge>}
                </div>
                <p className="text-2xl font-semibold tracking-tight text-foreground">
                  {p.price}
                </p>
                <p className="text-xs text-muted-foreground">{p.tagline}</p>
              </CardHeader>
              <CardContent className="flex-1 p-5 pt-0">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('package_features')}
                </p>
                <ul className="space-y-1.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">{t('price_note')}</p>
      </section>

      {/* Materials */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t('materials_title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('materials_subtitle')}</p>
        </div>

        {MATERIALS.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('materials_empty')}</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {MATERIALS.map((m) => {
              const Icon = MATERIAL_ICON[m.type];
              return (
                <Card key={m.title} className="flex items-center gap-3 p-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{m.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.description}</p>
                  </div>
                  <a
                    href={m.url}
                    className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
                    target={m.url !== '#' ? '_blank' : undefined}
                    rel={m.url !== '#' ? 'noopener noreferrer' : undefined}
                  >
                    {t('download')}
                  </a>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
