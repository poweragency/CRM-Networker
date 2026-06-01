import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FileText, Folder, LinkIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STARTING_PACKAGE_LABELS } from '@/lib/types/db';
import {
  MATERIAL_FOLDERS,
  PACKAGE_INFO,
  type MaterialType,
} from '@/lib/data/informativa';

/**
 * /informativa — package prices + downloadable PDFs (RSC). Prices are shown in
 * dollars (+ IVA); the PDF section groups the downloadable materials into folders
 * (Business Info, Follow Up, GPS). File urls are placeholders for now. Lives in
 * the sidebar provisionally; can be relocated later.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('informativa');
  return { title: t('title') };
}

const MATERIAL_ICON: Record<MaterialType, typeof FileText> = {
  pdf: FileText,
  link: LinkIcon,
};

export default async function InformativaPage() {
  const t = await getTranslations('informativa');

  return (
    <div className="space-y-8">
      {/* Package prices */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t('packages_title')}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PACKAGE_INFO.map((p) => (
            <div
              key={p.key}
              className={cn(
                'relative flex flex-col overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-0.5 hover:shadow-md',
                p.featured && 'border-primary/40 ring-1 ring-primary/15',
              )}
            >
              {p.featured && (
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.08] to-transparent"
                  aria-hidden
                />
              )}
              <span className="relative text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {STARTING_PACKAGE_LABELS[p.key]}
              </span>
              <p className="relative mt-2 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                  {p.price}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  {t('vat')}
                </span>
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* PDF — downloadable materials grouped in folders */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t('pdf_title')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('pdf_subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {MATERIAL_FOLDERS.map((folder) => (
            <Card key={folder.title} className="flex flex-col shadow-sm transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-md">
              <CardHeader className="flex-row items-center gap-2.5 space-y-0 p-5 pb-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Folder className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <CardTitle>{folder.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 p-5 pt-0">
                <ul className="space-y-2">
                  {folder.items.map((item) => {
                    const Icon = MATERIAL_ICON[item.type];
                    return (
                      <li
                        key={item.title}
                        className="flex items-center gap-3 rounded-lg border bg-background p-3"
                      >
                        <Icon
                          className="h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                          {item.title}
                        </span>
                        <a
                          href={item.url}
                          className={cn(
                            buttonVariants({ variant: 'outline', size: 'sm' }),
                            'shrink-0',
                          )}
                          target={item.url !== '#' ? '_blank' : undefined}
                          rel={item.url !== '#' ? 'noopener noreferrer' : undefined}
                        >
                          {item.type === 'pdf' ? t('download') : t('open')}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
