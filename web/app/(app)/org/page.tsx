import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';
import { getCurrentClaims } from '@/lib/data/session';
import { listOrgRoles } from '@/lib/data/roles';
import { listManageableCalls } from '@/lib/data/zoom-calls';
import { ConfigNotice } from '@/components/config-notice';
import { RolesSettings } from '@/components/team/roles-settings';
import { CallsSettings } from '@/components/team/calls-settings';

/**
 * /org — organization settings, reachable from the top-right account menu and
 * available ONLY to admin/owner and co-admin. Admins manage Call (org/team) and
 * Ruoli (nomina co-admin); co-admins see just the Call card (team calls for their
 * downline). Everyone else is bounced to /dashboard.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('org_settings');
  return { title: t('title') };
}

export default async function OrgSettingsPage() {
  const t = await getTranslations('org_settings');

  const { claims, demo } = await getCurrentClaims();
  const isAdmin = claims.role === 'admin' || claims.role === 'owner';
  const isCoAdmin = claims.role === 'co_admin';
  if (!isAdmin && !isCoAdmin) redirect('/dashboard');

  const orgRoles = isAdmin ? (await listOrgRoles()).data : [];
  const calls = (await listManageableCalls()).data;

  return (
    <div className="animate-fade-in space-y-6">
      {demo && <ConfigNotice variant="inline" />}

      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" aria-hidden />
        </span>
        <div className="space-y-0.5">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {t('title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <CallsSettings
        initial={calls}
        isAdmin={isAdmin}
        selfMarketerId={claims.marketer_id}
      />
      {isAdmin && <RolesSettings initial={orgRoles} />}
    </div>
  );
}
