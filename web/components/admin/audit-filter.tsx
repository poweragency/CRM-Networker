'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AUDIT_ACTION_LABELS, type AuditAction } from '@/lib/types/db';

/**
 * Audit action filter — URL-driven `?action=` selector so the timeline stays a
 * server component. Builds the URL from the current value (no `useSearchParams`).
 */
export function AuditFilter({ action }: { action: AuditAction | 'all' }) {
  const t = useTranslations('admin_audit');
  const router = useRouter();

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{t('filter_action')}</span>
      <select
        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={action}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v === 'all' ? '/admin/audit' : `/admin/audit?action=${v}`, {
            scroll: false,
          });
        }}
      >
        <option value="all">{t('filter_all')}</option>
        {(Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((a) => (
          <option key={a} value={a}>
            {AUDIT_ACTION_LABELS[a]}
          </option>
        ))}
      </select>
    </label>
  );
}
