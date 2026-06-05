'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { useToast } from '@/components/crm/toaster';
import { EmptyState } from '@/components/crm/empty-state';
import { cn } from '@/lib/utils';
import { ROLE_LABELS, type MembershipRole } from '@/lib/types/db';
import type { OrgRoleRow } from '@/lib/data/roles';
import { setMemberRoleAction } from '@/app/(app)/impostazioni/actions';

/**
 * RolesSettings — admin-only "Ruoli" card. Lists the org's accounts and lets the
 * admin name (or remove) co-admins via a toggle. Co-admins gain team-scoped
 * powers (e.g. adding calls for their own downline). Owner/admin rows are shown
 * read-only (you can't demote them here). The promoted user must re-login to
 * refresh their token.
 */
export function RolesSettings({ initial }: { initial: OrgRoleRow[] }) {
  const t = useTranslations('impostazioni');
  const { toast } = useToast();
  const [rows, setRows] = React.useState<OrgRoleRow[]>(initial);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function toggleCoAdmin(row: OrgRoleRow) {
    const next: MembershipRole = row.role === 'co_admin' ? 'member' : 'co_admin';
    setBusy(row.marketer_id);
    setRows((prev) =>
      prev.map((r) => (r.marketer_id === row.marketer_id ? { ...r, role: next } : r)),
    );
    const res = await setMemberRoleAction(row.marketer_id, next);
    setBusy(null);
    if (!res.ok) {
      // rollback
      setRows((prev) =>
        prev.map((r) => (r.marketer_id === row.marketer_id ? { ...r, role: row.role } : r)),
      );
      toast({ title: t('roles_error'), variant: 'error' });
      return;
    }
    toast({
      title: next === 'co_admin' ? t('roles_promoted') : t('roles_demoted'),
      description: res.demo ? t('roles_saved_demo') : t('roles_relogin_note'),
      variant: next === 'co_admin' ? 'achievement' : 'success',
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5 space-y-0">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShieldCheck className="h-4 w-4" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <CardTitle>{t('roles_title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('roles_subtitle')}</p>
        </div>
      </CardHeader>

      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title={t('roles_empty')}
            description={t('roles_empty_body')}
          />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const locked = r.role === 'owner' || r.role === 'admin';
              const isCo = r.role === 'co_admin';
              return (
                <li key={r.marketer_id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={r.display_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {r.display_name}
                    </p>
                    <div className="mt-0.5">
                      <RankBadge rank={r.rank} className="px-1.5 py-0 text-[10px]" />
                    </div>
                  </div>

                  {locked ? (
                    <Badge variant="secondary">{ROLE_LABELS[r.role]}</Badge>
                  ) : (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={isCo}
                      disabled={busy === r.marketer_id}
                      onClick={() => toggleCoAdmin(r)}
                      className={cn(
                        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                        isCo
                          ? 'border-primary/30 bg-primary/10 text-primary'
                          : 'border-input text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'relative h-4 w-7 rounded-full transition-colors',
                          isCo ? 'bg-primary' : 'bg-muted-foreground/40',
                        )}
                        aria-hidden
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all',
                            isCo ? 'left-3.5' : 'left-0.5',
                          )}
                        />
                      </span>
                      {t('roles_co_admin')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
