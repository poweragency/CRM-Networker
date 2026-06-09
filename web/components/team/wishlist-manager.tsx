'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Plus, Trash2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import type { WishlistItem } from '@/lib/types/db';
import { saveWishlistAction } from '@/app/(app)/team/[id]/actions';

/**
 * WishlistManager — the editable "100's list" (bucket list): the 100 things a
 * person wants to do/have. The viewer adds items, ticks them done and removes
 * them; a completion bar tracks how many goals are achieved. Everything saves
 * through the demo-safe action. Read-only for a non-owner.
 */

const MAX_ITEMS = 100;

function newId(existing: WishlistItem[]): string {
  const max = existing.reduce((m, i) => {
    const n = Number(i.id.replace(/\D/g, ''));
    return Number.isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `wl-${max + 1}`;
}

export function WishlistManager({
  marketerId,
  initialItems,
  readOnly = false,
}: {
  marketerId: string;
  initialItems: WishlistItem[];
  readOnly?: boolean;
}) {
  const t = useTranslations('wishlist');
  const { toast } = useToast();

  const [items, setItems] = React.useState<WishlistItem[]>(initialItems);
  const [title, setTitle] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // Completion = realised goals over the whole list (0% on an empty list).
  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
  // Every single goal achieved → the whole widget turns GOLD (the `warning`
  // token, same gold used at 100% in Presenze) instead of the usual green.
  const allDone = items.length > 0 && doneCount === items.length;

  async function persist(next: WishlistItem[]) {
    setItems(next);
    setSaving(true);
    const res = await saveWishlistAction(marketerId, next);
    setSaving(false);
    if (!res.ok) {
      toast({ title: t('error'), variant: 'error' });
      return;
    }
    toast({
      title: t('saved'),
      description: res.demo ? t('saved_demo') : undefined,
      variant: 'success',
    });
  }

  function add() {
    const v = title.trim();
    if (!v || items.length >= MAX_ITEMS) return;
    // `horizon` is no longer surfaced in the UI; keep a stable default so the
    // data model (and DB column) stays valid.
    const next = [...items, { id: newId(items), title: v, horizon: 'vicino' as const, done: false }];
    setTitle('');
    void persist(next);
  }

  function toggle(id: string) {
    void persist(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  function remove(id: string) {
    void persist(items.filter((i) => i.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Completion bar — green while in progress, GOLD once every goal is done. */}
      <div
        className={cn(
          'rounded-xl border p-4 transition-colors',
          allDone
            ? 'border-warning/40 bg-gradient-to-br from-warning/[0.10] to-transparent'
            : 'border-border/70 bg-gradient-to-br from-success/[0.06] to-transparent',
        )}
      >
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                allDone ? 'bg-warning/15 text-warning' : 'bg-success/10 text-success',
              )}
            >
              <Trophy className="h-[18px] w-[18px]" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold tracking-tight text-foreground">
                {t('progress_label')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('achieved', { done: doneCount, total: items.length })}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p
              className={cn(
                'text-2xl font-bold tabular-nums leading-none transition-colors',
                allDone ? 'text-warning' : 'text-foreground',
              )}
            >
              {pct}
              <span className="text-base font-semibold text-muted-foreground">%</span>
            </p>
            <p className="mt-1 text-[11px] font-medium tabular-nums text-muted-foreground">
              {t('count', { count: items.length })}
            </p>
          </div>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500 ease-standard',
              allDone
                ? 'bg-gradient-to-r from-warning/80 to-warning shadow-[0_0_12px_hsl(var(--warning)/0.6)]'
                : 'bg-gradient-to-r from-success/80 to-success shadow-[0_0_12px_hsl(var(--success)/0.45)]',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {!readOnly && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={t('item_placeholder')}
            maxLength={120}
            aria-label={t('item_placeholder')}
          />
          <Button onClick={add} disabled={!title.trim() || saving} className="shrink-0">
            <Plus aria-hidden />
            {t('add')}
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card/40 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">{t('empty_title')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('empty_body')}</p>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={cn(
                'group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                item.done
                  ? allDone
                    ? 'border-warning/40 bg-warning/[0.08]'
                    : 'border-success/30 bg-success/[0.06]'
                  : 'border-border/70 bg-card hover:border-ring/40',
              )}
            >
              <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <button
                type="button"
                role="checkbox"
                aria-checked={item.done}
                disabled={readOnly}
                onClick={() => toggle(item.id)}
                aria-label={item.title}
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                  item.done
                    ? allDone
                      ? 'border-warning bg-gradient-to-br from-warning to-warning text-white'
                      : 'border-success bg-gradient-to-br from-success to-success text-white'
                    : 'border-input hover:border-ring',
                  readOnly && 'cursor-default opacity-70',
                )}
              >
                {item.done && <Check className="h-3.5 w-3.5" aria-hidden />}
              </button>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  item.done
                    ? allDone
                      ? 'font-medium text-warning'
                      : 'text-muted-foreground line-through'
                    : 'text-foreground',
                )}
              >
                {item.title}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label={t('delete')}
                  className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-all hover:bg-danger/10 hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
