import * as React from 'react';
import { cn } from '@/lib/utils';
import { STARTING_PACKAGE_LABELS, type StartingPackage } from '@/lib/types/db';

/**
 * PackageBadge — renders a starting package with its own accent tone:
 * Signature = viola, Premium = oro, Standard = blu, Starter = marrone.
 * Mirrors {@link RankBadge}: a `badge` pill (default) or a `dot` inline marker.
 * Tones are exported as {@link PACKAGE_TONE} for surfaces that need just the
 * classes (e.g. an accent bar on the /informativa price cards).
 */

export const PACKAGE_TONE: Record<
  StartingPackage,
  { text: string; bg: string; dot: string }
> = {
  signature: {
    text: 'text-package-signature',
    bg: 'bg-package-signature/12',
    dot: 'bg-package-signature',
  },
  premium: {
    text: 'text-package-premium',
    bg: 'bg-package-premium/12',
    dot: 'bg-package-premium',
  },
  standard: {
    text: 'text-package-standard',
    bg: 'bg-package-standard/12',
    dot: 'bg-package-standard',
  },
  starter: {
    text: 'text-package-starter',
    bg: 'bg-package-starter/14',
    dot: 'bg-package-starter',
  },
};

export interface PackageBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  pkg: StartingPackage;
  /** `badge` = pill with label (default); `dot` = colored dot + label inline. */
  variant?: 'badge' | 'dot';
  /** Override the displayed label. */
  label?: string;
}

export function PackageBadge({
  pkg,
  variant = 'badge',
  label,
  className,
  ...props
}: PackageBadgeProps) {
  const tone = PACKAGE_TONE[pkg];
  const text = label ?? STARTING_PACKAGE_LABELS[pkg];

  if (variant === 'dot') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-xs font-medium', className)}
        {...props}
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', tone.dot)} aria-hidden />
        {text}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone.bg,
        tone.text,
        className,
      )}
      {...props}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden />
      {text}
    </span>
  );
}
