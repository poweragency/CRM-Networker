'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Search, Archive, FileText } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusPill } from '@/components/crm/status-pill';
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_CATEGORY_ORDER,
  type DocumentCategory,
  type InternalDocument,
} from '@/lib/types/db';

/**
 * DocumentLibrary — the left pane of /documenti: a search box, an "Archiviati"
 * toggle, and the document list GROUPED BY CATEGORY (canonical order). Selecting
 * an item opens it in the reader/editor. Archived docs are hidden unless the
 * toggle is on; search matches title + tags. Pure client filtering (instant, no
 * round-trips) over the list the workspace owns.
 */

export interface DocumentLibraryProps {
  documents: InternalDocument[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

export function DocumentLibrary({
  documents,
  selectedId,
  onSelect,
  className,
}: DocumentLibraryProps) {
  const t = useTranslations('documenti');
  const [search, setSearch] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (!showArchived && d.status === 'archived') return false;
      if (q) {
        const hay = `${d.title} ${d.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [documents, search, showArchived]);

  // Group by category, in canonical order, most-recently-updated first.
  const groups = React.useMemo(() => {
    const byCat = new Map<DocumentCategory, InternalDocument[]>();
    for (const d of filtered) {
      const list = byCat.get(d.category) ?? [];
      list.push(d);
      byCat.set(d.category, list);
    }
    return DOCUMENT_CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({
      category: c,
      docs: byCat
        .get(c)!
        .slice()
        .sort(
          (a, b) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
        ),
    }));
  }, [filtered]);

  return (
    <aside
      className={cn(
        'flex h-full max-h-[calc(100vh-12rem)] flex-col overflow-hidden rounded-xl border bg-card',
        className,
      )}
      aria-label={t('library')}
    >
      {/* Search + archived toggle */}
      <div className="space-y-2.5 border-b p-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('search_placeholder')}
            className="pl-9"
            aria-label={t('search_placeholder')}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {filtered.length === 1
              ? t('count_one')
              : t('count', { count: filtered.length })}
          </span>
          <Button
            type="button"
            variant={showArchived ? 'default' : 'outline'}
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={() => setShowArchived((v) => !v)}
            aria-pressed={showArchived}
          >
            <Archive className="h-3.5 w-3.5" aria-hidden />
            {t('show_archived')}
          </Button>
        </div>
      </div>

      {/* Grouped list */}
      <ScrollArea className="flex-1">
        {groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {t('empty_body')}
          </p>
        ) : (
          <div className="p-2">
            {groups.map((group) => (
              <div key={group.category} className="mb-2">
                <h3 className="px-2 py-1.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {DOCUMENT_CATEGORY_LABELS[group.category]}
                </h3>
                <ul className="space-y-0.5">
                  {group.docs.map((doc) => {
                    const active = doc.id === selectedId;
                    return (
                      <li key={doc.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(doc.id)}
                          aria-current={active ? 'true' : undefined}
                          className={cn(
                            'group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active
                              ? 'bg-primary/10 text-foreground'
                              : 'hover:bg-muted text-foreground',
                          )}
                        >
                          <FileText
                            className={cn(
                              'mt-0.5 h-4 w-4 shrink-0',
                              active
                                ? 'text-primary'
                                : 'text-muted-foreground',
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">
                                {doc.title}
                              </span>
                            </span>
                            <span className="mt-1 flex items-center gap-1.5">
                              <StatusPill
                                kind="document"
                                value={doc.status}
                                hideDot
                                className="px-1.5 py-0 text-[0.65rem]"
                              />
                              <span className="truncate text-[0.7rem] text-muted-foreground">
                                {formatRelativeTime(doc.updated_at)}
                              </span>
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </aside>
  );
}
