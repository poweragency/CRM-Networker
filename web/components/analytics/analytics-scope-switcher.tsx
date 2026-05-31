import Link from 'next/link';
import { Globe, PanelLeft, PanelRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';
import type { BranchScope } from '@/lib/types/db';

/**
 * URL-driven Global | Sinistra | Destra segmented control for /analytics. Unlike
 * the topbar's {@link ScopeSwitcher} (which needs the client ScopeProvider), this
 * is a server component built from `<Link>`s pointing at `?scope=` so the
 * analytics page stays a pure RSC reading `searchParams`. The view is shareable
 * and survives reload/back-button (ADR-008: scope lives in the URL).
 */

const OPTIONS: ReadonlyArray<{
  scope: BranchScope;
  param: string;
  labelKey: 'global' | 'left' | 'right';
  Icon: typeof Globe;
  active: string;
}> = [
  { scope: 'GLOBAL', param: 'global', labelKey: 'global', Icon: Globe, active: 'text-branch-global' },
  { scope: 'LEFT', param: 'left', labelKey: 'left', Icon: PanelLeft, active: 'text-branch-left' },
  { scope: 'RIGHT', param: 'right', labelKey: 'right', Icon: PanelRight, active: 'text-branch-right' },
];

export interface AnalyticsScopeSwitcherProps {
  scope: BranchScope;
  basePath?: string;
  className?: string;
}

export async function AnalyticsScopeSwitcher({
  scope,
  basePath = '/analytics',
  className,
}: AnalyticsScopeSwitcherProps) {
  const t = await getTranslations('branch');
  return (
    <div
      role="radiogroup"
      aria-label={t('global')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border bg-muted/50 p-0.5',
        className,
      )}
    >
      {OPTIONS.map(({ scope: value, param, labelKey, Icon, active }) => {
        const selected = scope === value;
        const label = t(labelKey);
        // 'global' is the default → keep the URL clean (no query param).
        const href = param === 'global' ? basePath : `${basePath}?scope=${param}`;
        return (
          <Link
            key={value}
            href={href}
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            scroll={false}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? cn('bg-background shadow-sm', active)
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}
