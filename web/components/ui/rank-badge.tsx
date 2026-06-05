import * as React from 'react';
import { cn } from '@/lib/utils';
import { RANK_LABELS, type MarketerRank } from '@/lib/types/db';

/**
 * RankBadge — renders a marketer's rank with a per-rank accent tone (doc 08
 * §6.3). Label text is `ranks_meta.label_it` (English-looking proper nouns kept
 * verbatim per the domain spec). The dot variant is a compact tone-only marker
 * for dense surfaces (tree nodes, table cells).
 */

const rankTone: Record<MarketerRank, { text: string; bg: string; dot: string }> = {
  cliente: {
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    dot: 'bg-muted-foreground/60',
  },
  no_rank: {
    text: 'text-muted-foreground',
    bg: 'bg-muted',
    dot: 'bg-muted-foreground',
  },
  executive: {
    text: 'text-rank-executive',
    bg: 'bg-rank-executive/12',
    dot: 'bg-rank-executive',
  },
  consultant: {
    text: 'text-rank-consultant',
    bg: 'bg-rank-consultant/12',
    dot: 'bg-rank-consultant',
  },
  team_leader: {
    text: 'text-rank-teamLeader',
    bg: 'bg-rank-teamLeader/12',
    dot: 'bg-rank-teamLeader',
  },
  senior_team_leader: {
    text: 'text-rank-seniorTeamLeader',
    bg: 'bg-rank-seniorTeamLeader/12',
    dot: 'bg-rank-seniorTeamLeader',
  },
  executive_team_leader: {
    text: 'text-rank-executiveTeamLeader',
    bg: 'bg-rank-executiveTeamLeader/12',
    dot: 'bg-rank-executiveTeamLeader',
  },
  vice_president: {
    text: 'text-rank-vicePresident',
    bg: 'bg-rank-vicePresident/12',
    dot: 'bg-rank-vicePresident',
  },
  senior_vice_president: {
    text: 'text-rank-seniorVicePresident',
    bg: 'bg-rank-seniorVicePresident/12',
    dot: 'bg-rank-seniorVicePresident',
  },
  executive_vice_president: {
    text: 'text-rank-executiveVicePresident',
    bg: 'bg-rank-executiveVicePresident/12',
    dot: 'bg-rank-executiveVicePresident',
  },
  global_director: {
    text: 'text-rank-globalDirector',
    bg: 'bg-rank-globalDirector/12',
    dot: 'bg-rank-globalDirector',
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
  // Top ranks read as "high level": a subtle glowing ring in the rank's tone.
  const prestige =
    rank === 'vice_president' ||
    rank === 'senior_vice_president' ||
    rank === 'executive_vice_president' ||
    rank === 'global_director';

  if (variant === 'dot') {
    return (
      <span
        className={cn('inline-flex items-center gap-1.5 text-xs font-medium', className)}
        {...props}
      >
        <span
          className={cn('h-2 w-2 shrink-0 rounded-full', tone.dot)}
          aria-hidden
        />
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
        prestige && 'ring-1 ring-current/40',
        className,
      )}
      {...props}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', tone.dot, prestige && 'animate-glow-pulse')}
        aria-hidden
      />
      {text}
    </span>
  );
}
