'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Video,
  MessageCircle,
  Plus,
  Target,
  User as UserIcon,
} from 'lucide-react';
import { formatDateTime, formatDuration } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/crm/page-header';
import { FilterBar, type FilterConfig } from '@/components/crm/filter-bar';
import { DataTable } from '@/components/crm/data-table';
import { StatusPill } from '@/components/crm/status-pill';
import { ConfigNotice } from '@/components/config-notice';
import { useToast } from '@/components/crm/toaster';
import {
  CALL_OUTCOME_LABELS,
  CALL_OUTCOME_ORDER,
  CALL_TYPE_LABELS,
  CALL_TYPE_ORDER,
  type CallStats,
  type CallType,
  type CallWithTarget,
} from '@/lib/types/db';
import { createCallAction } from '@/app/(app)/chiamate/actions';
import { CallStatsStrip } from './call-stats-strip';
import { CallFormSheet } from './call-form-sheet';
import type { ProspectOption } from './prospect-picker';
import { toCallInput } from './call-form-schema';

/**
 * CallsManager — the full client container for /chiamate. The page (RSC) fetches
 * the recent call log + a stats window + the prospect link universe via the
 * demo-safe data layer and hands them in as props; everything interactive lives
 * here:
 *
 *  - a period/type/outcome FilterBar + search that filter the in-memory log
 *    client-side (instant, no round-trips);
 *  - a CallStatsStrip recomputed from the *filtered* set so the summary always
 *    reflects the active period;
 *  - a sortable DataTable (date, type, outcome pill, duration, interlocutor,
 *    notes);
 *  - a "Registra chiamata" slide-over (CallFormSheet) that logs via a demo-safe
 *    Server Action and prepends the new row to local state.
 *
 * In "modalità demo" the mutation returns a simulated row and we update local
 * state optimistically + raise the right toast. Nothing throws.
 */

export type CallTargetOption = ProspectOption;

export interface CallsManagerProps {
  initialCalls: CallWithTarget[];
  initialStats: CallStats;
  prospectOptions: CallTargetOption[];
  initialDemo: boolean;
}

const PERIOD_KEY = 'period';
const PERIOD_DAYS: Record<string, number | null> = {
  '7': 7,
  '30': 30,
  '90': 90,
  all: null,
};

const TYPE_ICON: Record<CallType, typeof Phone> = {
  inbound: PhoneIncoming,
  outbound: PhoneOutgoing,
  video: Video,
  whatsapp: MessageCircle,
};

/** Recompute the summary tiles from a concrete set of calls (period-aware). */
function computeStats(calls: CallWithTarget[]): CallStats {
  const connected = calls.filter((c) =>
    ['connesso', 'appuntamento', 'iscritto'].includes(c.outcome),
  ).length;
  const total = calls.length;
  return {
    total,
    connected,
    duration_secs: calls.reduce((acc, c) => acc + c.duration_secs, 0),
    appointments: calls.filter((c) => c.outcome === 'appuntamento').length,
    enrollments: calls.filter((c) => c.outcome === 'iscritto').length,
    connect_rate: total ? connected / total : 0,
  };
}

export function CallsManager({
  initialCalls,
  prospectOptions,
  initialDemo,
}: CallsManagerProps) {
  const t = useTranslations('chiamate');
  const tc = useTranslations('crm');
  const { toast } = useToast();

  // ── Local source-of-truth log (new calls prepend here) ──────────────────────
  const [calls, setCalls] = React.useState<CallWithTarget[]>(initialCalls);
  const [demo, setDemo] = React.useState(initialDemo);

  // Quick name lookup so a freshly-logged call can resolve its prospect name.
  const prospectName = React.useMemo(
    () => new Map(prospectOptions.map((p) => [p.id, p.name])),
    [prospectOptions],
  );

  // ── Filter state ────────────────────────────────────────────────────────────
  const [search, setSearch] = React.useState('');
  const [filterValues, setFilterValues] = React.useState<
    Record<string, string[]>
  >({ [PERIOD_KEY]: ['30'] });

  const typeFilter = filterValues.type ?? [];
  const outcomeFilter = filterValues.outcome ?? [];
  const periodValue = (filterValues[PERIOD_KEY] ?? ['30'])[0] ?? '30';
  const periodDays = PERIOD_DAYS[periodValue] ?? null;

  const filters = React.useMemo<FilterConfig[]>(
    () => [
      {
        key: PERIOD_KEY,
        label: t('filter_period'),
        multiple: false,
        options: [
          { value: '7', label: t('period_7d') },
          { value: '30', label: t('period_30d') },
          { value: '90', label: t('period_90d') },
          { value: 'all', label: t('period_all') },
        ],
      },
      {
        key: 'type',
        label: t('filter_type'),
        options: CALL_TYPE_ORDER.map((v) => ({
          value: v,
          label: CALL_TYPE_LABELS[v],
        })),
      },
      {
        key: 'outcome',
        label: t('filter_outcome'),
        options: CALL_OUTCOME_ORDER.map((v) => ({
          value: v,
          label: CALL_OUTCOME_LABELS[v],
        })),
      },
    ],
    [t],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = periodDays ? Date.now() - periodDays * 86_400_000 : null;
    return calls.filter((c) => {
      if (cutoff && new Date(c.occurred_at).getTime() < cutoff) return false;
      if (typeFilter.length && !typeFilter.includes(c.call_type)) return false;
      if (outcomeFilter.length && !outcomeFilter.includes(c.outcome))
        return false;
      if (q) {
        const hay = `${c.target_name ?? ''} ${c.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [calls, search, periodDays, typeFilter, outcomeFilter]);

  // Stats reflect the active period filter (but ignore search/type/outcome so the
  // numbers stay a stable "period overview" — only the period bounds them).
  const periodScoped = React.useMemo(() => {
    const cutoff = periodDays ? Date.now() - periodDays * 86_400_000 : null;
    return cutoff
      ? calls.filter((c) => new Date(c.occurred_at).getTime() >= cutoff)
      : calls;
  }, [calls, periodDays]);

  const stats = React.useMemo(() => computeStats(periodScoped), [periodScoped]);

  // ── Form sheet ──────────────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = React.useState(false);

  const handleSubmit = async (input: ReturnType<typeof toCallInput>) => {
    const res = await createCallAction(input);
    if (!res.ok || !res.call) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return;
    }
    const row: CallWithTarget = {
      ...res.call,
      target_name: res.call.prospect_id
        ? prospectName.get(res.call.prospect_id) ?? null
        : null,
    };
    setCalls((prev) =>
      [row, ...prev].sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
      ),
    );
    setDemo((d) => d || res.demo);
    toast({
      title: t('created'),
      description: res.demo ? t('created_demo') : undefined,
      variant: 'success',
    });
    setFormOpen(false);
  };

  // ── Columns ─────────────────────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<CallWithTarget, unknown>[]>(
    () => [
      {
        id: 'occurred_at',
        accessorFn: (c) => c.occurred_at,
        header: t('col_date'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-foreground">
            {formatDateTime(row.original.occurred_at)}
          </span>
        ),
      },
      {
        id: 'call_type',
        accessorKey: 'call_type',
        header: t('col_type'),
        cell: ({ row }) => {
          const Icon = TYPE_ICON[row.original.call_type];
          return (
            <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              {CALL_TYPE_LABELS[row.original.call_type]}
            </span>
          );
        },
      },
      {
        id: 'outcome',
        accessorKey: 'outcome',
        header: t('col_outcome'),
        cell: ({ row }) => (
          <StatusPill kind="call" value={row.original.outcome} />
        ),
      },
      {
        id: 'duration_secs',
        accessorKey: 'duration_secs',
        header: t('col_duration'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums text-sm text-muted-foreground">
            {formatDuration(row.original.duration_secs)}
          </span>
        ),
      },
      {
        id: 'target',
        accessorFn: (c) => c.target_name ?? '',
        header: t('col_target'),
        sortUndefined: 'last',
        cell: ({ row }) => {
          const c = row.original;
          if (!c.target_name)
            return (
              <span className="text-sm text-muted-foreground">
                {t('target_none')}
              </span>
            );
          const Icon = c.prospect_id ? Target : UserIcon;
          return (
            <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
              <Icon
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="truncate">{c.target_name}</span>
            </span>
          );
        },
      },
      {
        id: 'notes',
        enableSorting: false,
        header: t('col_notes'),
        cell: ({ row }) => {
          const notes = row.original.notes;
          if (!notes) return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className="block max-w-[18rem] truncate text-sm text-muted-foreground"
              title={notes}
            >
              {notes}
            </span>
          );
        },
      },
    ],
    [t],
  );

  const hasFilters =
    Boolean(search) ||
    typeFilter.length > 0 ||
    outcomeFilter.length > 0 ||
    periodValue !== 'all';

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        icon={<Phone />}
        breadcrumbs={[{ label: tc('section') }, { label: t('title') }]}
        actions={
          <Button onClick={() => setFormOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            {t('new_call')}
          </Button>
        }
      />

      {demo && <ConfigNotice variant="inline" />}

      <CallStatsStrip stats={stats} />

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('search_placeholder')}
        filters={filters}
        values={filterValues}
        onValuesChange={setFilterValues}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('count', { count: filtered.length })}
        </p>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(row) => row.id}
        pageSize={12}
        empty={{
          title: hasFilters ? tc('no_results_title') : t('empty_title'),
          description: hasFilters ? tc('no_results_body') : t('empty_body'),
          icon: <Phone />,
          action: hasFilters ? undefined : (
            <Button onClick={() => setFormOpen(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              {t('new_call')}
            </Button>
          ),
        }}
      />

      <CallFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        prospectOptions={prospectOptions}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
