import * as React from 'react';
import { cn } from '@/lib/utils';
import { RANK_LABELS, type MarketerRank } from '@/lib/types/db';

/**
 * RankBadge — renders a marketer's rank as a prestige object (doc 08 §6.3).
 * Each rank owns a unique visual identity built from its `rank-*` token: a
 * tinted pill, a tone-matched ring, and — for the upper ranks — a gold-touched
 * border, a controlled glow and a softly pulsing emblem dot. The badge enters
 * with `animate-rank-in` and a faint diagonal sheen sweeps the higher tiers, so
 * a Vice President reads visibly more "earned" than an Executive. The `dot`
 * variant stays a compact tone-only marker for dense surfaces (tree nodes,
 * table cells). Label text is `ranks_meta.label_it` (proper nouns kept verbatim
 * per the domain spec).
 */

/**
 * Per-rank visual identity. `tier` drives the prestige treatment:
 *   base      → neutral (cliente / no_rank)
 *   standard  → tinted pill, hairline ring
 *   elevated  → richer tint, sheen sweep on the surface
 *   prestige  → gold-grade: gradient surface, glow, pulsing emblem, sheen
 *
 * `surface` is the per-rank gradient overlay for prestige badges and `sheen`
 * is the diagonal shimmer's mid stop. Both are derived from the rank's own
 * `rank-*` token (NOT `currentColor` — in Tailwind 3 a `current/<opacity>`
 * gradient stop emits no CSS, so the effect would silently disappear).
 */
type RankTier = 'base' | 'standard' | 'elevated' | 'prestige';

const rankTone: Record<
  MarketerRank,
  {
    text: string;
    bg: string;
    dot: string;
    ring: string;
    tier: RankTier;
    /** Gradient surface stops for prestige badges (token-based). */
    surface: string;
    /** Mid stop of the diagonal sheen sweep (token-based). */
    sheen: string;
  }
> = {
  cliente: {
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    dot: 'bg-muted-foreground/60',
    ring: 'ring-border',
    tier: 'base',
    surface: '',
    sheen: '',
  },
  no_rank: {
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    dot: 'bg-muted-foreground',
    ring: 'ring-border',
    tier: 'base',
    surface: '',
    sheen: '',
  },
  executive: {
    text: 'text-rank-executive',
    bg: 'bg-rank-executive/12',
    dot: 'bg-rank-executive',
    ring: 'ring-rank-executive/25',
    tier: 'standard',
    surface: '',
    sheen: '',
  },
  consultant: {
    text: 'text-rank-consultant',
    bg: 'bg-rank-consultant/12',
    dot: 'bg-rank-consultant',
    ring: 'ring-rank-consultant/25',
    tier: 'standard',
    surface: '',
    sheen: '',
  },
  team_leader: {
    text: 'text-rank-teamLeader',
    bg: 'bg-rank-teamLeader/12',
    dot: 'bg-rank-teamLeader',
    ring: 'ring-rank-teamLeader/25',
    tier: 'standard',
    surface: '',
    sheen: '',
  },
  advanced_team_leader: {
    text: 'text-rank-advancedTeamLeader',
    bg: 'bg-rank-advancedTeamLeader/14',
    dot: 'bg-rank-advancedTeamLeader',
    ring: 'ring-rank-advancedTeamLeader/30',
    tier: 'elevated',
    surface: '',
    sheen: 'via-rank-advancedTeamLeader/25',
  },
  senior_team_leader: {
    text: 'text-rank-seniorTeamLeader',
    bg: 'bg-rank-seniorTeamLeader/14',
    dot: 'bg-rank-seniorTeamLeader',
    ring: 'ring-rank-seniorTeamLeader/30',
    tier: 'elevated',
    surface: '',
    sheen: 'via-rank-seniorTeamLeader/25',
  },
  executive_team_leader: {
    text: 'text-rank-executiveTeamLeader',
    bg: 'bg-rank-executiveTeamLeader/14',
    dot: 'bg-rank-executiveTeamLeader',
    ring: 'ring-rank-executiveTeamLeader/30',
    tier: 'elevated',
    surface: '',
    sheen: 'via-rank-executiveTeamLeader/25',
  },
  vice_president: {
    text: 'text-rank-vicePresident',
    bg: 'bg-rank-vicePresident/14',
    dot: 'bg-rank-vicePresident',
    ring: 'ring-rank-vicePresident/40',
    tier: 'prestige',
    surface: 'from-rank-vicePresident/[0.06] via-transparent to-rank-vicePresident/[0.14]',
    sheen: 'via-rank-vicePresident/35',
  },
  senior_vice_president: {
    text: 'text-rank-seniorVicePresident',
    bg: 'bg-rank-seniorVicePresident/14',
    dot: 'bg-rank-seniorVicePresident',
    ring: 'ring-rank-seniorVicePresident/40',
    tier: 'prestige',
    surface:
      'from-rank-seniorVicePresident/[0.06] via-transparent to-rank-seniorVicePresident/[0.14]',
    sheen: 'via-rank-seniorVicePresident/35',
  },
  executive_vice_president: {
    text: 'text-rank-executiveVicePresident',
    bg: 'bg-rank-executiveVicePresident/14',
    dot: 'bg-rank-executiveVicePresident',
    ring: 'ring-rank-executiveVicePresident/40',
    tier: 'prestige',
    surface:
      'from-rank-executiveVicePresident/[0.06] via-transparent to-rank-executiveVicePresident/[0.14]',
    sheen: 'via-rank-executiveVicePresident/35',
  },
  global_director: {
    text: 'text-rank-globalDirector',
    bg: 'bg-rank-globalDirector/16',
    dot: 'bg-rank-globalDirector',
    ring: 'ring-rank-globalDirector/45',
    tier: 'prestige',
    surface:
      'from-rank-globalDirector/[0.06] via-transparent to-rank-globalDirector/[0.14]',
    sheen: 'via-rank-globalDirector/35',
  },
};

export interface RankBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  rank: MarketerRank;
  /** `badge` = pill with label (default); `dot` = colored dot + label inline. */
  variant?: 'badge' | 'dot';
  /** Override the displayed label (e.g. from `ranks_meta.label_it`). */
  label?: string;
}

export function RankBadge({
  rank,
  variant = 'badge',
  label,
  className,
  ...props
}: RankBadgeProps) {
  const tone = rankTone[rank];
  const text = label ?? RANK_LABELS[rank];
  const elevated = tone.tier === 'elevated' || tone.tier === 'prestige';
  const prestige = tone.tier === 'prestige';

  if (variant === 'dot') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-xs font-medium', className)}
        {...props}
      >
        <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden>
          {prestige && (
            <span
              className={cn(
                'absolute inset-0 rounded-full animate-glow-pulse',
                tone.dot,
              )}
            />
          )}
          <span className={cn('relative h-2 w-2 rounded-full', tone.dot)} />
        </span>
        {text}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'relative inline-flex items-center gap-1.5 overflow-hidden rounded-full px-2.5 py-0.5',
        'text-xs font-semibold tracking-tight ring-1 animate-rank-in',
        'transition-shadow duration-base ease-standard',
        tone.bg,
        tone.text,
        tone.ring,
        prestige &&
          cn('shadow-glow-warning bg-gradient-to-br', tone.surface),
        className,
      )}
      {...props}
    >
      {/* Diagonal sheen — light prestige shimmer for elevated/prestige tiers.
          The mid stop is a token-based tint (currentColor + opacity emits no
          CSS in Tailwind 3). Prestige sweeps brighter than elevated so the two
          tiers stay visually distinct. */}
      {elevated && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent to-transparent animate-sheen',
            tone.sheen,
            prestige ? 'opacity-80' : 'opacity-50',
          )}
        />
      )}
      {/* Emblem dot — pulses with a halo for prestige ranks. */}
      <span className="relative inline-flex h-1.5 w-1.5 shrink-0" aria-hidden>
        {prestige && (
          <span
            className={cn(
              'absolute -inset-0.5 rounded-full opacity-70 animate-glow-pulse',
              tone.dot,
            )}
          />
        )}
        <span className={cn('relative h-1.5 w-1.5 rounded-full', tone.dot)} />
      </span>
      <span className="relative">{text}</span>
    </span>
  );
}
