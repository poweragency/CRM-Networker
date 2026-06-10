import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { getInvitation } from '@/lib/data/invitation';
import { AuthCard } from '../../_components/auth-card';
import { InviteForm } from './invite-form';

// Reads cookies / Supabase at request time → must be dynamic (no prerender).
export const dynamic = 'force-dynamic';

/**
 * /invito/[token] — accept-invitation / activation landing (ADR-008, doc 09).
 *
 * Server component: resolves the invited *profile* context (the action targets
 * an EXISTING marketer profile — profile != account) so the user can confirm
 * who they're activating, then hands off to a client form that sets a password
 * and runs the activation flow. Invalid/expired tokens get a clear dead-end;
 * missing env degrades to a demo context (RESILIENCE).
 */
export default async function InvitePage(props: {
  params: Promise<{ token: string }>;
}) {
  const params = await props.params;
  const { context, demo } = await getInvitation(params.token);

  if (!context) {
    const t = await getTranslations('auth');
    return (
      <AuthCard
        title={t('inviteInvalidTitle')}
        subtitle={t('inviteInvalidBody')}
        icon={AlertCircle}
        tone="danger"
        footer={
          <Link
            href="/accedi"
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t('backToLogin')}
          </Link>
        }
      >
        <p className="text-center text-sm text-muted-foreground">
          {t('inviteInvalidBody')}
        </p>
      </AuthCard>
    );
  }

  return <InviteForm token={params.token} demo={demo} context={context} />;
}
