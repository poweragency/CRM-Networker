import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';

/**
 * Rendered wherever Supabase env is missing so the app degrades gracefully
 * instead of crashing (scaffold requirement). Server-safe (no client hooks
 * beyond next-intl, which works in RSC via the provider).
 */
export function ConfigNotice() {
  const t = useTranslations('common');

  return (
    <div className="mx-auto max-w-md rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
        {t('configMissingTitle')}
      </div>
      <p className="text-muted-foreground">{t('configMissingBody')}</p>
    </div>
  );
}
