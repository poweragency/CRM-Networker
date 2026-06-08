'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarClock, Loader2, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/crm/empty-state';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import { WEEKDAY_LABELS, type ZoomCallDef } from '@/lib/data/attendance-shared';
import {
  createZoomCallAction,
  deleteZoomCallAction,
} from '@/app/(app)/impostazioni/actions';

/**
 * CallsSettings — admin/co-admin "Call" card. Admins add org-wide or team calls;
 * co-admins add team calls (visible to their downline). Calls show up in Presenze
 * on their weekday. Lists the calls the viewer can see and lets them delete the
 * ones they manage (admin → all; co-admin → own).
 */

const selectCx =
  'h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

// Weekday option order: Mon..Sun (more natural than Sun-first).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function CallsSettings({
  initial,
  isAdmin,
  selfMarketerId,
}: {
  initial: ZoomCallDef[];
  isAdmin: boolean;
  selfMarketerId: string;
}) {
  const t = useTranslations('impostazioni');
  const { toast } = useToast();
  const router = useRouter();

  const [title, setTitle] = React.useState('');
  const [weekday, setWeekday] = React.useState(1);
  const [time, setTime] = React.useState('');
  const [teamBranch, setTeamBranch] = React.useState<'all' | 'left' | 'right'>('all');
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  async function add() {
    if (!title.trim()) {
      toast({ title: t('calls_title_required'), variant: 'error' });
      return;
    }
    // Time is mandatory (admin + co-admin): the "In diretta" banner needs a start.
    if (!time) {
      toast({ title: t('calls_time_required'), variant: 'error' });
      return;
    }
    setSaving(true);
    const res = await createZoomCallAction({
      title: title.trim(),
      weekday,
      start_time: time,
      scope: isAdmin ? 'org' : 'team',
      team_branch: isAdmin ? null : teamBranch,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ title: t('calls_error'), variant: 'error' });
      return;
    }
    toast({
      title: t('calls_added'),
      description: res.demo ? t('calls_saved_demo') : undefined,
      variant: 'success',
    });
    setTitle('');
    setTime('');
    if (!res.demo) router.refresh();
  }

  async function remove(id: string) {
    setDeleting(id);
    const res = await deleteZoomCallAction(id);
    setDeleting(null);
    if (!res.ok) {
      toast({ title: t('calls_error'), variant: 'error' });
      return;
    }
    toast({ title: t('calls_deleted'), variant: 'success' });
    if (!res.demo) router.refresh();
  }

  const canManage = (c: ZoomCallDef) => isAdmin || c.created_by === selfMarketerId;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2.5 space-y-0">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <CalendarClock className="h-4 w-4" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <CardTitle>{t('calls_title')}</CardTitle>
          <p className="text-sm text-muted-foreground">{t('calls_subtitle')}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Add form */}
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('calls_name')}
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('calls_name_ph')}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('calls_weekday')}
            <select
              className={selectCx}
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
            >
              {WEEKDAY_ORDER.map((wd) => (
                <option key={wd} value={wd}>
                  {WEEKDAY_LABELS[wd]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            {t('calls_time')} <span className="text-danger">*</span>
            <input
              type="time"
              required
              aria-required="true"
              className={selectCx}
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          {!isAdmin && (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              {t('calls_branch')}
              <select
                className={selectCx}
                value={teamBranch}
                onChange={(e) => setTeamBranch(e.target.value as 'all' | 'left' | 'right')}
              >
                <option value="all">{t('calls_branch_all')}</option>
                <option value="left">{t('calls_branch_left')}</option>
                <option value="right">{t('calls_branch_right')}</option>
              </select>
            </label>
          )}
          <Button onClick={add} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Plus aria-hidden />}
            {t('calls_add')}
          </Button>
        </div>

        {/* List */}
        {initial.length === 0 ? (
          <EmptyState
            icon={<CalendarClock />}
            title={t('calls_empty')}
            description={t('calls_empty_body')}
          />
        ) : (
          <ul className="-mx-2 space-y-0.5">
            {initial.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <CalendarClock className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{c.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {WEEKDAY_LABELS[c.weekday]}
                    {c.start_time ? ` · ${c.start_time}` : ''}
                    {c.scope === 'team' && c.team_branch && c.team_branch !== 'all'
                      ? ` · ${c.team_branch === 'left' ? t('calls_branch_left') : t('calls_branch_right')}`
                      : ''}
                    {c.scope === 'team' && c.created_by_name
                      ? ` · ${t('call_by_short', { name: c.created_by_name })}`
                      : ''}
                  </p>
                </div>
                <Badge variant={c.scope === 'org' ? 'info' : 'secondary'}>
                  {c.scope === 'org' ? t('calls_scope_org') : t('calls_scope_team')}
                </Badge>
                {canManage(c) && (
                  <button
                    type="button"
                    onClick={() => remove(c.id)}
                    disabled={deleting === c.id}
                    aria-label={t('calls_delete')}
                    className={cn(
                      'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                    )}
                  >
                    {deleting === c.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
