import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentClaims } from '@/lib/data/session';
import { getOrgTheme } from '@/lib/data/org-theme';
import { listOrgRoles } from '@/lib/data/roles';
import { listManageableCalls } from '@/lib/data/zoom-calls';
import { ConfigNotice } from '@/components/config-notice';
import { ThemeSettings } from '@/components/team/theme-settings';
import { RolesSettings } from '@/components/team/roles-settings';
import { CallsSettings } from '@/components/team/calls-settings';

/**
 * /org — organization settings, reachable from the top-right account menu and
 * available ONLY to admin/owner and co-admin. Admins manage Call (org/team),
 * Ruoli (nomina co-admin) and Tema (colori org); co-admins see just the Call
 * card (team calls for their downline). Everyone else is bounced to /dashboard.
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

  const orgTheme = isAdmin ? await getOrgTheme() : null;
  const orgRoles = isAdmin ? (await listOrgRoles()).data : [];
  const calls = (await listManageableCalls()).data;

  return (
    <div className="space-y-6">
      {demo && <ConfigNotice variant="inline" />}

      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t('title')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <CallsSettings
        initial={calls}
        isAdmin={isAdmin}
        selfMarketerId={claims.marketer_id}
      />
      {isAdmin && <RolesSettings initial={orgRoles} />}
      {isAdmin && <ThemeSettings initial={orgTheme} />}
    </div>
  );
}
