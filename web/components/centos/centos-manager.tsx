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
  CheckCircle2,
  Send,
  Users2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { useToast } from '@/components/crm/toaster';
import { ConfigNotice } from '@/components/config-notice';
import {
  CENTOS_RAPPORTO_LABELS,
  CENTOS_RAPPORTO_ORDER,
  CENTOS_RAPPORTO_TONE,
  CENTOS_STATUS_LABELS,
  CENTOS_STATUS_ORDER,
  CENTOS_STATUS_TONE,
  type CentosEntry,
  type CentosRapporto,
  type CentosStatus,
} from '@/lib/types/db';
import type { CentosInput } from '@/lib/data/centos';
import {
  createCentosAction,
  deleteCentosAction,
  updateCentosAction,
} from '@/app/(app)/centos/actions';
import { CentosFormSheet } from './centos-form-sheet';
import { CentosDetailSheet } from './centos-detail-sheet';
import type { toCentosInput } from './centos-form-schema';

/**
 * CentosManager — the full client container for /centos. The page (RSC) fetches
 * the caller's position-ordered Centos entries via the demo-safe data layer and
 * hands them in as props; everything interactive lives here:
 *
 *  - a header with progress (invitati / iscritti) + a FilterBar (search over
 *    name/relationship/notes + stato & rapporto filters) that filter the list
 *    client-side (instant, no round-trips);
 *  - a DataTable with sortable columns (#, nome, chi è, rapporto, stato) where
 *    rapporto and stato are colored inline dropdowns editable in place;
 *  - "Aggiungi nome" + edit via CentosFormSheet, a detail slide-over and delete.
 *
 * Mutations call the Server Actions, which are demo-safe: in "modalità demo" they
 * return simulated results and we patch local state optimistically. Nothing
 * throws; the local list stays the source of truth.
 */

export interface CentosManagerProps {
  initialEntries: CentosEntry[];
  initialDemo: boolean;
}

/** Tone → text color for the inline status/rapporto dropdowns. */
const TONE_TEXT: Record<string, string> = {
  secondary: 'text-muted-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

function sortByPosition(rows: CentosEntry[]): CentosEntry[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

/** A colored native <select> for an in-row enum edit (stops row-click). */
function InlineSelect({
  value,
  tone,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  tone: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'cursor-pointer rounded-md border border-input bg-card px-2 py-1 text-sm font-medium shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        TONE_TEXT[tone] ?? 'text-foreground',
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="text-foreground">
          {o.label}
        </option>
      ))}
    </select>
  );
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
  const rapportoFilter = filterValues.rapporto ?? [];

  const filters = React.useMemo<FilterConfig[]>(
    () => [
      {
        key: 'status',
        label: t('filter_status'),
        options: CENTOS_STATUS_ORDER.map((s) => ({
          value: s,
          label: CENTOS_STATUS_LABELS[s],
        })),
      },
      {
        key: 'rapporto',
        label: t('filter_rapporto'),
        options: CENTOS_RAPPORTO_ORDER.map((r) => ({
          value: r,
          label: CENTOS_RAPPORTO_LABELS[r],
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
          `${e.full_name} ${e.relationship ?? ''} ${e.notes ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter.length && !statusFilter.includes(e.stato)) return false;
      if (rapportoFilter.length && !rapportoFilter.includes(e.rapporto ?? ''))
        return false;
      return true;
    });
  }, [entries, search, statusFilter, rapportoFilter]);

  // ── Progress stats (over the full list, not the filtered view) ──────────────
  const stats = React.useMemo(() => {
    let invited = 0;
    let enrolled = 0;
    for (const e of entries) {
      if (e.stato !== 'non_invitato') invited += 1;
      if (e.stato === 'iscritto') enrolled += 1;
    }
    return { total: entries.length, invited, enrolled };
  }, [entries]);

  const invitedPct =
    stats.total === 0 ? 0 : Math.round((stats.invited / stats.total) * 100);

  // ── Sheet / dialog state ────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CentosEntry | null>(null);
  const [detail, setDetail] = React.useState<CentosEntry | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<CentosEntry | null>(
    null,
  );
  // Ids whose "Chi è" cell is expanded to show the full text inline.
  const [expandedRel, setExpandedRel] = React.useState<Set<string>>(
    () => new Set(),
  );

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
  const syncDetail = React.useCallback((updated: CentosEntry) => {
    setDetail((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

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

  // Inline edit of rapporto / stato — optimistic, reverts on failure.
  const handleSetField = React.useCallback(
    async (entry: CentosEntry, patch: Partial<CentosInput>) => {
      const prev = entry;
      setEntries((list) =>
        list.map((e) => (e.id === entry.id ? { ...e, ...patch } : e)),
      );
      const res = await updateCentosAction(entry.id, patch);
      if (!res.ok) {
        setEntries((list) => list.map((e) => (e.id === prev.id ? prev : e)));
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      const updated: CentosEntry =
        res.entry ?? ({ ...entry, ...patch } as CentosEntry);
      setEntries((list) => list.map((e) => (e.id === entry.id ? updated : e)));
      syncDetail(updated);
      setDemo((d) => d || res.demo);
    },
    [toast, tc, syncDetail],
  );

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
              <p className="truncate font-medium text-foreground">
                {e.full_name}
              </p>
            </div>
          );
        },
      },
      {
        id: 'relationship',
        accessorFn: (e) => e.relationship ?? '',
        header: t('col_relationship'),
        size: 320,
        cell: ({ row }) => {
          const e = row.original;
          const rel = e.relationship;
          if (!rel) return <span className="text-muted-foreground">—</span>;
          const expanded = expandedRel.has(e.id);
          return (
            <button
              type="button"
              onClick={(ev) => {
                // Toggle inline expand without opening the row detail sheet.
                ev.stopPropagation();
                setExpandedRel((prev) => {
                  const next = new Set(prev);
                  if (next.has(e.id)) next.delete(e.id);
                  else next.add(e.id);
                  return next;
                });
              }}
              title={expanded ? undefined : rel}
              className={cn(
                'block w-full max-w-[20rem] text-left text-sm text-muted-foreground transition-colors hover:text-foreground',
                expanded ? 'whitespace-pre-wrap' : 'truncate',
              )}
            >
              {rel}
            </button>
          );
        },
      },
      {
        id: 'rapporto',
        accessorFn: (e) => e.rapporto ?? '',
        header: t('col_rapporto'),
        size: 150,
        cell: ({ row }) => {
          const e = row.original;
          return (
            <InlineSelect
              ariaLabel={t('col_rapporto')}
              value={e.rapporto ?? ''}
              tone={e.rapporto ? CENTOS_RAPPORTO_TONE[e.rapporto] : 'secondary'}
              options={[
                { value: '', label: t('rapporto_none') },
                ...CENTOS_RAPPORTO_ORDER.map((r) => ({
                  value: r,
                  label: CENTOS_RAPPORTO_LABELS[r],
                })),
              ]}
              onChange={(v) =>
                handleSetField(e, {
                  rapporto: v ? (v as CentosRapporto) : null,
                })
              }
            />
          );
        },
      },
      {
        id: 'status',
        accessorFn: (e) => e.stato,
        header: t('col_status'),
        size: 160,
        cell: ({ row }) => {
          const e = row.original;
          return (
            <InlineSelect
              ariaLabel={t('col_status')}
              value={e.stato}
              tone={CENTOS_STATUS_TONE[e.stato]}
              options={CENTOS_STATUS_ORDER.map((s) => ({
                value: s,
                label: CENTOS_STATUS_LABELS[s],
              }))}
              onChange={(v) => handleSetField(e, { stato: v as CentosStatus })}
            />
          );
        },
      },
      {
        id: '__actions',
        enableSorting: false,
        size: 48,
        header: () => <span className="sr-only">Azioni</span>,
        cell: ({ row }) => {
          const e = row.original;
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
    [t, tc, expandedRel, handleSetField],
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
          icon={<Send className="h-4 w-4" aria-hidden />}
          label={t('stat_invited')}
          value={stats.invited}
          tone="success"
          footer={
            <div className="mt-2 space-y-1">
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={invitedPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={t('progress_label')}
              >
                <div
                  className="h-full rounded-full bg-success transition-all"
                  style={{ width: `${invitedPct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('progress_invited', {
                  invited: stats.invited,
                  total: stats.total,
                })}
              </p>
            </div>
          }
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden />}
          label={t('stat_enrolled')}
          value={stats.enrolled}
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
