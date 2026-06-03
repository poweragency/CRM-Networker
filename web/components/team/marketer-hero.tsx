import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { RankBadge } from '@/components/ui/rank-badge';
import { cn } from '@/lib/utils';
import type { TreeNode } from '@/lib/types/db';
import { WhatsAppButton } from '@/components/crm/whatsapp-button';

/**
 * MarketerHero — the profile identity masthead (server component). Back link, a
 * large avatar with status ring, identity (name + "Tu" + rank + renewal/CRM
 * badges) and, to the right of the name, the header actions (the Anagrafica
 * button via the `action` slot + the WhatsApp quick-contact). It stays at the
 * top of the profile, always visible — so the anagrafica is reachable from any
 * tab; the numbers (team structure + personal performance) live in the
 * "Produzione" section via {@link MarketerKpis}.
 */

const STATUS_RING: Record<string, string> = {
  active: 'ring-success/40',
  pending: 'ring-warning/40',
  inactive: 'ring-border',
};

export async function MarketerHero({
  node,
  isSelf,
  crmAccess = false,
  phone = null,
  action = null,
}: {
  node: TreeNode;
  isSelf: boolean;
  /** Whether the marketer has an active CRM account login. */
  crmAccess?: boolean;
  /** Phone number → WhatsApp quick-contact (hidden on the own profile). */
  phone?: string | null;
  /** Header action shown to the right of the name (e.g. the Anagrafica button). */
  action?: ReactNode;
}) {
  const t = await getTranslations('team');

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {/* Top band: back link + identity, on a subtle accent wash */}
      <div className="relative bg-gradient-to-br from-primary/[0.07] to-transparent p-5">
        <Link
          href="/statistiche"
          className="mb-3 inline-flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t('breadcrumb')}
        </Link>

        <div className="flex items-start gap-4">
          <Avatar
            name={node.display_name}
            size="lg"
            className={cn('h-16 w-16 text-lg ring-2 ring-offset-2 ring-offset-card', STATUS_RING[node.status])}
          />
          <div className="min-w-0 flex-1 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">
                {node.display_name}
              </h1>
              {isSelf && (
                <Badge variant="default" className="px-1.5 py-0">
                  {t('you')}
                </Badge>
              )}
              {/* Right-aligned header actions: Anagrafica (action slot) + WhatsApp
                  quick-contact (team members only, never the own profile). */}
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
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <RankBadge rank={node.rank} />
              {/* Renewal (rinnovo) — distinct prefix so it's not confused with CRM. */}
              <Badge variant={node.status === 'active' ? 'success' : 'danger'}>
                {t('renewal_prefix')}:{' '}
                {node.status === 'active' ? t('renewal_active') : t('renewal_inactive')}
              </Badge>
              {/* CRM account access — separate concept, separate badge. */}
              <Badge variant={crmAccess ? 'info' : 'secondary'}>
                {t('account_prefix')}:{' '}
                {crmAccess ? t('account_on') : t('account_off')}
              </Badge>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
