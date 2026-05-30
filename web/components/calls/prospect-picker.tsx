'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, ChevronsUpDown, Search, X, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { STAGE_LABELS, type ProspectStage } from '@/lib/types/db';

/**
 * ProspectPicker — a lightweight, searchable single-select combobox for linking a
 * call to a prospect. Built from primitives (no extra deps): a trigger that shows
 * the current selection, a popover with a filtered list, full keyboard support
 * (↑/↓/Enter/Esc) and a clear button. Controlled via `value` / `onChange`.
 */

export interface ProspectOption {
  id: string;
  name: string;
  stage: ProspectStage;
}

export interface ProspectPickerProps {
  options: ProspectOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  id?: string;
}

export function ProspectPicker({
  options,
  value,
  onChange,
  id,
}: ProspectPickerProps) {
  const t = useTranslations('chiamate');
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = React.useMemo(
    () => options.find((o) => o.id === value) ?? null,
    [options, value],
  );

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click / Escape; reset the query each time it opens.
  React.useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const focus = window.setTimeout(() => inputRef.current?.focus(), 0);
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.clearTimeout(focus);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  // Keep the active option within range as the filter changes.
  React.useEffect(() => {
    setActive((a) => Math.min(a, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  const choose = (optId: string) => {
    onChange(optId);
    setOpen(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) choose(opt.id);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          !selected && 'text-muted-foreground',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Target className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="truncate">
            {selected ? selected.name : t('link_none')}
          </span>
          {selected && (
            <Badge variant="secondary" className="shrink-0">
              {STAGE_LABELS[selected.stage]}
            </Badge>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={-1}
              onClick={clear}
              aria-label={t('picker_clear')}
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        </span>
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 mt-2 origin-top overflow-hidden rounded-md border bg-card text-card-foreground shadow-lg animate-scale-in"
          role="listbox"
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t('picker_placeholder')}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label={t('picker_placeholder')}
            />
          </div>
          <div className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t('picker_empty')}
              </p>
            ) : (
              filtered.map((opt, i) => {
                const isSelected = opt.id === value;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => choose(opt.id)}
                    onMouseEnter={() => setActive(i)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none transition-colors',
                      i === active ? 'bg-muted' : 'hover:bg-muted/60',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Check
                        className={cn(
                          'h-4 w-4 shrink-0',
                          isSelected ? 'opacity-100 text-primary' : 'opacity-0',
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{opt.name}</span>
                    </span>
                    <Badge variant="secondary" className="shrink-0">
                      {STAGE_LABELS[opt.stage]}
                    </Badge>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
