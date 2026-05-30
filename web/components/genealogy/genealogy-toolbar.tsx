'use client';

import * as React from 'react';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Loader2,
  Maximize2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { ScopeSwitcher } from '@/components/scope-switcher';
import { Tooltip } from '@/components/ui/tooltip';
import { GenealogySearch } from './genealogy-search';
import { cn } from '@/lib/utils';
import type { TreeNode } from '@/lib/types/db';

/**
 * Controls bar above the canvas: search, the Global | Sinistra | Destra scope
 * switcher (wired to the scope provider), expand-all / collapse-all and fit-view.
 * Responsive: collapses to a stacked layout on small screens.
 */

export interface GenealogyToolbarProps {
  onSearch: (q: string) => Promise<TreeNode[]>;
  onPick: (node: TreeNode) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onFitView: () => void;
  loading: boolean;
  className?: string;
}

export function GenealogyToolbar({
  onSearch,
  onPick,
  onExpandAll,
  onCollapseAll,
  onFitView,
  loading,
  className,
}: GenealogyToolbarProps) {
  const t = useTranslations('genealogia');

  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <GenealogySearch onSearch={onSearch} onPick={onPick} />
        {loading && (
          <Loader2
            className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
            aria-label={t('loading')}
          />
        )}
      </div>

      <div className="flex items-center gap-2">
        <ScopeSwitcher />

        <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-0.5">
          <Tooltip content={t('expand_all')} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('expand_all')}
              onClick={onExpandAll}
            >
              <ChevronsUpDown aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('collapse_all')} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('collapse_all')}
              onClick={onCollapseAll}
            >
              <ChevronsDownUp aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content={t('fit_view')} side="bottom">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label={t('fit_view')}
              onClick={onFitView}
            >
              <Maximize2 aria-hidden />
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
