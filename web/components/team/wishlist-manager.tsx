'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Check, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/crm/toaster';
import { cn } from '@/lib/utils';
import {
  WISHLIST_HORIZON_LABELS,
  WISHLIST_HORIZON_ORDER,
  type WishlistHorizon,
  type WishlistItem,
} from '@/lib/types/db';
import { saveWishlistAction } from '@/app/(app)/team/[id]/actions';

/**
 * WishlistManager — the editable "100's list" (bucket list): the things a person
 * wants to do/have, catalogued from nearest to furthest (horizon). The viewer can
 * add items (title + horizon), tick them done and remove them; everything saves
 * through the demo-safe action (mock-backed for now). Read-only for a non-owner.
 */

const fieldCx =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

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
  const [horizon, setHorizon] = React.useState<WishlistHorizon>('vicino');
  const [saving, setSaving] = React.useState(false);

  // Order nearest → furthest (then by insertion within a horizon).
  const ordered = React.useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          WISHLIST_HORIZON_ORDER.indexOf(a.horizon) -
          WISHLIST_HORIZON_ORDER.indexOf(b.horizon),
      ),
    [items],
  );

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
    const next = [...items, { id: newId(items), title: v, horizon, done: false }];
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
      <p className="text-sm text-muted-foreground">{t('near_to_far')}</p>

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
          <select
            value={horizon}
            onChange={(e) => setHorizon(e.target.value as WishlistHorizon)}
            className={cn(fieldCx, 'sm:w-44')}
            aria-label={t('horizon')}
          >
            {WISHLIST_HORIZON_ORDER.map((h) => (
              <option key={h} value={h}>
                {WISHLIST_HORIZON_LABELS[h]}
              </option>
            ))}
          </select>
          <Button onClick={add} disabled={!title.trim() || saving} className="shrink-0">
            <Plus aria-hidden />
            {t('add')}
          </Button>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {t('count', { count: items.length })}
      </p>

      {ordered.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card/40 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">{t('empty_title')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('empty_body')}</p>
        </div>
      ) : (
        <ol className="space-y-1.5">
          {ordered.map((item, i) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
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
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                  item.done
                    ? 'border-success bg-success text-white'
                    : 'border-input hover:border-ring',
                  readOnly && 'cursor-default opacity-70',
                )}
              >
                {item.done && <Check className="h-3.5 w-3.5" aria-hidden />}
              </button>
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  item.done ? 'text-muted-foreground line-through' : 'text-foreground',
                )}
              >
                {item.title}
              </span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {WISHLIST_HORIZON_LABELS[item.horizon]}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label={t('delete')}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
