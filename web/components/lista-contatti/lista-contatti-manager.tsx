'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import {
  ListChecks,
  Plus,
  MoreHorizontal,
  Trash2,
  CheckCircle2,
  Check,
  Route,
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/crm/page-header';
import { FilterBar, type FilterConfig } from '@/components/crm/filter-bar';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { useToast } from '@/components/crm/toaster';
import { ConfigNotice } from '@/components/config-notice';
import {
  LISTA_CONTATTI_RAPPORTO_LABELS,
  LISTA_CONTATTI_RAPPORTO_ORDER,
  LISTA_CONTATTI_RAPPORTO_TONE,
  LISTA_CONTATTI_STATUS_LABELS,
  LISTA_CONTATTI_STATUS_ORDER,
  LISTA_CONTATTI_STATUS_TONE,
  STAGE_LABELS,
  type ListaContattiEntry,
  type ListaContattiRapporto,
  type ListaContattiStatus,
  type ProspectStage,
} from '@/lib/types/db';
import type { ListaContattiInput } from '@/lib/data/lista-contatti';
import {
  createListaContattiAction,
  deleteListaContattiAction,
  importListaContattiAction,
  updateListaContattiAction,
} from '@/app/(app)/lista-contatti/actions';
import { ImportCsvButton } from '@/components/crm/import-csv-button';
import { useListaContattiStore } from '@/components/team/lista-contatti-store';
import { ListaContattiFormSheet } from './lista-contatti-form-sheet';
import { ListaContattiDetailSheet } from './lista-contatti-detail-sheet';
import type { toListaContattiInput } from './lista-contatti-form-schema';

/**
 * ListaContattiManager — the full client container for the Lista contatti. The
 * page (RSC) fetches the caller's position-ordered entries and hands them in;
 * everything interactive lives here. Layout: header + progress stats + filters
 * on top, then TWO panes —
 *   • left  (half): the scrolling list (no pagination), with rapporto/stato as
 *     colored inline dropdowns editable in place;
 *   • right (half): "Percorsi" — every contact marked Invitato (or oltre), each
 *     with 5 progressive checkboxes for the funnel phase reached
 *     (Business Info → Follow-up → Closing → Check Soldi → Iscrizione).
 *
 * Mutations call demo-safe Server Actions; local state is patched optimistically.
 */

/** The 5 percorso phases (funnel stages after the invite). */
const PERCORSO_STAGES: ProspectStage[] = [
  'business_info',
  'follow_up',
  'closing',
  'check_soldi',
  'iscrizione',
];

/** Tone → text color for the inline status/rapporto dropdowns. */
const TONE_TEXT: Record<string, string> = {
  secondary: 'text-muted-foreground',
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

function sortByPosition(rows: ListaContattiEntry[]): ListaContattiEntry[] {
  return [...rows].sort((a, b) => a.position - b.position);
}

/** Alphabetical by full name (case/accent-insensitive). */
function byName(a: ListaContattiEntry, b: ListaContattiEntry): number {
  return a.full_name.localeCompare(b.full_name, 'it', { sensitivity: 'base' });
}

/** True if a (lowercased) string is one of the rapporto enum values. */
const isRapporto = (s: string): boolean =>
  (LISTA_CONTATTI_RAPPORTO_ORDER as string[]).includes(s);

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
        'cursor-pointer rounded-md border border-input bg-card px-2 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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

/** The 5 progressive percorso checkboxes for one invited contact. */
function PercorsoChecks({
  current,
  onSet,
  ariaPrefix,
}: {
  current: number;
  onSet: (phase: number) => void;
  ariaPrefix: string;
}) {
  return (
    <div className="flex items-stretch gap-1.5">
      {PERCORSO_STAGES.map((stage, i) => {
        const n = i + 1;
        const done = n <= current;
        return (
          <button
            key={stage}
            type="button"
            // Progressive: clicking the current last-filled step unfills it.
            onClick={() => onSet(n === current ? n - 1 : n)}
            aria-pressed={done}
            aria-label={`${ariaPrefix}: ${STAGE_LABELS[stage]}`}
            title={STAGE_LABELS[stage]}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 rounded-md border p-1.5 text-[10px] leading-tight transition-colors',
              done
                ? 'border-success/50 bg-success/10 text-success'
                : 'border-input text-muted-foreground hover:bg-muted/40',
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded border',
                done
                  ? 'border-success bg-gradient-to-br from-success to-success text-white'
                  : 'border-input',
              )}
              aria-hidden
            >
              {done && <Check className="h-3 w-3" />}
            </span>
            <span className="text-center">{STAGE_LABELS[stage]}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ListaContattiManager() {
  const t = useTranslations('listaContatti');
  const tc = useTranslations('crm');
  const { toast } = useToast();

  // Shared store (above the tabs) is the source of truth, so the Lista list and
  // the Percorsi informativi kanban stay in sync and edits survive tab switches.
  const { entries, setEntries, demo, setDemo, setField } =
    useListaContattiStore();

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
        options: LISTA_CONTATTI_STATUS_ORDER.map((s) => ({
          value: s,
          label: LISTA_CONTATTI_STATUS_LABELS[s],
        })),
      },
    ],
    [t],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (q) {
          const hay =
            `${e.full_name} ${e.relationship ?? ''} ${e.notes ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (statusFilter.length && !statusFilter.includes(e.stato)) return false;
        if (rapportoFilter.length && !rapportoFilter.includes(e.rapporto ?? ''))
          return false;
        return true;
      })
      .sort(byName);
  }, [entries, search, statusFilter, rapportoFilter]);

  // Active-funnel contacts → the Percorsi pane, alphabetical by name. From the full
  // list (stable regardless of list filters). Excludes both 'non_invitato' (not
  // started) AND 'non_iscritto' (dropped out / deleted from the kanban) — same set
  // the kanban board shows, so removing a card there also clears it here.
  const percorsi = React.useMemo(
    () =>
      entries
        .filter((e) => e.stato !== 'non_invitato' && e.stato !== 'non_iscritto')
        .sort(byName),
    [entries],
  );

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
  const [editing, setEditing] = React.useState<ListaContattiEntry | null>(null);
  const [detail, setDetail] = React.useState<ListaContattiEntry | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] =
    React.useState<ListaContattiEntry | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (entry: ListaContattiEntry) => {
    setDetailOpen(false);
    setEditing(entry);
    setFormOpen(true);
  };
  const openDetail = (entry: ListaContattiEntry) => {
    setDetail(entry);
    setDetailOpen(true);
  };

  // Keep the open detail sheet in sync with the latest row data.
  const syncDetail = React.useCallback((updated: ListaContattiEntry) => {
    setDetail((prev) => (prev?.id === updated.id ? updated : prev));
  }, []);

  // ── Mutations (demo-safe Server Actions) ────────────────────────────────────
  const handleSubmit = async (input: ReturnType<typeof toListaContattiInput>) => {
    if (editing) {
      const res = await updateListaContattiAction(editing.id, input);
      if (!res.ok) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      // In demo the mock rebuilds the row from static seed data (would clobber
      // percorso etc.), so keep the optimistic merge; adopt the server row only
      // for real writes.
      const updated: ListaContattiEntry =
        !res.demo && res.entry
          ? res.entry
          : ({ ...editing, ...input } as ListaContattiEntry);
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
      const res = await createListaContattiAction(input);
      if (!res.ok || !res.entry) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      setEntries((prev) =>
        sortByPosition([...prev, res.entry as ListaContattiEntry]),
      );
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
    const res = await deleteListaContattiAction(target.id);
    if (!res.ok) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return;
    }
    // Re-number positions so the list stays 1..N contiguous after a delete.
    setEntries((prev) =>
      sortByPosition(prev.filter((e) => e.id !== target.id)).map((e, i) => ({
        ...e,
        position: i + 1,
      })),
    );
    if (detail?.id === target.id) setDetailOpen(false);
    setDemo((d) => d || res.demo);
    toast({
      title: t('deleted'),
      description: res.demo ? tc('deleted_demo') : undefined,
      variant: 'success',
    });
    setDeleteTarget(null);
  };

  /**
   * CSV import: 3 columns — Nome e Cognome, Profilazione, Rapporto (freddo/tiepido/
   * caldo). Stato e note restano vuoti. A header row is dropped when its rapporto
   * cell isn't a valid value (e.g. the "Rapporto" label).
   */
  const importRows = async (rows: string[][]) => {
    let data = rows;
    const firstRapporto = (rows[0]?.[2] ?? '').trim().toLowerCase();
    if (firstRapporto && !isRapporto(firstRapporto)) data = rows.slice(1);

    const inputs: ListaContattiInput[] = [];
    for (const r of data) {
      const fullName = (r[0] ?? '').trim();
      if (!fullName) continue;
      const profilazione = (r[1] ?? '').trim();
      const rapportoRaw = (r[2] ?? '').trim().toLowerCase();
      inputs.push({
        full_name: fullName.slice(0, 200),
        relationship: profilazione ? profilazione.slice(0, 5000) : null,
        rapporto: isRapporto(rapportoRaw) ? (rapportoRaw as ListaContattiRapporto) : null,
      });
    }
    if (inputs.length === 0) {
      toast({ title: 'Nessun contatto valido nel file.', variant: 'error' });
      return;
    }
    const res = await importListaContattiAction(inputs);
    if (!res.ok || res.entries.length === 0) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return;
    }
    setEntries((prev) => sortByPosition([...prev, ...res.entries]));
    setDemo((d) => d || res.demo);
    toast({
      title: `${res.entries.length} contatti importati.`,
      description: res.demo ? tc('created_demo') : undefined,
      variant: 'success',
    });
  };

  const hasFilters = search.length > 0 || Object.keys(filterValues).length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        icon={<ListChecks />}
        breadcrumbs={[{ label: tc('section') }, { label: t('title') }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <ImportCsvButton
              label="Importa CSV"
              title="CSV/Excel con 3 colonne: Nome e Cognome, Profilazione, Rapporto (freddo/tiepido/caldo)"
              onRows={importRows}
            />
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              {t('new_entry')}
            </Button>
          </div>
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
                  className="h-full rounded-full bg-gradient-to-r from-success to-success transition-all"
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
        trailing={
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {t('filter_rapporto')}
            <select
              value={rapportoFilter[0] ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setFilterValues((prev) => {
                  const next = { ...prev };
                  if (v) next.rapporto = [v];
                  else delete next.rapporto;
                  return next;
                });
              }}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t('filter_all')}</option>
              {LISTA_CONTATTI_RAPPORTO_ORDER.map((r) => (
                <option key={r} value={r}>
                  {LISTA_CONTATTI_RAPPORTO_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {/* Two panes: list (left) + percorsi (right) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── Left: the scrolling list ── */}
        <section className="space-y-2">
          <p
            className="text-sm text-muted-foreground"
            aria-live="polite"
          >
            {t('count', { count: filtered.length })}
          </p>
          <div className="max-h-[68vh] overflow-y-auto rounded-xl border bg-card shadow-sm">
            {filtered.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  {hasFilters ? tc('no_results_title') : t('empty_title')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {hasFilters ? tc('no_results_body') : t('empty_body')}
                </p>
                {!hasFilters && (
                  <Button
                    onClick={openCreate}
                    size="sm"
                    className="mt-4 gap-2"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    {t('new_entry')}
                  </Button>
                )}
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map((e, i) => (
                  <li
                    key={e.id}
                    onClick={() => openEdit(e)}
                    className="flex cursor-pointer items-start gap-3 p-3 transition-colors hover:bg-muted/40"
                  >
                    <span className="w-5 shrink-0 pt-1 text-xs tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <Avatar name={e.full_name} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {e.full_name}
                      </p>
                      {e.relationship && (
                        <p className="truncate text-xs text-muted-foreground">
                          {e.relationship}
                        </p>
                      )}
                      <div
                        className="mt-2 flex flex-wrap items-center gap-1.5"
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        <InlineSelect
                          ariaLabel={t('col_rapporto')}
                          value={e.rapporto ?? ''}
                          tone={
                            e.rapporto
                              ? LISTA_CONTATTI_RAPPORTO_TONE[e.rapporto]
                              : 'secondary'
                          }
                          options={[
                            { value: '', label: t('rapporto_none') },
                            ...LISTA_CONTATTI_RAPPORTO_ORDER.map((r) => ({
                              value: r,
                              label: LISTA_CONTATTI_RAPPORTO_LABELS[r],
                            })),
                          ]}
                          onChange={(v) =>
                            setField(e, {
                              rapporto: v ? (v as ListaContattiRapporto) : null,
                            })
                          }
                        />
                        <InlineSelect
                          ariaLabel={t('col_status')}
                          value={e.stato}
                          tone={LISTA_CONTATTI_STATUS_TONE[e.stato]}
                          options={LISTA_CONTATTI_STATUS_ORDER.map((s) => ({
                            value: s,
                            label: LISTA_CONTATTI_STATUS_LABELS[s],
                          }))}
                          onChange={(v) =>
                            setField(e, {
                              stato: v as ListaContattiStatus,
                            })
                          }
                        />
                      </div>
                    </div>
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ── Right: Percorsi ── */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Route className="h-4 w-4 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">
              {t('percorsi_title')}
            </p>
            {percorsi.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                {percorsi.length}
              </span>
            )}
          </div>
          <div className="max-h-[68vh] overflow-y-auto rounded-xl border bg-card shadow-sm">
            {percorsi.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  {t('percorsi_empty')}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t('percorsi_empty_body')}
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {percorsi.map((e) => (
                  <li key={e.id} className="p-3">
                    <div className="mb-2 flex items-center gap-2.5">
                      <Avatar name={e.full_name} size="sm" />
                      <p className="truncate text-sm font-medium text-foreground">
                        {e.full_name}
                      </p>
                    </div>
                    <PercorsoChecks
                      current={e.percorso ?? 0}
                      ariaPrefix={e.full_name}
                      onSet={(phase) => setField(e, { percorso: phase })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Create / edit slide-over */}
      <ListaContattiFormSheet
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        entry={editing}
        onSubmit={handleSubmit}
      />

      {/* Detail slide-over */}
      <ListaContattiDetailSheet
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
