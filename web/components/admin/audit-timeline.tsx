import { getTranslations } from 'next-intl/server';
import {
  Building2,
  FileText,
  KanbanSquare,
  KeyRound,
  Mail,
  Medal,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AUDIT_ACTION_LABELS,
  auditCategory,
  type AuditCategory,
  type AuditLogEntry,
} from '@/lib/types/db';
import { EmptyState } from '@/components/crm/empty-state';
import { formatDateTime } from '@/lib/utils';

const CATEGORY_ICON: Record<AuditCategory, LucideIcon> = {
  marketer: Users,
  rank: Medal,
  prospect: KanbanSquare,
  invitation: Mail,
  account: KeyRound,
  membership: ShieldCheck,
  contacts: Users,
  document: FileText,
  organization: Building2,
  auth: ShieldAlert,
};

/**
 * Audit timeline — the org's `audit_log` in reverse-chronological order, one row
 * per sensitive action with actor, target entity and timestamp. Server-rendered.
 */
export async function AuditTimeline({ data }: { data: AuditLogEntry[] }) {
  const t = await getTranslations('admin_audit');

  if (data.length === 0) {
    return (
      <EmptyState icon={<ScrollText />} title={t('empty_title')} description={t('empty_body')} />
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((e) => {
        const Icon = CATEGORY_ICON[auditCategory(e.action)];
        return (
          <li
            key={e.id}
            className="flex items-center gap-3 rounded-lg border bg-background p-3"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">
                {AUDIT_ACTION_LABELS[e.action]}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {e.actor_name ?? t('system_actor')} · {e.entity_type}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDateTime(e.created_at)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
