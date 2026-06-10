import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Crown, Medal, Sparkles, Trophy } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { RankBadge } from '@/components/ui/rank-badge';
import { SpotlightValue } from '@/components/dashboard/spotlight-value';
import { cn } from '@/lib/utils';
import type { TopMarketerEntry } from '@/lib/data/mock/dashboard';

/**
 * Dashboard leaderboard presenters (server components — no hooks).
 *
 * `SpotlightCard` = the hero card for a category's #1 marketer (oversized avatar,
 * name, rank, animated value, floating premium crown, accent aura).
 * `LeaderboardCard` = the full ranked competition: the #1 is the CHAMPION
 * (spotlight row, gold prestige glow + ring), 2/3 silver/bronze podium, then a
 * value bar relative to the leader, all entering in a cascade (animate-rank-in).
 * Both are pure presentation over `TopMarketerEntry`.
 *
 * The animated hero number is delegated to {@link SpotlightValue} (a client
 * island that builds its own formatter), so NO function ever crosses the
 * server → client boundary from these RSCs.
 */

export type Accent = 'primary' | 'info' | 'success' | 'warning';

interface AccentTheme {
  /** Icon chip (soft tinted square). */
  chip: string;
  /** Solid value-bar fill. */
  bar: string;
  /** Hero aura gradient (radial accent wash). */
  aura: string;
  /** Avatar / surface ring. */
  ring: string;
  /** Eyebrow / accent text. */
  text: string;
}

const ACCENT: Record<Accent, AccentTheme> = {
  primary: {
    chip: 'bg-primary/12 text-primary ring-1 ring-primary/20',
    // Same-colour gradient (background-image) not solid bg: Samsung Internet's
    // dark-mode-for-web darkens bright solid fills (gold -> dark red) but leaves
    // background images alone. Applies to every leaderboard value bar.
    bar: 'bg-gradient-to-r from-primary to-primary',
    aura: 'from-primary/25 via-primary/[0.07]',
    ring: 'ring-primary/25',
    text: 'text-primary',
  },
  info: {
    chip: 'bg-info/12 text-info ring-1 ring-info/20',
    bar: 'bg-gradient-to-r from-info to-info',
    aura: 'from-info/25 via-info/[0.07]',
    ring: 'ring-info/25',
    text: 'text-info',
  },
  success: {
    chip: 'bg-success/12 text-success ring-1 ring-success/20',
    bar: 'bg-gradient-to-r from-success to-success',
    aura: 'from-success/25 via-success/[0.07]',
    ring: 'ring-success/25',
    text: 'text-success',
  },
  warning: {
    chip: 'bg-warning/15 text-warning ring-1 ring-warning/25',
    bar: 'bg-gradient-to-r from-warning to-warning',
    aura: 'from-warning/30 via-warning/[0.08]',
    ring: 'ring-warning/30',
    text: 'text-warning',
  },
};

/** Conversion is a 0..1 ratio (success accent); everything else is a count. */
function valueKind(accent: Accent): 'count' | 'percent' {
  return accent === 'success' ? 'percent' : 'count';
}

/** Podium tone per position: gold / silver / bronze, then muted. */
const MEDAL: Record<number, string> = {
  1: 'bg-warning/15 text-warning ring-1 ring-warning/35',
  2: 'bg-muted text-foreground ring-1 ring-border',
  3: 'bg-[hsl(25_60%_45%/0.16)] text-[hsl(25_55%_42%)] ring-1 ring-[hsl(25_55%_42%/0.30)]',
};

export interface SpotlightCardProps {
  label: string;
  icon: LucideIcon;
  accent: Accent;
  entry: TopMarketerEntry | undefined;
  formatValue: (value: number) => string;
  youLabel: string;
  emptyLabel: string;
}

export function SpotlightCard({
  label,
  icon: Icon,
  accent,
  entry,
  // NOTE: `formatValue` stays in the props contract (callers still pass it), but
  // the live hero number is animated by <SpotlightValue> (a client island that
  // builds its own formatter), so we don't render `formatValue` here — that keeps
  // any function from crossing the server → client boundary.
  youLabel,
  emptyLabel,
}: SpotlightCardProps) {
  const a = ACCENT[accent];

  if (!entry) {
    return (
      <div className="surface-grid relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-5 shadow-card">
        <CategoryEyebrow icon={Icon} accent={accent} label={label} />
        <p className="py-10 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <Link
      href={`/team/${entry.marketer_id}`}
      className={cn(
        'group relative flex flex-col gap-4 overflow-hidden rounded-xl border border-border/80 bg-card p-5 shadow-card outline-none',
        'animate-scale-in transition-[box-shadow,transform,border-color] duration-base ease-emphasized',
        'hover:-translate-y-1 hover:border-border hover:shadow-glow focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      {/* Layer 1 — drifting accent aura (controlled glow). */}
      <div
        className={cn(
          'pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-gradient-to-br to-transparent blur-2xl opacity-70 animate-aurora',
          a.aura,
        )}
        aria-hidden
      />
      {/* Layer 2 — faint tech grid for depth. */}
      <div className="surface-grid pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden />
      {/* Layer 3 — sheen sweep on hover. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -inset-y-2 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent opacity-0 transition-opacity duration-base group-hover:opacity-100 group-hover:animate-sheen" />
      </div>

      <div className="relative flex items-center justify-between">
        <CategoryEyebrow icon={Icon} accent={accent} label={label} />
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/15 text-warning ring-1 ring-warning/35 shadow-glow-warning animate-float"
          title="1ª posizione"
          aria-hidden
        >
          <Crown className="h-4 w-4" />
        </span>
      </div>

      <div className="relative flex items-center gap-3">
        <span className="relative">
          <Avatar
            name={entry.display_name}
            size="lg"
            className={cn('ring-2 ring-offset-2 ring-offset-card', a.ring)}
          />
          <span
            className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-warning to-warning text-warning-foreground ring-2 ring-card shadow-sm"
            aria-hidden
          >
            <Trophy className="h-3 w-3" />
          </span>
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-foreground">
            <span className="truncate">{entry.display_name}</span>
            {entry.is_self && (
              <span className="shrink-0 rounded bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                {youLabel}
              </span>
            )}
          </p>
          <div className="mt-1">
            <RankBadge rank={entry.rank} className="px-1.5 py-0 text-[10px]" />
          </div>
        </div>
      </div>

      <div className="relative flex items-baseline gap-2">
        <span className="text-4xl font-bold leading-none tracking-tight text-foreground tabular-nums">
          <SpotlightValue value={entry.value} kind={valueKind(accent)} />
        </span>
        {entry.cam_rate != null && (
          <span
            className="text-sm font-medium tabular-nums text-muted-foreground"
            title="% di cam attiva sulle Zoom del mese"
          >
            {Math.round(entry.cam_rate * 100)}% cam
          </span>
        )}
      </div>
    </Link>
  );
}

export interface LeaderboardCardProps {
  label: string;
  description: string;
  icon: LucideIcon;
  accent: Accent;
  entries: TopMarketerEntry[];
  formatValue: (value: number) => string;
  youLabel: string;
  emptyLabel: string;
}

export function LeaderboardCard({
  label,
  description,
  icon: Icon,
  accent,
  entries,
  formatValue,
  youLabel,
  emptyLabel,
}: LeaderboardCardProps) {
  const a = ACCENT[accent];
  const max = entries.length ? entries[0]!.value : 0;
  const champion = entries[0];
  const rest = entries.slice(1);

  return (
    <div className="group/card relative flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-card transition-shadow duration-base ease-standard hover:shadow-card-hover">
      {/* Header */}
      <div className="relative flex items-start gap-3 border-b border-border/70 p-5">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            a.chip,
          )}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight tracking-tight text-foreground">
            {label}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-3 p-3">
          {/* CHAMPION — spotlight row with gold prestige. */}
          {champion && (
            <Link
              href={`/team/${champion.marketer_id}`}
              className={cn(
                'group/champ relative flex items-center gap-3 overflow-hidden rounded-lg border border-warning/30 p-3 outline-none',
                'bg-gradient-to-br from-warning/[0.12] via-warning/[0.04] to-transparent',
                'shadow-glow-warning ring-1 ring-warning/25',
                'animate-rank-in transition-transform duration-base ease-emphasized hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring',
                champion.is_self && 'ring-primary/40',
              )}
            >
              {/* Champion crown badge */}
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warning/15 text-warning ring-1 ring-warning/40 shadow-glow-warning animate-float"
                aria-hidden
              >
                <Crown className="h-[18px] w-[18px]" />
              </span>
              <span className="relative shrink-0">
                <Avatar
                  name={champion.display_name}
                  size="md"
                  className="ring-2 ring-warning/40 ring-offset-2 ring-offset-card"
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <span className="truncate">{champion.display_name}</span>
                  {champion.is_self && (
                    <span className="shrink-0 rounded bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                      {youLabel}
                    </span>
                  )}
                </p>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-warning">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Campione del ciclo
                </span>
              </div>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-lg font-bold tabular-nums tracking-tight text-foreground">
                  {formatValue(champion.value)}
                </span>
                {champion.cam_rate != null && (
                  <span
                    className="text-[11px] font-medium tabular-nums text-muted-foreground"
                    title="% di cam attiva sulle Zoom del mese"
                  >
                    {Math.round(champion.cam_rate * 100)}% cam
                  </span>
                )}
              </span>
            </Link>
          )}

          {/* Challengers — 2/3 podium then the rest, value bars relative to leader. */}
          {rest.length > 0 && (
            <ol className="space-y-0.5">
              {rest.map((e, i) => {
                const pct = max > 0 ? Math.max(6, Math.round((e.value / max) * 100)) : 0;
                const isPodium = e.position === 2 || e.position === 3;
                return (
                  <li
                    key={e.marketer_id}
                    className="animate-rank-in"
                    // Cascade: champion is 0, challengers stagger after it.
                    style={{ animationDelay: `${(i + 1) * 70}ms` }}
                  >
                    <Link
                      href={`/team/${e.marketer_id}`}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring',
                        e.is_self && 'bg-primary/[0.06] ring-1 ring-primary/20',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                          isPodium
                            ? MEDAL[e.position]
                            : 'bg-muted/60 text-muted-foreground',
                        )}
                      >
                        {isPodium ? (
                          <Medal className="h-[14px] w-[14px]" aria-hidden />
                        ) : (
                          e.position
                        )}
                      </span>
                      <Avatar name={e.display_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-medium text-foreground">
                          <span className="truncate">{e.display_name}</span>
                          {e.is_self && (
                            <span className="shrink-0 rounded bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary ring-1 ring-primary/20">
                              {youLabel}
                            </span>
                          )}
                        </p>
                        {/* Value bar relative to the leader. */}
                        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <span
                            className={cn('block h-full rounded-full transition-all duration-base ease-emphasized', a.bar)}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                      </div>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="text-sm font-semibold tabular-nums text-foreground">
                          {formatValue(e.value)}
                        </span>
                        {e.cam_rate != null && (
                          <span
                            className="text-[11px] font-medium tabular-nums text-muted-foreground"
                            title="% di cam attiva sulle Zoom del mese"
                          >
                            {Math.round(e.cam_rate * 100)}% cam
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryEyebrow({
  icon: Icon,
  accent,
  label,
}: {
  icon: LucideIcon;
  accent: Accent;
  label: string;
}) {
  const a = ACCENT[accent];
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg',
          a.chip,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </span>
  );
}
