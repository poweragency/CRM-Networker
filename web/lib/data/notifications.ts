import 'server-only';
import { getClient, getOwnerContext } from '@/lib/data/crm-shared';
import { logError } from '@/lib/log';
import type { AppNotification, NotificationType } from '@/lib/types/db';
import { listUpcomingBirthdays } from '@/lib/data/team';

/**
 * Notifications data access (server-only). The inbox is reduced to TWO event kinds,
 * both DERIVED at request time (no stored row):
 *   1. `new_member` — someone was recently added to the caller's team;
 *   2. `birthday`   — a team member's birthday is TODAY.
 * Both are scoped to the caller's STRICT downline via the closure table (the caller
 * is an upline of everyone in it), so crossline/downline never receive them, even
 * for org admins.
 *
 * Because they're derived, their read/dismiss state is persisted by STABLE KEY in
 * `notification_state` (per recipient) so the inbox is actually clearable across
 * reloads. Never throws.
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

/** Surface a newly-added team member for this many days after they joined. */
const NEW_MEMBER_WINDOW_DAYS = 7;

/** Local YYYY-MM-DD (stable per day) — used to key today's birthday occurrence. */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * The caller's STRICT descendant marketer ids (closure depth >= 1) — the people the
 * caller is an upline of. Empty in pure demo mode (no env).
 */
async function descendantIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const supabase = getClient();
  if (!supabase) return ids;
  try {
    const { marketerId } = await getOwnerContext();
    if (!marketerId) return ids;
    const { data } = await supabase
      .from('marketer_tree_closure')
      .select('descendant_id')
      .eq('ancestor_id', marketerId)
      .gte('depth', 1);
    for (const r of (data ?? []) as { descendant_id: string }[]) {
      ids.add(r.descendant_id);
    }
  } catch {
    /* best-effort: no team → no notifications */
  }
  return ids;
}

/** Birthday notifications — ONLY today's, ONLY for the caller's downline. */
async function birthdayNotifications(
  now: Date,
  team: Set<string>,
): Promise<AppNotification[]> {
  if (team.size === 0) return [];
  try {
    const { data } = await listUpcomingBirthdays(0, now); // 0 days = today only
    const createdAt = now.toISOString();
    const dk = localDateKey(now);
    return data
      .filter((b) => b.daysUntil === 0 && team.has(b.id))
      .map((b) => ({
        // Per-day key so dismissing today's birthday doesn't suppress next year's.
        id: `bday-${b.id}-${dk}`,
        type: 'birthday' as NotificationType,
        title_it: `🎂 Oggi è il compleanno di ${b.display_name}!`,
        body_it: 'Un membro del tuo team compie gli anni oggi. Fagli gli auguri!',
        payload: { marketer_id: b.id },
        read_at: null,
        created_at: createdAt,
        deleted_at: null,
      }));
  } catch {
    return [];
  }
}

/** New-member notifications — people recently added to the caller's downline. */
async function newMemberNotifications(
  now: Date,
  team: Set<string>,
): Promise<AppNotification[]> {
  const supabase = getClient();
  if (!supabase || team.size === 0) return [];
  try {
    const cutoff = new Date(
      now.getTime() - NEW_MEMBER_WINDOW_DAYS * 86_400_000,
    ).toISOString();
    const { data } = await supabase
      .from('marketers')
      .select('id,display_name,first_name,last_name,created_at')
      .in('id', Array.from(team))
      .is('deleted_at', null)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false });
    return ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const name =
        (r.display_name as string | null) ??
        `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim();
      return {
        id: `newmember-${String(r.id)}`,
        type: 'new_member' as NotificationType,
        title_it: `👥 Nuovo membro nel team: ${name}`,
        body_it: 'Una nuova persona è entrata a far parte del tuo team.',
        payload: { marketer_id: String(r.id) },
        read_at: null,
        created_at: String(r.created_at),
        deleted_at: null,
      };
    });
  } catch {
    return [];
  }
}

/** The caller's active notifications, with persisted read/dismiss state applied. */
export async function listNotifications(
  limit = 50,
): Promise<NotificationsResult> {
  const supabase = getClient();
  if (!supabase) return { data: [], unread: 0, demo: true };

  const now = new Date();
  const team = await descendantIds();
  const [birthdays, newMembers] = await Promise.all([
    birthdayNotifications(now, team),
    newMemberNotifications(now, team),
  ]);
  let data = [...newMembers, ...birthdays];

  // Apply persisted state: drop dismissed, stamp read_at from notification_state.
  try {
    if (data.length > 0) {
      const { marketerId } = await getOwnerContext();
      if (marketerId) {
        const { data: states } = await supabase
          .from('notification_state')
          .select('notif_key, read_at, dismissed_at')
          .eq('recipient_marketer_id', marketerId)
          .in('notif_key', data.map((n) => n.id));
        const byKey = new Map<string, { read_at: string | null; dismissed_at: string | null }>();
        for (const s of (states ?? []) as Record<string, unknown>[]) {
          byKey.set(String(s.notif_key), {
            read_at: (s.read_at as string | null) ?? null,
            dismissed_at: (s.dismissed_at as string | null) ?? null,
          });
        }
        data = data
          .filter((n) => !byKey.get(n.id)?.dismissed_at)
          .map((n) => {
            const st = byKey.get(n.id);
            return st?.read_at ? { ...n, read_at: st.read_at } : n;
          });
      }
    }
  } catch (e) {
    logError('listNotifications.state', e);
  }

  data = data
    .sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0))
    .slice(0, limit);
  return { data, unread: activeUnread(data), demo: false };
}

/** Upsert read/dismiss state for the caller on the given notification keys. */
async function upsertState(
  patch: { read_at?: string; dismissed_at?: string },
  keys: string[],
): Promise<NotificationMutationResult> {
  const supabase = getClient();
  if (!supabase) return { demo: true, ok: true };
  if (keys.length === 0) return { demo: false, ok: true };
  try {
    const { orgId, marketerId } = await getOwnerContext();
    if (!orgId || !marketerId) return { demo: false, ok: false };
    const rows = keys.map((k) => ({
      org_id: orgId,
      recipient_marketer_id: marketerId,
      notif_key: k,
      ...patch,
    }));
    const { error } = await supabase
      .from('notification_state')
      .upsert(rows, { onConflict: 'recipient_marketer_id,notif_key' });
    if (error) {
      logError('notificationState.upsert', error);
      return { demo: false, ok: false };
    }
    return { demo: false, ok: true };
  } catch (e) {
    logError('notificationState.upsert', e);
    return { demo: false, ok: false };
  }
}

/** Mark a single notification read (persisted by key). */
export async function markNotificationRead(
  id: string,
): Promise<NotificationMutationResult> {
  return upsertState({ read_at: new Date().toISOString() }, [id]);
}

/** Mark the given notifications read (the caller's current set). */
export async function markAllNotificationsRead(
  keys: string[] = [],
): Promise<NotificationMutationResult> {
  return upsertState({ read_at: new Date().toISOString() }, keys);
}

/** Dismiss (hide) a notification for the caller (persisted by key). */
export async function dismissNotification(
  id: string,
): Promise<NotificationMutationResult> {
  return upsertState({ dismissed_at: new Date().toISOString() }, [id]);
}
