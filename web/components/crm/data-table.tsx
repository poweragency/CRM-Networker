'use client';

import * as React from 'react';
import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUp, ArrowDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, type EmptyStateProps } from '@/components/crm/empty-state';

/**
 * DataTable — a typed wrapper over @tanstack/react-table used by the CRM list
 * screens (contacts, calls, documents…). Provides client sorting, optional row
 * selection (with a header "select all"), a sticky header, an empty state, and
 * optional pagination. Keep column defs in the calling screen; this component
 * owns table state + chrome.
 */

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** stable row id getter (defaults to index). */
  getRowId?: (row: TData, index: number) => string;
  /** show a checkbox column + lift selection up. */
  enableRowSelection?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: (next: RowSelectionState) => void;
  /** client pagination page size; omit to disable pagination. */
  pageSize?: number;
  /** click handler for a row (e.g. open a detail). */
  onRowClick?: (row: TData) => void;
  loading?: boolean;
  /** rows rendered while `loading`. default 6. */
  loadingRows?: number;
  empty?: EmptyStateProps;
  className?: string;
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  pageSize,
  onRowClick,
  loading = false,
  loadingRows = 6,
  empty,
  className,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [internalSelection, setInternalSelection] =
    React.useState<RowSelectionState>({});

  const selection = rowSelection ?? internalSelection;
  const setSelection = (
    updater: RowSelectionState | ((old: RowSelectionState) => RowSelectionState),
  ) => {
    const next =
      typeof updater === 'function' ? updater(selection) : updater;
    if (onRowSelectionChange) onRowSelectionChange(next);
    else setInternalSelection(next);
  };

  // Prepend a selection column when enabled.
  const allColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!enableRowSelection) return columns;
    const selectCol: ColumnDef<TData, unknown> = {
      id: '__select',
      enableSorting: false,
      size: 40,
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Seleziona tutte le righe"
          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
          checked={table.getIsAllPageRowsSelected()}
          ref={(el) => {
            if (el)
              el.indeterminate =
                table.getIsSomePageRowsSelected() &&
                !table.getIsAllPageRowsSelected();
          }}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label="Seleziona riga"
          className="h-4 w-4 cursor-pointer rounded border-input accent-primary"
          checked={row.getIsSelected()}
          onChange={(e) => row.toggleSelected(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    };
    return [selectCol, ...columns];
  }, [columns, enableRowSelection]);

  const table = useReactTable({
    data,
    columns: allColumns,
    state: { sorting, rowSelection: selection },
    onSortingChange: setSorting,
    onRowSelectionChange: setSelection,
    enableRowSelection,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    ...(pageSize
      ? { getPaginationRowModel: getPaginationRowModel() }
      : {}),
    initialState: pageSize ? { pagination: { pageSize } } : undefined,
  });

  const colCount = allColumns.length;

  return (
    <div className={cn('w-full', className)}>
      <div className="relative overflow-x-auto rounded-xl border bg-card shadow-sm">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur supports-[backdrop-filter]:bg-muted/40">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b">
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() ? header.getSize() : undefined }}
                      className="h-11 px-3 text-left align-middle text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="inline-flex items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {sorted === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                          ) : sorted === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ChevronsUpDown
                              className="h-3.5 w-3.5 opacity-50"
                              aria-hidden
                            />
                          )}
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: loadingRows }).map((_, i) => (
                <tr key={`sk-${i}`} className="border-b last:border-0">
                  {Array.from({ length: colCount }).map((__, j) => (
                    <td key={`sk-${i}-${j}`} className="px-3 py-3">
                      <Skeleton className="h-4 w-full max-w-[10rem]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-0">
                  <EmptyState
                    variant="bare"
                    title={empty?.title ?? 'Nessun risultato'}
                    description={empty?.description}
                    icon={empty?.icon}
                    action={empty?.action}
                  />
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'border-b transition-colors last:border-0 data-[state=selected]:bg-primary/5',
                    onRowClick && 'cursor-pointer hover:bg-muted/50',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2.5 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageSize && !loading && table.getPageCount() > 1 && (
        <div className="mt-3 flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            {table.getFilteredSelectedRowModel().rows.length > 0
              ? `${table.getFilteredSelectedRowModel().rows.length} selezionati · `
              : ''}
            Pagina {table.getState().pagination.pageIndex + 1} di{' '}
            {table.getPageCount()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Precedente
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Successiva
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
