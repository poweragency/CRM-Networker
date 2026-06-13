import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { FileText, Download, BookOpen } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { STARTING_PACKAGE_LABELS } from '@/lib/types/db';
import { PACKAGE_TONE } from '@/components/ui/package-badge';
import { PACKAGE_INFO } from '@/lib/data/informativa';
import { listOrgDocuments } from '@/lib/data/org-documents';

/**
 * /informativa — package prices + downloadable documents (RSC). Prices are shown
 * in dollars (+ IVA); the documents are admin/co-admin managed (org & team scope)
 * and read here via the RLS-scoped data layer (demo-safe → empty list with no env).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('informativa');
  return { title: t('title') };
}

export default async function InformativaPage() {
  const t = await getTranslations('informativa');
  const docs = (await listOrgDocuments()).data;
  const books = docs.filter((d) => d.is_book);
  const regularDocs = docs.filter((d) => !d.is_book);

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
          {PACKAGE_INFO.map((p) => {
            const tone = PACKAGE_TONE[p.key];
            return (
              <div
                key={p.key}
                className={cn(
                  'relative flex flex-col overflow-hidden rounded-xl border bg-card p-5 pt-6 shadow-sm transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-0.5 hover:shadow-md',
                  p.featured && 'ring-1 ring-border',
                )}
              >
                {/* Package accent bar (colore del pacchetto) */}
                <span
                  className={cn('pointer-events-none absolute inset-x-0 top-0 h-1', tone.dot)}
                  aria-hidden
                />
                <span
                  className={cn(
                    'relative inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider',
                    tone.text,
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden />
                  {STARTING_PACKAGE_LABELS[p.key]}
                </span>
                {/* Scaletta prezzi: Annuale → Semestrale → Mensile (ultima).
                    Tutti i tier sono identici: stessa dimensione del prezzo
                    originale, nessun divider, nessuna differenza di grandezza. */}
                <div className="relative mt-2 space-y-3">
                  {p.prices.map((tier) => (
                    <div key={tier.cadence} className="space-y-0.5">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {tier.cadence}
                      </span>
                      <p className="flex items-baseline gap-1.5">
                        <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                          {tier.price}
                        </span>
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('vat')}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Libri — libreria PDF gestita dall'admin */}
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          <BookOpen className="h-5 w-5 text-primary" aria-hidden />
          Libri
        </h2>

        {books.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/40 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">Nessun libro disponibile</p>
            <p className="mt-1 text-sm text-muted-foreground">
              I libri in PDF aggiunti dall&apos;admin compariranno qui.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {books.map((d) => (
              <a
                key={d.id}
                href={d.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" aria-hidden />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={d.title}>
                  {d.title}
                </span>
                <Download
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                  aria-hidden
                />
              </a>
            ))}
          </div>
        )}
      </section>

      {/* Downloadable documents (admin / co-admin managed) */}
      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {t('pdf_title')}
          </h2>
        </div>

        {regularDocs.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card/40 px-6 py-10 text-center">
            <p className="text-sm font-medium text-foreground">{t('docs_empty')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('docs_empty_body')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {regularDocs.map((d) => (
              <div
                key={d.id}
                className="group flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm transition-[box-shadow,transform] duration-base ease-standard hover:-translate-y-px hover:shadow-md"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" aria-hidden />
                </span>
                <span
                  className="min-w-0 flex-1 truncate text-sm font-medium text-foreground"
                  title={d.title}
                >
                  {d.title}
                </span>
                <a
                  href={d.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'shrink-0')}
                >
                  <Download aria-hidden />
                  {t('download')}
                </a>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
