'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table';
import {
  Users,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Mail,
  Phone as PhoneIcon,
  AlertTriangle,
  CalendarClock,
} from 'lucide-react';
import { cn, formatDate, formatRelativeTime } from '@/lib/utils';
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
import { TagList } from '@/components/crm/tag-list';
import { ConfirmDialog } from '@/components/crm/confirm-dialog';
import { useToast } from '@/components/crm/toaster';
import { ConfigNotice } from '@/components/config-notice';
import {
  CONTACT_SOURCE_LABELS,
  CONTACT_SOURCE_ORDER,
  CONTACT_STATUS_LABELS,
  CONTACT_STATUS_ORDER,
  type Contact,
  type ContactStatus,
} from '@/lib/types/db';
import {
  bulkDeleteContactsAction,
  bulkSetStatusAction,
  bulkTagContactsAction,
  createContactAction,
  deleteContactAction,
  updateContactAction,
} from '@/app/(app)/contatti/actions';
import { ContactFormSheet } from './contact-form-sheet';
import { ContactDetailSheet } from './contact-detail-sheet';
import { ContactBulkBar } from './contact-bulk-bar';
import { toContactInput } from './contact-form-schema';

/**
 * ContactsManager — the full client container for /contatti. The page (RSC)
 * fetches the initial contact list + tag universe via the demo-safe data layer
 * and hands them in as props; everything interactive lives here:
 *
 *  - FilterBar (search + status/source/tag filters, follow-up-due toggle) that
 *    filters the in-memory list client-side (instant, no round-trips);
 *  - DataTable with sortable columns, an overdue-highlighted follow-up column,
 *    and row multi-select feeding the bulk-action bar;
 *  - "Nuovo contatto" + edit via ContactFormSheet, a detail slide-over, and
 *    single/bulk delete via ConfirmDialog.
 *
 * Mutations call the Server Actions, which are demo-safe: in "modalità demo"
 * they return simulated results and we update local state optimistically and
 * raise the right toast. Nothing throws; the list stays the source of truth.
 */

export interface ContactsManagerProps {
  initialContacts: Contact[];
  initialTags: string[];
  initialDemo: boolean;
}

const FOLLOW_UP_KEY = 'follow_up_due';

function fullName(c: Contact): string {
  return `${c.first_name} ${c.last_name ?? ''}`.trim();
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export function ContactsManager({
  initialContacts,
  initialTags,
  initialDemo,
}: ContactsManagerProps) {
  const t = useTranslations('contatti');
  const tc = useTranslations('crm');
  const { toast } = useToast();

  // ── Local source-of-truth list (mutations patch this) ──────────────────────
  const [contacts, setContacts] = React.useState<Contact[]>(initialContacts);
  const [demo, setDemo] = React.useState(initialDemo);

  // Tag universe (suggestions + filter options) recomputed from current list.
  const allTags = React.useMemo(() => {
    const set = new Set<string>(initialTags);
    for (const c of contacts) for (const tag of c.tags) set.add(tag);
    return Array.from(set).sort();
  }, [contacts, initialTags]);

  // ── Filter state ────────────────────────────────────────────────────────────
  const [search, setSearch] = React.useState('');
  const [filterValues, setFilterValues] = React.useState<
    Record<string, string[]>
  >({});

  const statusFilter = filterValues.status ?? [];
  const sourceFilter = filterValues.source ?? [];
  const tagFilter = filterValues.tags ?? [];
  const followUpOnly = (filterValues[FOLLOW_UP_KEY] ?? []).includes('1');

  const filters = React.useMemo<FilterConfig[]>(
    () => [
      {
        key: 'status',
        label: t('filter_status'),
        options: CONTACT_STATUS_ORDER.map((s) => ({
          value: s,
          label: CONTACT_STATUS_LABELS[s],
        })),
      },
      {
        key: 'source',
        label: t('filter_source'),
        options: CONTACT_SOURCE_ORDER.map((s) => ({
          value: s,
          label: CONTACT_SOURCE_LABELS[s],
        })),
      },
      {
        key: 'tags',
        label: t('filter_tags'),
        options: allTags.map((tag) => ({ value: tag, label: tag })),
      },
    ],
    [t, allTags],
  );

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const nowMs = Date.now();
    return contacts.filter((c) => {
      if (q) {
        const hay = `${fullName(c)} ${c.email ?? ''} ${c.phone ?? ''} ${c.city ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter.length && !statusFilter.includes(c.status)) return false;
      if (sourceFilter.length && !sourceFilter.includes(c.source)) return false;
      if (tagFilter.length && !tagFilter.some((tag) => c.tags.includes(tag)))
        return false;
      if (followUpOnly) {
        if (!c.next_follow_up_at) return false;
        if (new Date(c.next_follow_up_at).getTime() > nowMs) return false;
      }
      return true;
    });
  }, [contacts, search, statusFilter, sourceFilter, tagFilter, followUpOnly]);

  // ── Selection ───────────────────────────────────────────────────────────────
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const selectedIds = React.useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection],
  );
  const clearSelection = React.useCallback(() => setRowSelection({}), []);

  // Drop selections that no longer exist after a delete/filter change.
  React.useEffect(() => {
    setRowSelection((prev) => {
      const present = new Set(filtered.map((c) => c.id));
      let changed = false;
      const next: RowSelectionState = {};
      for (const id of Object.keys(prev)) {
        if (prev[id] && present.has(id)) next[id] = true;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [filtered]);

  // ── Sheet / dialog state ────────────────────────────────────────────────────
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Contact | null>(null);
  const [detail, setDetail] = React.useState<Contact | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<Contact | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [bulkBusy, setBulkBusy] = React.useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (contact: Contact) => {
    setDetailOpen(false);
    setEditing(contact);
    setFormOpen(true);
  };
  const openDetail = (contact: Contact) => {
    setDetail(contact);
    setDetailOpen(true);
  };

  // ── Mutations (demo-safe Server Actions) ────────────────────────────────────
  const handleSubmit = async (input: ReturnType<typeof toContactInput>) => {
    if (editing) {
      const res = await updateContactAction(editing.id, input);
      if (!res.ok) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      const updated: Contact =
        res.contact ?? ({ ...editing, ...input } as Contact);
      setContacts((prev) =>
        prev.map((c) => (c.id === editing.id ? updated : c)),
      );
      if (detail?.id === editing.id) setDetail(updated);
      setDemo((d) => d || res.demo);
      toast({
        title: t('updated'),
        description: res.demo ? tc('saved_demo') : undefined,
        variant: 'success',
      });
    } else {
      const res = await createContactAction(input);
      if (!res.ok || !res.contact) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      setContacts((prev) => [res.contact as Contact, ...prev]);
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
    const res = await deleteContactAction(target.id);
    if (!res.ok) {
      toast({ title: tc('mutation_error'), variant: 'error' });
      return;
    }
    setContacts((prev) => prev.filter((c) => c.id !== target.id));
    if (detail?.id === target.id) setDetailOpen(false);
    setDemo((d) => d || res.demo);
    toast({
      title: t('deleted'),
      description: res.demo ? tc('deleted_demo') : undefined,
      variant: 'success',
    });
    setDeleteTarget(null);
  };

  const handleBulkTag = async (tags: string[]) => {
    if (selectedIds.length === 0 || tags.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await bulkTagContactsAction(selectedIds, tags);
      if (!res.ok) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      const ids = new Set(selectedIds);
      setContacts((prev) =>
        prev.map((c) =>
          ids.has(c.id)
            ? { ...c, tags: Array.from(new Set([...c.tags, ...tags])) }
            : c,
        ),
      );
      setDemo((d) => d || res.demo);
      toast({
        title: tc('tagged', { count: res.count }),
        description: res.demo ? tc('tagged_demo') : undefined,
        variant: 'success',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkStatus = async (status: ContactStatus) => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await bulkSetStatusAction(selectedIds, status);
      if (!res.ok) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      const ids = new Set(selectedIds);
      setContacts((prev) =>
        prev.map((c) => (ids.has(c.id) ? { ...c, status } : c)),
      );
      setDemo((d) => d || res.demo);
      toast({
        title: tc('status_set', { count: res.count }),
        description: res.demo ? tc('status_set_demo') : undefined,
        variant: 'success',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkBusy(true);
    try {
      const ids = [...selectedIds];
      const res = await bulkDeleteContactsAction(ids);
      if (!res.ok) {
        toast({ title: tc('mutation_error'), variant: 'error' });
        return;
      }
      const idSet = new Set(ids);
      setContacts((prev) => prev.filter((c) => !idSet.has(c.id)));
      clearSelection();
      setDemo((d) => d || res.demo);
      toast({
        title: tc('bulk_deleted', { count: res.count }),
        description: res.demo ? tc('bulk_delete_demo', { count: res.count }) : undefined,
        variant: 'success',
      });
    } finally {
      setBulkBusy(false);
      setBulkDeleteOpen(false);
    }
  };

  // ── Columns ─────────────────────────────────────────────────────────────────
  const columns = React.useMemo<ColumnDef<Contact, unknown>[]>(
    () => [
      {
        id: 'first_name',
        accessorFn: (c) => fullName(c),
        header: t('col_name'),
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex items-center gap-2.5">
              <Avatar name={fullName(c)} size="sm" />
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {fullName(c)}
                </p>
                {c.city && (
                  <p className="truncate text-xs text-muted-foreground">
                    {c.city}
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: 'contact',
        enableSorting: false,
        header: t('col_contact'),
        cell: ({ row }) => {
          const c = row.original;
          if (!c.email && !c.phone)
            return <span className="text-muted-foreground">—</span>;
          return (
            <div className="space-y-0.5 text-xs">
              {c.email && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" aria-hidden />
                  <span className="truncate">{c.email}</span>
                </span>
              )}
              {c.phone && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <PhoneIcon className="h-3 w-3 shrink-0" aria-hidden />
                  {c.phone}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: t('col_status'),
        cell: ({ row }) => (
          <StatusPill kind="contact" value={row.original.status} />
        ),
      },
      {
        id: 'source',
        accessorKey: 'source',
        header: t('col_source'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {CONTACT_SOURCE_LABELS[row.original.source]}
          </span>
        ),
      },
      {
        id: 'tags',
        enableSorting: false,
        header: t('col_tags'),
        cell: ({ row }) => <TagList tags={row.original.tags} max={3} size="sm" />,
      },
      {
        id: 'next_follow_up_at',
        accessorFn: (c) => c.next_follow_up_at ?? '',
        header: t('col_follow_up'),
        sortUndefined: 'last',
        cell: ({ row }) => {
          const iso = row.original.next_follow_up_at;
          if (!iso) return <span className="text-muted-foreground">—</span>;
          const overdue = isOverdue(iso);
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-sm',
                overdue ? 'font-medium text-danger' : 'text-foreground',
              )}
              title={overdue ? t('follow_up_overdue') : undefined}
            >
              {overdue ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <CalendarClock
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              )}
              {formatDate(iso)}
            </span>
          );
        },
      },
      {
        id: 'last_interaction_at',
        accessorFn: (c) => c.last_interaction_at ?? '',
        header: t('col_last'),
        sortUndefined: 'last',
        cell: ({ row }) => {
          const iso = row.original.last_interaction_at;
          return iso ? (
            <span className="text-sm text-muted-foreground">
              {formatRelativeTime(iso)}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: '__actions',
        enableSorting: false,
        size: 48,
        header: () => <span className="sr-only">Azioni</span>,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div onClick={(e) => e.stopPropagation()}>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Azioni contatto"
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => openDetail(c)}>
                    {tc('details')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" aria-hidden />
                    {tc('edit')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    destructive
                    onClick={() => setDeleteTarget(c)}
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
    [t, tc],
  );

  const followUpTrailing = (
    <Button
      type="button"
      variant={followUpOnly ? 'default' : 'outline'}
      size="sm"
      onClick={() =>
        setFilterValues((prev) => ({
          ...prev,
          [FOLLOW_UP_KEY]: followUpOnly ? [] : ['1'],
        }))
      }
      className="gap-1.5"
      aria-pressed={followUpOnly}
    >
      <CalendarClock className="h-3.5 w-3.5" aria-hidden />
      {t('filter_follow_up_due')}
    </Button>
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        icon={<Users />}
        breadcrumbs={[
          { label: tc('section') },
          { label: t('title') },
        ]}
        actions={
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" aria-hidden />
            {t('new_contact')}
          </Button>
        }
      />

      {demo && <ConfigNotice variant="inline" />}

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('search_placeholder')}
        filters={filters}
        values={filterValues}
        onValuesChange={setFilterValues}
        trailing={followUpTrailing}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {t('count', { count: filtered.length })}
        </p>
      </div>

      {selectedIds.length > 0 && (
        <ContactBulkBar
          count={selectedIds.length}
          busy={bulkBusy}
          onClearSelection={clearSelection}
          onAddTags={handleBulkTag}
          onSetStatus={handleBulkStatus}
          onDelete={() => setBulkDeleteOpen(true)}
        />
      )}

      <DataTable
        columns={columns}
        data={filtered}
        getRowId={(row) => row.id}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onRowClick={openDetail}
        pageSize={12}
        empty={{
          title: search || Object.keys(filterValues).length ? tc('no_results_title') : t('empty_title'),
          description:
            search || Object.keys(filterValues).length
              ? tc('no_results_body')
              : t('empty_body'),
          icon: <Users />,
          action: (
            <Button onClick={openCreate} size="sm" className="gap-2">
              <Plus className="h-4 w-4" aria-hidden />
              {t('new_contact')}
            </Button>
          ),
        }}
      />

      {/* Create / edit slide-over */}
      <ContactFormSheet
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
        contact={editing}
        tagSuggestions={allTags}
        onSubmit={handleSubmit}
      />

      {/* Detail slide-over */}
      <ContactDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contact={detail}
        onEdit={openEdit}
        onDelete={(c) => setDeleteTarget(c)}
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

      {/* Bulk delete */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={t('bulk_delete_confirm_title', { count: selectedIds.length })}
        description={t('bulk_delete_confirm_body')}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        onConfirm={confirmBulkDelete}
      />
    </div>
  );
}
