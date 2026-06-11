import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, BadgeCheck, RefreshCw } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { cn } from '@/lib/utils';
import { RANK_ORDER, type MarketerRank, type TreeNode } from '@/lib/types/db';
import { WhatsAppButton } from '@/components/crm/whatsapp-button';
import { CatenaButton } from '@/components/streak/catena-button';
import type { DmoStatus } from '@/lib/data/streak';

/**
 * MarketerHero — the profile identity masthead (server component), styled as an
 * EXECUTIVE profile header: a layered, aurora-lit panel with a large status-ringed
 * avatar, a strongly valorised RANK (glow ring for prestige ranks), identity (name
 * + "Tu") and a status strip (renewal + CRM account). The header actions
 * (Anagrafica via the `action` slot + WhatsApp quick-contact) ride to the right of
 * the name so the anagrafica is reachable from any tab. The numbers (team
 * structure + personal performance) live in the "Produzione" section via
 * {@link MarketerKpis}.
 */

const STATUS_RING: Record<string, string> = {
  active: 'ring-success/50',
  pending: 'ring-warning/50',
  inactive: 'ring-border',
};

const STATUS_DOT: Record<string, string> = {
  active: 'bg-success',
  pending: 'bg-warning',
  inactive: 'bg-muted-foreground/50',
};

/** Prestige ranks earn the full gold-glow executive treatment on the masthead. */
function isPrestige(rank: MarketerRank): boolean {
  return RANK_ORDER.indexOf(rank) >= RANK_ORDER.indexOf('vice_president');
}

export async function MarketerHero({
  node,
  isSelf,
  phone = null,
  action = null,
  streak = null,
}: {
  node: TreeNode;
  isSelf: boolean;
  /** Phone number → WhatsApp quick-contact (hidden on the own profile). */
  phone?: string | null;
  /** Header action shown to the right of the name (e.g. the Anagrafica button). */
  action?: ReactNode;
  /** The viewer's own DMO streak — shows the "Catena d'Oro" chip (self only). */
  streak?: DmoStatus | null;
}) {
  const t = await getTranslations('team');
  const active = node.status === 'active';
  const prestige = isPrestige(node.rank);

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-card transition-shadow duration-base ease-standard',
        prestige ? 'hover:shadow-glow-warning' : 'hover:shadow-card-hover',
      )}
    >
      {/* Layered atmospheric backdrop: technical grid + a slow accent (or gold,
          for prestige ranks) aurora bloom behind the identity. */}
      <div className="pointer-events-none absolute inset-0 surface-grid opacity-60" aria-hidden />
      <div
        className={cn(
          'pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full blur-3xl animate-aurora',
          prestige ? 'bg-warning/20' : 'bg-primary/20',
        )}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />

      <div className="relative p-5 sm:p-6">
        {/* Back-to-Statistiche only when viewing SOMEONE ELSE (you reach a teammate
            from the roster); on your own profile it's hidden. */}
        {!isSelf && (
          <Link
            href="/statistiche"
            className="mb-4 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            {t('breadcrumb')}
          </Link>
        )}

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          {/* Avatar + status — the prestige glow halo for top ranks. */}
          <div className="relative shrink-0">
            {prestige && (
              <span
                className="pointer-events-none absolute -inset-1.5 rounded-full bg-warning/25 blur-md animate-glow-pulse"
                aria-hidden
              />
            )}
            <Avatar
              name={node.display_name}
              size="lg"
              className={cn(
                'relative h-20 w-20 text-2xl shadow-md ring-2 ring-offset-2 ring-offset-card',
                STATUS_RING[node.status],
              )}
            />
            <span
              className={cn(
                'absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-card',
                STATUS_DOT[node.status],
                active && 'animate-glow-pulse',
              )}
              title={active ? t('renewal_active') : t('renewal_inactive')}
              aria-hidden
            />
          </div>

          <div className="min-w-0 flex-1">
            {/* Name row + right-aligned header actions. */}
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {node.display_name}
              </h1>
              {isSelf && (
                <Badge variant="default" className="gap-1 px-2 py-0.5">
                  <BadgeCheck className="h-3 w-3" aria-hidden />
                  {t('you')}
                </Badge>
              )}
              {isSelf && streak && <CatenaButton initial={streak} />}
              {(action || (!isSelf && phone)) && (
                <div className="ml-auto flex items-center gap-2">
                  {action}
                  {!isSelf && phone && (
                    <WhatsAppButton
                      phone={phone}
                      name={node.display_name}
                      withLabel
                      className="border border-[#25D366]/30"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Rank — the centrepiece. Enlarged + glow ring for prestige. */}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <RankBadge
                rank={node.rank}
                className={cn(
                  'px-3 py-1 text-sm font-semibold shadow-sm',
                  prestige && 'shadow-glow-warning ring-2',
                )}
              />

              {/* Status strip — renewal (rinnovo). The CRM-account chip was
                  removed: every account is active from the start, so it carried
                  no signal. */}
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip
                  icon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                  label={t('renewal_prefix')}
                  value={active ? t('renewal_active') : t('renewal_inactive')}
                  tone={active ? 'success' : 'danger'}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom accent hairline — gold for prestige, accent otherwise. */}
      <div
        className={cn(
          'h-1 w-full',
          prestige
            ? 'bg-gradient-to-r from-warning/70 via-warning/30 to-transparent'
            : 'bg-gradient-to-r from-primary/60 via-primary/20 to-transparent',
        )}
        aria-hidden
      />
    </div>
  );
}

type ChipTone = 'success' | 'danger' | 'info' | 'muted';

const CHIP_TONES: Record<ChipTone, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  info: 'border-info/30 bg-info/10 text-info',
  muted: 'border-border bg-muted text-muted-foreground',
};

/** A compact label:value chip used for the renewal / CRM-account status strip. */
function StatusChip({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: ChipTone;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        CHIP_TONES[tone],
      )}
    >
      {icon}
      <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
        {label}
      </span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}
