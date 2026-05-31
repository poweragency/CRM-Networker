import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listNotifications } from '@/lib/data/notifications';
import { ConfigNotice } from '@/components/config-notice';
import { PageHeader } from '@/components/crm/page-header';
import { NotificationsManager } from '@/components/notifications';

/**
 * /notifiche — the in-app notification inbox (doc 01 §6.7, build seq §10). RSC
 * shell that reads the caller's notifications through the demo-safe data layer
 * (mock fallback when env is missing OR a query fails) and hands them to the
 * client manager for filtering / mark-read / dismiss via demo-safe Server
 * Actions. Realtime subscription is a follow-up; initial load is server-rendered.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('notifiche');
  return { title: t('title') };
}

export default async function NotifichePage() {
  const t = await getTranslations('notifiche');
  const { data, unread, demo } = await listNotifications();

  const subtitle =
    unread > 0 ? `${t('subtitle')} · ${t('unread_count', { count: unread })}` : t('subtitle');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={subtitle} />
      {demo && <ConfigNotice variant="inline" />}
      <NotificationsManager initial={data} initialDemo={demo} />
    </div>
  );
}
