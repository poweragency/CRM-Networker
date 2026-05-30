'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ListChecks,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Phone as PhoneIcon,
  CheckCircle2,
  Circle,
  ArrowUpRight,
  Users2,
} from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/crm/page-header';
import { FilterBar, type FilterConfig } from '@/components/crm/filter-bar';
import { DataTable } from '@/components/crm/data-table';
import { StatusPill } from '@/components/crm/status-pill';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { useToast } from '@/components/crm/toaster';
import { ConfigNotice } from '@/components/config-notice';
import {
  CENTOS_STATUS_LABELS,
  centosStatus,
  type CentosEntry,
  type CentosStatus,
} from '@/lib/types/db';
import {
  createCentosAction,
  deleteCentosAction,
  promoteCentosAction,
  updateCentosAction,
} from '@/app/(app)/centos/actions';
import { CentosFormSheet } from './centos-form-sheet';
import { CentosDetailSheet } from './centos-detail-sheet';
import { RatingStars } from './rating-stars';
import type { toCentosInput } from './centos-form-schema';

/**
 * CentosManager — the full client container for /centos. The page (RSC) fetches
 * the caller's position-ordered Centos entries via the demo-safe data layer and
 * hands them in as props; everything interactive lives here:
 *
 *  - a progress header (contacted / promoted counts) + a FilterBar (search over
 *    name/relationship/notes + status & rating filters) that filter the in-memory
 *    list client-side (instant, no round-trips);
 *  - a DataTable with sortable columns (#, name, relationship, rating, status,
 *    updated) and a per-row action menu;
 *  - "Aggiungi nome" + edit via CentosFormSheet, a detail slide-over, the
 *    contacted toggle, promote-to-contact, and delete via ConfirmDialog.
 *
 * Mutations call the Server Actions, which are demo-safe: in "modalità demo" they
 * return simulated results and we patch local state optimistically and raise the
 * right toast. Nothing throws; the local list stays the source of truth.
 */

export interface CentosManagerProps {
  initialEntries: CentosEntry[];
  initialDemo: boolean;
}

const STATUS_ORDER: CentosStatus[] = ['da_contattare', 'contattato', 'promosso'];
const RATING_KEY = 'rating';

function sortByPosition(rows: CentosEntry[]): CentosEntry[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

export function CentosManager({
  initialEntries,
  initialDemo,
}: CentosManagerProps) {
  const t = useTranslations('centos');
  const tc = useTranslations('crm');
  const { toast } = useToast();

  // ── Local source-of-truth list (mutations patch this) ──────────────────────
  const [entries, setEntries] = React.useState<CentosEntry[]>(() =>
    sortByPosition(initialEntries),
  );
  const [demo, setDemo] = React.useState(initialDemo);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [search, setSearch] = React.useState('');
  const [filterValues, setFilterValues] = React.useState<
    Record<string, string[]>
  >({});

  const statusFilter = filterValues.status ?? [];
  const ratingFilter = filterValues[RATING_KEY] ?? [];

  const filters = React.useMemo<FilterConfig[]>(
    () => [
      {
        key: 'status',
        label: t('filter_status'),
        options: STATUS_ORDER.map((s) => ({
          value: s,
          label: CENTOS_STATUS_LABELS[s],
        })),
      },
      {
        key: RATING_KEY,
        label: t('filter_rating'),
        options: [5, 4, 3, 2, 1].map((n) => ({
          value: String(n),
          label: t('rating_stars', { count: n }),
        })),
      },
    ],
    [t],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (q) {
        const hay =
          `${e.full_name} ${e.relationship ?? ''} ${e.phone ?? ''} ${e.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter.length && !statusFilter.includes(centosStatus(e)))
        return false;
      if (ratingFilter.length && !ratingFilter.includes(String(e.rating ?? 0)))
        return false;
      return true;
    });
  }, [entries, search, statusFilter, ratingFilter]);

  // ── Progress stats (over the full list, not the filtered view) ──────────────
  const stats = React.useMemo(() => {
    let contacted = 0;
    let promoted = 0;
    for (const e of entries) {
      if (e.promoted_contact_id) promoted += 1;
      if (e.contacted) contacted += 1;
    }
    return { total: entries.length, contacted, promoted };
  }, [entries]);

  const contactedPct =
    stats.total === 0 ? 0 : Math.round((stats.contacted / stats.total) * 100);

  // ── Sheet / dialog state ────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CentosEntry | null>(null);
  const [detail, setDetail] = React.useState<CentosEntry | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<CentosEntry | null>(
    null,
  );
  const [rowBusy, setRowBusy] = React.useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (entry: CentosEntry) => {
    setDetailOpen(false);
    setEditing(entry);
    setFormOpen(true);
  };
  const openDetail = (entry: CentosEntry) => {
    setDetail(entry);
    setDetailOpen(true);
  };

  // Keep the open detail sheet in sync with the latest row data.
  const syncDetail = React.useCallback(
    (updated: CentosEntry) => {
      setDetail((prev) => (prev?.id === updated.id ? updated : prev));
    },
    [],
  );

  // ── Mutations (demo-safe Server Actions) ────────────────────────────────────
  const handleSubmit = async (input: ReturnType<typeof toCentosInput>) => {
    if (editing) {
      const res = await updateCentosAction(editing.id, input);
      if (!res.ok) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      const updated: CentosEntry =
        res.entry ?? ({ ...editing, ...input } as CentosEntry);
      setEntries((prev) =>
        sortByPosition(prev.map((e) => (e.id === editing.id ? updated : e))),
      );
      syncDetail(updated);
      setDemo((d) => d || res.demo);
      toast({
        title: t('updated'),
        description: res.demo ? tc('saved_demo') : undefined,
        variant: 'success',
      });
    } else {
      const res = await createCentosAction(input);
      if (!res.ok || !res.entry) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      setEntries((prev) => sortByPosition([...prev, res.entry as CentosEntry]));
      setDemo((d) => d || res.demo);
      toast({
        title: t('created'),
        description: res.demo ? tc('created_demo') : undefined,
        variant: 'success',
      });
    }
    setFormOpen(false);
    setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const res = await deleteCentosAction(target.id);
    if (!res.ok) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== target.id));
    if (detail?.id === target.id) setDetailOpen(false);
    setDemo((d) => d || res.demo);
    toast({
      title: t('deleted'),
      description: res.demo ? tc('deleted_demo') : undefined,
      variant: 'success',
    });
    setDeleteTarget(null);
  };

  const handleToggleContacted = async (entry: CentosEntry) => {
    const next = !entry.contacted;
    setRowBusy(true);
    try {
      const res = await updateCentosAction(entry.id, { contacted: next });
      if (!res.ok) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      const updated: CentosEntry =
        res.entry ?? { ...entry, contacted: next };
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? updated : e)),
      );
      syncDetail(updated);
      setDemo((d) => d || res.demo);
      toast({
        title: next ? t('marked_contacted') : t('marked_uncontacted'),
        description: res.demo ? tc('saved_demo') : undefined,
        variant: 'success',
      });
    } finally {
      setRowBusy(false);
    }
  };

  const handlePromote = async (entry: CentosEntry) => {
    if (entry.promoted_contact_id) return;
    setRowBusy(true);
    try {
      const res = await promoteCentosAction(entry.id);
      if (!res.ok) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      const updated: CentosEntry = {
        ...entry,
        promoted_contact_id: res.contactId,
        contacted: true,
      };
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? updated : e)),
      );
      syncDetail(updated);
      setDemo((d) => d || res.demo);
      toast({
        title: t('promoted_toast'),
        description: res.demo ? tc('created_demo') : undefined,
        variant: 'success',
      });
    } finally {
      setRowBusy(false);
    }
  };

  // ── Columns ─────────────────────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<CentosEntry, unknown>[]>(
    () => [
      {
        id: 'position',
        accessorKey: 'position',
        header: t('col_position'),
        size: 56,
        cell: ({ row }) => (
          <span className="tabular-nums text-sm text-muted-foreground">
            {row.original.position}
          </span>
        ),
      },
      {
        id: 'full_name',
        accessorKey: 'full_name',
        header: t('col_name'),
        cell: ({ row }) => {
          const e = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <Avatar name={e.full_name} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {e.full_name}
                </p>
                {e.phone && (
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <PhoneIcon className="h-3 w-3 shrink-0" aria-hidden />
                    {e.phone}
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'relationship',
        accessorFn: (e) => e.relationship ?? '',
        header: t('col_relationship'),
        cell: ({ row }) => {
          const rel = row.original.relationship;
          return rel ? (
            <span className="text-sm text-muted-foreground">{rel}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'rating',
        accessorFn: (e) => e.rating ?? 0,
        header: t('col_rating'),
        cell: ({ row }) => (
          <RatingStars
            value={row.original.rating}
            label={
              row.original.rating
                ? t('rating_stars', { count: row.original.rating })
                : t('no_rating')
            }
          />
        ),
      },
      {
        id: 'status',
        accessorFn: (e) => centosStatus(e),
        header: t('col_status'),
        cell: ({ row }) => (
          <StatusPill kind="centos" value={centosStatus(row.original)} />
        ),
      },
      {
        id: 'updated_at',
        accessorKey: 'updated_at',
        header: t('col_updated'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {formatRelativeTime(row.original.updated_at)}
          </span>
        ),
      },
      {
        id: '__actions',
        enableSorting: false,
        size: 48,
        header: () => <span className="sr-only">Azioni</span>,
        cell: ({ row }) => {
          const e = row.original;
          const promoted = Boolean(e.promoted_contact_id);
          return (
            <div onClick={(ev) => ev.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Azioni nome"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openDetail(e)}>
                    {tc('details')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openEdit(e)}>
                    <Pencil className="h-4 w-4" aria-hidden />
                    {tc('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={rowBusy}
                    onClick={() => handleToggleContacted(e)}
                  >
                    {e.contacted ? (
                      <Circle className="h-4 w-4" aria-hidden />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" aria-hidden />
                    )}
                    {e.contacted ? t('unmark_contacted') : t('mark_contacted')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={rowBusy || promoted}
                    onClick={() => handlePromote(e)}
                  >
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                    {promoted ? t('already_promoted') : t('promote')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    onClick={() => setDeleteTarget(e)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    {tc('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tc, rowBusy],
  );

  const hasFilters = search.length > 0 || Object.keys(filterValues).length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        icon={<ListChecks />}
        breadcrumbs={[{ label: tc('section') }, { label: t('title') }]}
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            {t('new_entry')}
          </Button>
        }
      />

      {demo && <ConfigNotice variant="inline" />}

      {/* Progress / stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Users2 className="h-4 w-4" aria-hidden />}
          label={t('stat_total')}
          value={stats.total}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
          label={t('stat_contacted')}
          value={stats.contacted}
          tone="success"
          footer={
            <div className="mt-2 space-y-1">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={contactedPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('progress_label')}
              >
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${contactedPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('progress', {
                  contacted: stats.contacted,
                  total: stats.total,
                })}
              </p>
            </div>
          }
        />
        <StatCard
          icon={<ArrowUpRight className="h-4 w-4" aria-hidden />}
          label={t('stat_promoted')}
          value={stats.promoted}
          tone="primary"
        />
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('search_placeholder')}
        filters={filters}
        values={filterValues}
        onValuesChange={setFilterValues}
      />

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('count', { count: filtered.length })}
      </p>

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(row) => row.id}
        onRowClick={openDetail}
        pageSize={15}
        empty={{
          title: hasFilters ? tc('no_results_title') : t('empty_title'),
          description: hasFilters ? tc('no_results_body') : t('empty_body'),
          icon: <ListChecks />,
          action: hasFilters ? undefined : (
            <Button onClick={openCreate} size="sm" className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              {t('new_entry')}
            </Button>
          ),
        }}
      />

      {/* Create / edit slide-over */}
      <CentosFormSheet
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        entry={editing}
        onSubmit={handleSubmit}
      />

      {/* Detail slide-over */}
      <CentosDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        entry={detail}
        onEdit={openEdit}
        onDelete={(e) => setDeleteTarget(e)}
        onToggleContacted={handleToggleContacted}
        onPromote={handlePromote}
        busy={rowBusy}
      />

      {/* Single delete */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('delete_confirm_title')}
        description={t('delete_confirm_body')}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

/* ───────────────────────────── stat card ───────────────────────────── */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone?: 'default' | 'success' | 'primary';
  footer?: React.ReactNode;
}

const TONE_CLASS: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-success/12 text-success',
  primary: 'bg-primary/10 text-primary',
};

function StatCard({ icon, label, value, tone = 'default', footer }: StatCardProps) {
  return (
    <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            TONE_CLASS[tone],
          )}
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold tabular-nums text-foreground">
            {value}
          </p>
        </div>
      </div>
      {footer}
    </div>
  );
}
