'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileText, Loader2 } from 'lucide-react';
import { EXPORT_FORMAT_LABELS, EXPORT_FORMAT_ORDER, type ExportFormat } from '@/lib/types/db';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/crm/toaster';
import { enqueueExportAction } from '@/app/(app)/report/actions';

/**
 * Export buttons for a report — one per format (PDF / Excel / CSV). Calls the
 * demo-safe `enqueueExportAction` and surfaces a toast (real vs "modalità demo").
 * Disables while the request is in flight; the queued job appears in the
 * Esportazioni tab after a refresh.
 */
export function ExportButton({
  reportType,
  marketerId,
}: {
  reportType: string;
  marketerId?: string | null;
}) {
  const t = useTranslations('report');
  const { toast } = useToast();
  const [pending, setPending] = React.useState<ExportFormat | null>(null);

  async function run(format: ExportFormat) {
    setPending(format);
    try {
      const res = await enqueueExportAction({ reportType, format, marketerId });
      toast({
        title: t('export_queued'),
        description: res.demo ? t('export_queued_demo') : undefined,
        variant: res.ok ? 'success' : 'error',
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {EXPORT_FORMAT_ORDER.map((format) => (
        <Button
          key={format}
          variant="outline"
          size="sm"
          disabled={pending !== null}
          onClick={() => run(format)}
        >
          {pending === format ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : format === 'pdf' ? (
            <FileText aria-hidden />
          ) : (
            <Download aria-hidden />
          )}
          {EXPORT_FORMAT_LABELS[format]}
        </Button>
      ))}
    </div>
  );
}
