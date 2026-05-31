'use server';

import { updateMarketerExtra } from '@/lib/data/team';
import type { MarketerExtra } from '@/lib/types/db';

/**
 * Server Action backing the /team/[id] anagrafica editor. Delegates to the
 * server-only data layer (`lib/data/team.ts`), which is demo-safe and mock-backed
 * for now (frontend + mock only — no DB columns yet), so it never throws and
 * returns a small serializable envelope the client uses to raise the right toast.
 */
export interface SaveAnagraficaResult {
  ok: boolean;
  demo: boolean;
}

export async function saveMarketerAnagrafica(
  id: string,
  patch: Partial<MarketerExtra>,
): Promise<SaveAnagraficaResult> {
  return updateMarketerExtra(id, patch);
}
