'use server';

import { revalidatePath } from 'next/cache';
import {
  createOrgWithOwner,
  setOrgStatus,
  type CreateOrgInput,
  type CreateOrgResult,
} from '@/lib/data/platform';

/** Create an org + owner login + root node (platform super-admin only). */
export async function createOrgAction(input: CreateOrgInput): Promise<CreateOrgResult> {
  const res = await createOrgWithOwner(input);
  if (res.ok) revalidatePath('/organizzazioni');
  return res;
}

/** Suspend (non-renewal) or reactivate an org. Data untouched. */
export async function setOrgStatusAction(
  orgId: string,
  suspend: boolean,
): Promise<{ ok: boolean; error?: 'forbidden' | 'failed' }> {
  const res = await setOrgStatus(orgId, suspend);
  if (res.ok) revalidatePath('/organizzazioni');
  return res;
}
