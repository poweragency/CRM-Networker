'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, Loader2, Users, Target, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { globalSearchAction } from './search-action';
import type { SearchHit } from '@/lib/data/search';

/**
 * GlobalSearch — the sidebar search box (top of the menu, under the org brand).
 * Type a name to find TEAM members and PROSPECTS in one list, each tagged with a
 * "Team" / "Prospect" badge; selecting one navigates to its page. Debounced, RLS
 * scoped server-side, keyboard-navigable, closes on outside click / Escape.
 *
 * The results panel is rendered in a PORTAL on document.body (fixed-positioned
 * under the input) so it always sits ABOVE the page content — the sidebar lives in
 * a `z-10` stacking context that the content column (also `z-10`, later in the DOM)
 * would otherwise paint over, clipping the dropdown.
 */
export function GlobalSearch({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations('globalsearch');
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const [mounted, setMounted] = React.useState(false);
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const reqRef = React.useRef(0);

  React.useEffect(() => setMounted(true), []);

  // Debounced search; only the latest request's result is applied (no races).
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const res = await globalSearchAction(q);
        if (reqRef.current === id) {
          setHits(res);
          setActive(0);
          setOpen(true);
        }
      } finally {
        if (reqRef.current === id) setLoading(false);
      }
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Close on outside click (ignore the input box AND the portaled dropdown).
  React.useEffect(() => {
    function onDown(e: PointerEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const showDropdown = open && query.trim().length >= 2;

  // Anchor the fixed dropdown under the input; keep it in sync on resize/scroll.
  const updateRect = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.min(Math.max(r.width, 336), window.innerWidth - r.left - 12);
    setRect({ top: r.bottom + 4, left: r.left, width });
  }, []);

  React.useEffect(() => {
    if (!showDropdown) return;
    updateRect();
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);
    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
    };
  }, [showDropdown, updateRect]);

  const go = React.useCallback(
    (hit: SearchHit) => {
      setOpen(false);
      setQuery('');
      setHits([]);
      onNavigate?.();
      router.push(hit.href);
    },
    [router, onNavigate],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open || hits.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const h = hits[active];
      if (h) go(h);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-nav-foreground/40"
        aria-hidden
      />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (hits.length) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={t('placeholder')}
        aria-label={t('placeholder')}
        className="h-9 w-full rounded-lg border border-nav-foreground/15 bg-nav-foreground/5 pl-8 pr-8 text-sm text-nav-foreground placeholder:text-nav-foreground/40 outline-none transition-colors focus-visible:border-nav-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
      />
      {loading ? (
        <Loader2
          className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-nav-foreground/40"
          aria-hidden
        />
      ) : query ? (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            setHits([]);
            setOpen(false);
          }}
          aria-label="×"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-nav-foreground/40 transition-colors hover:text-nav-foreground"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}

      {mounted &&
        showDropdown &&
        rect &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
            className="z-[80] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-2xl ring-1 ring-black/5"
          >
            {hits.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                {loading ? '…' : t('empty')}
              </p>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto py-1">
                {hits.map((h, i) => (
                  <li key={`${h.kind}:${h.id}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(h)}
                      className={cn(
                        'flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors',
                        i === active ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                          h.kind === 'team'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-warning/12 text-warning',
                        )}
                        aria-hidden
                      >
                        {h.kind === 'team' ? (
                          <Users className="h-3.5 w-3.5" />
                        ) : (
                          <Target className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {h.name}
                        </span>
                        {h.subtitle && (
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {h.subtitle}
                          </span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                          h.kind === 'team'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-warning/12 text-warning',
                        )}
                      >
                        {h.kind === 'team' ? t('team') : t('prospect')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
