import 'server-only';
import { getClient } from '@/lib/data/crm-shared';
import { getOwnerContext } from '@/lib/data/crm-shared';
import type { AppNotification, NotificationType } from '@/lib/types/db';
import { mockNotifications } from '@/lib/data/mock/notifications';
import { listUpcomingBirthdays, type UpcomingBirthday } from '@/lib/data/team';

/**
 * Notifications data access (server-only). Reads the caller's in-app inbox
 * (`notifications`, doc 01 §6.7 — RLS keeps it strictly self) and exposes the
 * mark-read / dismiss mutations. Every call attempts Supabase and FALLS BACK to
 * the demo inbox / a SIMULATED success when env is missing OR the call throws
 * (RESILIENCE). Mutations never throw; the `demo` flag tells the UI whether the
 * change was persisted or simulated.
 */

export interface NotificationsResult {
  data: AppNotification[];
  unread: number;
  demo: boolean;
}

export interface NotificationMutationResult {
  demo: boolean;
  ok: boolean;
}

function activeUnread(rows: AppNotification[]): number {
  return rows.filter((n) => !n.read_at && !n.deleted_at).length;
}

/** How far ahead to surface a team member's birthday. */
const BIRTHDAY_WINDOW_DAYS = 7;

function birthdayTitle(b: UpcomingBirthday): string {
  if (b.daysUntil === 0) return `🎂 Oggi è il compleanno di ${b.display_name}!`;
  if (b.daysUntil === 1) return `🎂 Domani è il compleanno di ${b.display_name}`;
  return `🎂 Tra ${b.daysUntil} giorni è il compleanno di ${b.display_name}`;
}

/**
 * Derive birthday notifications for the caller's team (one per member with a
 * birthday in the next {@link BIRTHDAY_WINDOW_DAYS} days, the caller excluded).
 * Computed at request time against the real clock so they stay fresh, and never
 * throws — any failure degrades to no birthday notifications.
 */
async function birthdayNotifications(now: Date): Promise<AppNotification[]> {
  try {
    let selfId = '';
    try {
      selfId = (await getOwnerContext()).marketerId;
    } catch {
      selfId = '';
    }
    const { data } = await listUpcomingBirthdays(BIRTHDAY_WINDOW_DAYS, now);
    const createdAt = now.toISOString();
    return data
      .filter((b) => b.id !== selfId)
      .map((b) => ({
        id: `bday-${b.id}`,
        type: 'birthday' as NotificationType,
        title_it: birthdayTitle(b),
        body_it:
          b.daysUntil === 0
            ? 'Un membro del tuo team compie gli anni oggi. Fagli gli auguri!'
            : 'Preparati a fare gli auguri a un membro del tuo team.',
        payload: { marketer_id: b.id },
        read_at: null,
        created_at: createdAt,
        deleted_at: null,
      }));
  } catch {
    return [];
  }
}

/** Merge generated + stored notifications, drop dismissed, newest first. */
function mergeSorted(
  generated: AppNotification[],
  stored: AppNotification[],
): AppNotification[] {
  return [...generated, ...stored]
    .filter((n) => !n.deleted_at)
    .sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    );
}

/** The caller's active (non-dismissed) notifications, newest first. */
export async function listNotifications(
  limit = 50,
): Promise<NotificationsResult> {
  const birthdays = await birthdayNotifications(new Date());
  const supabase = getClient();
  if (!supabase) {
    const data = mergeSorted(birthdays, mockNotifications());
    return { data, unread: activeUnread(data), demo: true };
  }
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id,type,title_it,body_it,payload,read_at,created_at,deleted_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !data) {
      const fallback = mergeSorted(birthdays, mockNotifications());
      return { data: fallback, unread: activeUnread(fallback), demo: true };
    }

    const rows: AppNotification[] = (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      type: r.type as NotificationType,
      title_it: String(r.title_it),
      body_it: (r.body_it as string | null) ?? null,
      payload: (r.payload as Record<string, unknown>) ?? {},
      read_at: (r.read_at as string | null) ?? null,
      created_at: String(r.created_at),
      deleted_at: (r.deleted_at as string | null) ?? null,
    }));
    const merged = mergeSorted(birthdays, rows);
    return { data: merged, unread: activeUnread(merged), demo: false };
  } catch {
    const fallback = mergeSorted(birthdays, mockNotifications());
    return { data: fallback, unread: activeUnread(fallback), demo: true };
  }
}

/** Mark a single notification read. */
export async function markNotificationRead(
  id: string,
): Promise<NotificationMutationResult> {
  const supabase = getClient();
  if (!supabase) return { demo: true, ok: true };
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .is('read_at', null);
    return { demo: false, ok: !error };
  } catch {
    return { demo: true, ok: true };
  }
}

/** Mark all of the caller's unread notifications read. */
export async function markAllNotificationsRead(): Promise<NotificationMutationResult> {
  const supabase = getClient();
  if (!supabase) return { demo: true, ok: true };
  try {
    const { orgId } = await getOwnerContext();
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .is('read_at', null);
    return { demo: false, ok: !error };
  } catch {
    return { demo: true, ok: true };
  }
}

/** Dismiss (soft-delete) a notification. */
export async function dismissNotification(
  id: string,
): Promise<NotificationMutationResult> {
  const supabase = getClient();
  if (!supabase) return { demo: true, ok: true };
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    return { demo: false, ok: !error };
  } catch {
    return { demo: true, ok: true };
  }
}
