'use server';

import { updateOrgCycle } from '@/lib/data/admin';
import { currentIsOrgAdmin } from '@/lib/data/authz';
import type { OrgSettings } from '@/lib/types/db';

/**
 * Save the company-cycle anchor from the /org settings page. Admin-only
 * (defense-in-depth re-check); delegates to the demo-safe data layer.
 */
export async function updateOrgCycleAction(
  cycle: OrgSettings['cycle'],
): Promise<{ ok: boolean; demo: boolean }> {
  if (!(await currentIsOrgAdmin())) return { ok: false, demo: false };
  return updateOrgCycle(cycle);
}
