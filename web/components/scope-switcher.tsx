'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';
import { Globe, PanelLeft, PanelRight } from 'lucide-react';
import { useScope } from '@/lib/scope/scope-provider';
import { cn } from '@/lib/utils';
import type { BranchScope } from '@/lib/types/db';

/**
 * ScopeSwitcher — the first-class Global | Sinistra | Destra segmented control
 * (doc 14 §0, ADR-008: scope lives in the URL). Reads/writes the `?scope=` param
 * via the scope context, so the active branch view is shareable and survives
 * reload/back-button. Each segment carries its branch identity color.
 *
 * Must be rendered under a <ScopeProvider> (itself inside a Suspense boundary).
 */

const OPTIONS: ReadonlyArray<{
  scope: BranchScope;
  labelKey: 'global' | 'left' | 'right';
  Icon: typeof Globe;
  active: string;
}> = [
  { scope: 'GLOBAL', labelKey: 'global', Icon: Globe, active: 'text-branch-global' },
  { scope: 'LEFT', labelKey: 'left', Icon: PanelLeft, active: 'text-branch-left' },
  { scope: 'RIGHT', labelKey: 'right', Icon: PanelRight, active: 'text-branch-right' },
];

export interface ScopeSwitcherProps {
  className?: string;
  /** `full` shows icon+label; `compact` shows icon only (mobile/topbar). */
  size?: 'full' | 'compact';
}

export function ScopeSwitcher({
  className,
  size = 'full',
}: ScopeSwitcherProps) {
  const t = useTranslations('branch');
  const { scope, setScope } = useScope();

  return (
    <div
      role="radiogroup"
      aria-label={t('global')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ scope: value, labelKey, Icon, active }) => {
        const selected = scope === value;
        const label = t(labelKey);
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setScope(value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? cn('bg-background shadow-sm', active)
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {size === 'full' && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
