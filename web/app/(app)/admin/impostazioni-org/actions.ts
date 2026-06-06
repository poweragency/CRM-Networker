'use server';

import {
  updateOrgSettings,
  type UpdateOrgSettingsInput,
  type UpdateOrgSettingsResult,
} from '@/lib/data/admin';
import { currentIsOrgAdmin } from '@/lib/data/authz';
import type { OrgSettings } from '@/lib/types/db';

/**
 * Server Action backing /admin/impostazioni-org. Delegates to the demo-safe data
 * layer (real UPDATE on `organizations` when configured, simulated otherwise).
 */
export async function updateOrgSettingsAction(
  input: UpdateOrgSettingsInput,
): Promise<UpdateOrgSettingsResult> {
  // Defense-in-depth: re-check admin authority server-side (direct-POST guard).
  if (!(await currentIsOrgAdmin())) {
    return { data: undefined as unknown as OrgSettings, demo: false, ok: false };
  }
  return updateOrgSettings(input);
}
