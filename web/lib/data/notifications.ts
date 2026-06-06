import 'server-only';
import { getClient } from '@/lib/data/crm-shared';
import { getOwnerContext } from '@/lib/data/crm-shared';
import type { AppNotification, NotificationType } from '@/lib/types/db';
import { listUpcomingBirthdays } from '@/lib/data/team';

/**
 * Notifications data access (server-only). The inbox is intentionally reduced to
 * just TWO event kinds, both DERIVED at request time (never stored), so they're
 * always fresh and impossible to spam:
 *   1. `new_member` — someone was recently added to the caller's team;
 *   2. `birthday`   — a team member's birthday is TODAY.
 * Both are scoped to the caller's STRICT downline via the closure table: the
 * caller is, by definition, an upline of everyone in it — so crossline and
 * downline never receive these, and the rule holds even for org admins (whose
 * RLS visibility would otherwise span the whole org). Never throws.
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

/**
 * The caller's STRICT descendant marketer ids (closure depth >= 1) — i.e. the
 * people the caller is an upline of. Closure rows only exist for real
 * ancestor→descendant pairs, so this excludes self, crossline and uplines for
 * everyone, admins included. Empty in pure demo mode (no env).
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
    return data
      .filter((b) => b.daysUntil === 0 && team.has(b.id))
      .map((b) => ({
        id: `bday-${b.id}`,
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

/** The caller's active notifications (new member + today's birthdays), newest first. */
export async function listNotifications(
  limit = 50,
): Promise<NotificationsResult> {
  const now = new Date();
  const supabase = getClient();
  const team = await descendantIds();
  const [birthdays, newMembers] = await Promise.all([
    birthdayNotifications(now, team),
    newMemberNotifications(now, team),
  ]);
  const data = [...newMembers, ...birthdays]
    .sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    )
    .slice(0, limit);
  return { data, unread: activeUnread(data), demo: !supabase };
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
