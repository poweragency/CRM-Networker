'use client';

import * as React from 'react';
import { Search, X, ListFilter } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

/**
 * FilterBar — the standard CRM list toolbar: a debounced search input, zero or
 * more single/multi select filters, and a row of active-filter chips that clear
 * individually or all at once. Fully controlled: the parent owns `search` and a
 * `values` record (filterKey → selected option values) so the data fetch stays
 * the single source of truth.
 */

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterConfig {
  key: string;
  label: string;
  options: FilterOption[];
  /** allow multiple selected values (checkbox-style). default true. */
  multiple?: boolean;
}

export interface FilterBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  /** filterKey → selected option values. */
  values?: Record<string, string[]>;
  onValuesChange?: (next: Record<string, string[]>) => void;
  /** Extra controls rendered at the end of the toolbar (e.g. a sort menu). */
  trailing?: React.ReactNode;
  className?: string;
}

export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder = 'Cerca…',
  filters = [],
  values = {},
  onValuesChange,
  trailing,
  className,
}: FilterBarProps) {
  const [openKey, setOpenKey] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!openKey) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpenKey(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenKey(null);
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openKey]);

  const setValues = (next: Record<string, string[]>) => onValuesChange?.(next);

  const toggleOption = (config: FilterConfig, value: string) => {
    const current = values[config.key] ?? [];
    let next: string[];
    if (config.multiple === false) {
      next = current.includes(value) ? [] : [value];
      setOpenKey(null);
    } else {
      next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
    }
    setValues({ ...values, [config.key]: next });
  };

  const clearFilter = (key: string) => {
    const next = { ...values };
    delete next[key];
    setValues(next);
  };

  const clearAll = () => {
    setValues({});
    onSearchChange('');
  };

  const activeChips = filters.flatMap((config) =>
    (values[config.key] ?? []).map((val) => ({
      key: config.key,
      value: val,
      label: config.options.find((o) => o.value === val)?.label ?? val,
      filterLabel: config.label,
    })),
  );
  const hasActive = activeChips.length > 0 || search.length > 0;

  return (
    <div ref={rootRef} className={cn('space-y-3', className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
            aria-label={searchPlaceholder}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filters.map((config) => {
            const count = (values[config.key] ?? []).length;
            const open = openKey === config.key;
            return (
              <div key={config.key} className="relative">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setOpenKey(open ? null : config.key)}
                  aria-expanded={open}
                  aria-haspopup="menu"
                  className={cn(count > 0 && 'border-primary/50 text-foreground')}
                >
                  <ListFilter className="h-3.5 w-3.5" aria-hidden />
                  {config.label}
                  {count > 0 && (
                    <Badge variant="default" className="ml-1 px-1.5 py-0">
                      {count}
                    </Badge>
                  )}
                </Button>
                {open && (
                  <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 min-w-[12rem] origin-top overflow-hidden rounded-md border bg-card p-1 text-card-foreground shadow-lg animate-scale-in"
                  >
                    {config.options.map((opt) => {
                      const selected = (values[config.key] ?? []).includes(
                        opt.value,
                      );
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={selected}
                          onClick={() => toggleOption(config, opt.value)}
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors hover:bg-muted focus:bg-muted"
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              selected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-input',
                            )}
                            aria-hidden
                          >
                            {selected && (
                              <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
                                <path
                                  d="M2.5 6.5l2.5 2.5 4.5-5"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            )}
                          </span>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {trailing}
        </div>
      </div>

      {hasActive && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <Badge
              key={`${chip.key}-${chip.value}`}
              variant="outline"
              className="gap-1 pr-1"
            >
              <span className="text-muted-foreground">{chip.filterLabel}:</span>
              {chip.label}
              <button
                type="button"
                onClick={() =>
                  setValues({
                    ...values,
                    [chip.key]: (values[chip.key] ?? []).filter(
                      (v) => v !== chip.value,
                    ),
                  })
                }
                className="rounded-full p-0.5 transition-colors hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`Rimuovi filtro ${chip.label}`}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </Badge>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            Cancella tutto
          </Button>
        </div>
      )}
    </div>
  );
}
