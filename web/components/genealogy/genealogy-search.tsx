'use client';

import * as React from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { RankBadge } from '@/components/ui/rank-badge';
import { StatusDot } from '@/components/ui/status-dot';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { TreeNode } from '@/lib/types/db';

/**
 * Search box for the genealogy (doc 14 §5.5/§7.3). Debounced trigram-style name
 * search; selecting a result jumps the canvas to that node (reveal + center). The
 * results popover is keyboard-navigable (Arrow keys + Enter) and closes on Esc /
 * outside click.
 */

export interface GenealogySearchProps {
  onSearch: (q: string) => Promise<TreeNode[]>;
  onPick: (node: TreeNode) => void;
  className?: string;
}

export function GenealogySearch({
  onSearch,
  onPick,
  className,
}: GenealogySearchProps) {
  const t = useTranslations('genealogia');
  const tc = useTranslations('common');

  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<TreeNode[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const reqId = React.useRef(0);

  // Debounced search.
  React.useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const handle = window.setTimeout(async () => {
      const hits = await onSearch(q);
      if (id !== reqId.current) return; // stale
      setResults(hits);
      setActive(0);
      setOpen(true);
      setLoading(false);
    }, 220);
    return () => window.clearTimeout(handle);
  }, [query, onSearch]);

  // Outside click closes the popover.
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = React.useCallback(
    (node: TreeNode) => {
      onPick(node);
      setOpen(false);
      setQuery('');
      setResults([]);
    },
    [onPick],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) {
      if (e.key === 'ArrowDown' && results.length) setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const node = results[active];
      if (node) pick(node);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className={cn('relative w-full sm:w-72', className)}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (results.length) setOpen(true);
          }}
          placeholder={t('search_placeholder')}
          aria-label={t('search_placeholder')}
          role="combobox"
          aria-expanded={open}
          aria-controls="genealogy-search-results"
          autoComplete="off"
          className="pl-8 pr-8"
        />
        {loading ? (
          <Loader2
            className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        ) : query ? (
          <button
            type="button"
            aria-label={tc('close')}
            onClick={() => {
              setQuery('');
              setResults([]);
              setOpen(false);
            }}
            className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      {open && (
        <div
          id="genealogy-search-results"
          role="listbox"
          aria-label={t('search_results')}
          className="glass absolute z-30 mt-2 max-h-80 w-full overflow-y-auto rounded-xl border border-border/70 p-1.5 shadow-xl ring-1 ring-black/5 animate-fade-in"
        >
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {tc('noResults')}
            </p>
          ) : (
            results.map((node, i) => (
              <button
                key={node.id}
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(node)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-fast',
                  i === active
                    ? 'bg-primary/10 ring-1 ring-inset ring-primary/15'
                    : 'hover:bg-muted/60',
                )}
              >
                <Avatar name={node.display_name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {node.display_name}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <RankBadge
                      rank={node.rank}
                      variant="dot"
                      className="text-[10px]"
                    />
                  </span>
                </span>
                <StatusDot kind="status" value={node.status} className="shrink-0" />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
