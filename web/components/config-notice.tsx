import { useTranslations } from 'next-intl';
import { AlertTriangle, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ConfigNoticeProps {
  /**
   * `card` (default) — the full bordered notice used on auth/empty shells.
   * `inline` — a discreet "modalità demo / config mancante" strip for data
   * surfaces that fell back to mock data (RESILIENCE requirement).
   */
  variant?: 'card' | 'inline';
  className?: string;
}

/**
 * Rendered wherever Supabase env is missing OR a data query fell back to mock
 * data, so the app degrades gracefully instead of crashing (RESILIENCE). Server-
 * safe (only next-intl, which works in RSC via the provider).
 */
export function ConfigNotice({ variant = 'card', className }: ConfigNoticeProps) {
  const t = useTranslations('common');
  const td = useTranslations('demo');

  if (variant === 'inline') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground',
          className,
        )}
        role="status"
      >
        <FlaskConical className="h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
        <span className="font-medium">{td('badge')}</span>
        <span className="hidden text-muted-foreground sm:inline">
          — {td('body')}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'mx-auto max-w-md rounded-xl border border-warning/40 bg-warning/10 p-5 text-sm',
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
        <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />
        {t('configMissingTitle')}
      </div>
      <p className="text-muted-foreground">{t('configMissingBody')}</p>
    </div>
  );
}
