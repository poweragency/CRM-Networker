import * as React from 'react';
import { cn } from '@/lib/utils';
import { STARTING_PACKAGE_LABELS, type StartingPackage } from '@/lib/types/db';

/**
 * PackageBadge — renders a starting package as a premium tier marker, each with
 * its own accent tone: Signature = viola, Premium = oro, Standard = blu,
 * Starter = marrone. Mirrors {@link RankBadge}: a `badge` pill (default) or a
 * `dot` inline marker, with a tone-matched hairline ring and a soft sheen sweep
 * on the higher tiers (Signature / Premium) so they read as the flagship
 * offers. Tones are exported as {@link PACKAGE_TONE} for surfaces that need just
 * the classes (e.g. an accent bar on the /informativa price cards) — the export
 * shape ({ text, bg, dot }) is part of the contract and must stay stable.
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

/**
 * Tone-matched ring + flagship treatment. `surface` (gradient overlay) and
 * `sheen` (shimmer mid stop) are derived from each package's own `package-*`
 * token — NOT `currentColor`, since a `current/<opacity>` gradient stop emits
 * no CSS in Tailwind 3 and the effect would silently vanish.
 */
const PACKAGE_ACCENT: Record<
  StartingPackage,
  { ring: string; flagship: boolean; surface: string; sheen: string }
> = {
  signature: {
    ring: 'ring-package-signature/35',
    flagship: true,
    surface: 'from-package-signature/[0.06] via-transparent to-package-signature/[0.14]',
    sheen: 'via-package-signature/35',
  },
  premium: {
    ring: 'ring-package-premium/35',
    flagship: true,
    surface: 'from-package-premium/[0.06] via-transparent to-package-premium/[0.14]',
    sheen: 'via-package-premium/35',
  },
  standard: {
    ring: 'ring-package-standard/25',
    flagship: false,
    surface: '',
    sheen: '',
  },
  starter: {
    ring: 'ring-package-starter/25',
    flagship: false,
    surface: '',
    sheen: '',
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
  const accent = PACKAGE_ACCENT[pkg];
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
        'relative inline-flex items-center gap-1.5 overflow-hidden rounded-full px-2.5 py-0.5',
        'text-xs font-semibold tracking-tight ring-1 animate-rank-in',
        tone.bg,
        tone.text,
        accent.ring,
        accent.flagship && cn('bg-gradient-to-br', accent.surface),
        className,
      )}
      {...props}
    >
      {accent.flagship && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent to-transparent opacity-70 animate-sheen',
            accent.sheen,
          )}
        />
      )}
      <span className={cn('relative h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
      <span className="relative">{text}</span>
    </span>
  );
}
