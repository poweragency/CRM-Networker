'use server';

import {
  updateOrgSettings,
  type UpdateOrgSettingsInput,
  type UpdateOrgSettingsResult,
} from '@/lib/data/admin';

/**
 * Server Action backing /admin/impostazioni-org. Delegates to the demo-safe data
 * layer (real UPDATE on `organizations` when configured, simulated otherwise).
 */
export async function updateOrgSettingsAction(
  input: UpdateOrgSettingsInput,
): Promise<UpdateOrgSettingsResult> {
  return updateOrgSettings(input);
}
