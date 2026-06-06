'use server';

import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationMutationResult,
} from '@/lib/data/notifications';

/**
 * Server Actions backing the /notifiche inbox. Each delegates to the server-only
 * data layer (`lib/data/notifications.ts`), which is demo-safe: it returns a
 * SIMULATED success with `demo: true` when Supabase env is missing OR the write
 * throws, and never crashes (RESILIENCE). The client updates local state
 * optimistically and uses the `demo` flag to pick the right toast.
 */

export async function markReadAction(
  id: string,
): Promise<NotificationMutationResult> {
  return markNotificationRead(id);
}

export async function markAllReadAction(
  keys: string[] = [],
): Promise<NotificationMutationResult> {
  return markAllNotificationsRead(keys);
}

export async function dismissAction(
  id: string,
): Promise<NotificationMutationResult> {
  return dismissNotification(id);
}
