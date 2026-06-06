'use server';

import { revalidatePath } from 'next/cache';
import {
  changeStage,
  createProspect,
  deleteProspect,
  type ChangeStageResult,
  type ProspectInput,
} from '@/lib/data/prospects';
import {
  setProspectExtra,
  type ProspectExtra,
  type SaveProspectExtraResult,
} from '@/lib/data/prospect-extras';
import type { MutationResult } from '@/lib/data/crm-shared';
import type { Prospect, ProspectStage } from '@/lib/types/db';

/**
 * Server actions for /percorso-prospect. Thin wrappers over the server-only data
 * layer (Supabase-then-MOCK, never throws). The board calls these from the
 * client: a real Supabase write when configured, a SIMULATED success in demo
 * mode — the returned `demo` / `ok` flags let the UI surface the right toast and
 * roll back the optimistic move when a configured write actually fails.
 */

/** Move a prospect to a new stage (transactional `change_prospect_stage` RPC). */
export async function changeStageAction(
  prospectId: string,
  toStage: ProspectStage,
  notes?: string,
): Promise<MutationResult<ChangeStageResult>> {
  const res = await changeStage(prospectId, toStage, notes);
  // Only refresh the server cache when a real write landed; demo stays optimistic.
  if (res.ok && !res.demo) {
    revalidatePath('/percorso-prospect');
    revalidatePath(`/percorso-prospect/${prospectId}`);
  }
  return res;
}

/** Create a new prospect (entry event auto-stamped / simulated). */
export async function createProspectAction(
  input: ProspectInput,
): Promise<MutationResult<Prospect>> {
  const res = await createProspect(input);
  if (res.ok && !res.demo) {
    revalidatePath('/percorso-prospect');
  }
  return res;
}

/** Soft-delete a prospect (removed from the board; demo-safe, RLS-enforced). */
export async function deleteProspectAction(
  prospectId: string,
): Promise<MutationResult<{ id: string }>> {
  return deleteProspect(prospectId);
}

/** Save the prospect's extra fields (profilazione, pacchetto, note). */
export async function saveProspectExtraAction(
  prospectId: string,
  extra: ProspectExtra,
): Promise<SaveProspectExtraResult> {
  return setProspectExtra(prospectId, extra);
}
