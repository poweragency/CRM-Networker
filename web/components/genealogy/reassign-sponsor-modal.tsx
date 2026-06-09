'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Search, UserCheck } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/crm/toaster';
import {
  reassignSponsorAction,
  searchMarketersAction,
} from '@/app/(app)/genealogia/actions';

/**
 * ReassignSponsorModal — shown after removing a person who SPONSORED others. Their
 * sponsees would otherwise point at the deleted node and render as spillover, so we
 * walk them ONE BY ONE and ask the user who the new sponsor is. Each pick calls the
 * validated `set_sponsor` RPC. Closing (X/Esc) finishes early and leaves any
 * remaining sponsees as-is.
 */

export interface ReassignTarget {
  id: string;
  display_name: string;
}

const rowCx =
  'flex w-full items-center gap-2.5 rounded-lg border border-border/70 bg-card/60 px-3 py-2 text-left text-sm transition-colors hover:border-ring/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

export function ReassignSponsorModal({
  removedName,
  sponsees,
  suggested,
  excludeIds,
  onDone,
}: {
  /** Name of the removed sponsor (for context). */
  removedName: string;
  /** The orphaned sponsees to re-home, in order. */
  sponsees: ReassignTarget[];
  /** A suggested new sponsor (the removed person's own sponsor/parent), or null. */
  suggested: ReassignTarget | null;
  /** Ids that can't be chosen (the removed node). */
  excludeIds: string[];
  /** Called when the flow ends (all handled or closed early). */
  onDone: (reassignedCount: number) => void;
}) {
  const t = useTranslations('genealogia');
  const { toast } = useToast();
  const [idx, setIdx] = React.useState(0);
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<ReassignTarget[]>([]);
  const [searching, setSearching] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const doneCount = React.useRef(0);

  const current = sponsees[idx];

  // Debounced name search over the visible subtree (excludes the removed node + the
  // sponsee itself — you can't sponsor yourself).
  React.useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const res = await searchMarketersAction(q);
      const blocked = new Set([...excludeIds, current?.id]);
      setResults(
        res.nodes
          .filter((n) => !blocked.has(n.id))
          .slice(0, 8)
          .map((n) => ({ id: n.id, display_name: n.display_name })),
      );
      setSearching(false);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, excludeIds, current?.id]);

  function advance() {
    setQuery('');
    setResults([]);
    if (idx + 1 >= sponsees.length) onDone(doneCount.current);
    else setIdx(idx + 1);
  }

  async function pick(sponsorId: string) {
    if (!current || saving) return;
    setSaving(true);
    const res = await reassignSponsorAction(current.id, sponsorId);
    setSaving(false);
    if (!res.ok) {
      toast({ title: t('reassign_error'), variant: 'error' });
      return;
    }
    doneCount.current += 1;
    advance();
  }

  if (!current) return null;

  const showSuggested = suggested && suggested.id !== current.id;

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onDone(doneCount.current);
      }}
      title={t('reassign_title')}
      description={t('reassign_subtitle', { removed: removedName })}
      size="md"
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">
            {idx + 1} / {sponsees.length}
          </span>
          <Button variant="ghost" onClick={advance} disabled={saving}>
            {t('reassign_skip')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Who we're reassigning right now. */}
        <div className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
          <Avatar name={current.display_name} size="sm" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{t('reassign_for')}</p>
            <p className="truncate text-sm font-semibold text-foreground">
              {current.display_name}
            </p>
          </div>
        </div>

        {/* Quick-pick: the removed person's own sponsor (promote up the chain). */}
        {showSuggested && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t('reassign_suggested')}
            </p>
            <button
              type="button"
              onClick={() => pick(suggested.id)}
              disabled={saving}
              className={cn(rowCx, 'border-primary/30 bg-primary/[0.04]')}
            >
              <UserCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate font-medium">{suggested.display_name}</span>
            </button>
          </div>
        )}

        {/* Search the whole visible tree for any other sponsor. */}
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            {t('reassign_search_label')}
          </p>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('reassign_search_ph')}
              aria-label={t('reassign_search_ph')}
              className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {searching && (
              <Loader2
                className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-hidden
              />
            )}
          </div>

          {results.length > 0 && (
            <div className="max-h-56 space-y-1 overflow-y-auto pt-0.5">
              {results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => pick(r.id)}
                  disabled={saving}
                  className={rowCx}
                >
                  <Avatar name={r.display_name} size="sm" className="h-6 w-6 text-[10px]" />
                  <span className="truncate">{r.display_name}</span>
                </button>
              ))}
            </div>
          )}
          {query.trim() && !searching && results.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">{t('reassign_no_match')}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
