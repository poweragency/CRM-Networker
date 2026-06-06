'use server';

import {
  createMarketer,
  type CreateMarketerInput,
  type CreateMarketerResult,
} from '@/lib/data/admin';
import { currentIsOrgAdmin } from '@/lib/data/authz';

/**
 * Server Action backing /admin/marketer/nuovo. Delegates to the server-only data
 * layer (`place_marketer`, ADR-001 operator-driven placement), which is
 * demo-safe: it returns a simulated id when env is missing OR the call throws
 * (RESILIENCE). The client uses the envelope to toast + redirect.
 */
export async function createMarketerAction(
  input: CreateMarketerInput,
): Promise<CreateMarketerResult> {
  // Defense-in-depth: this action is POST-dispatchable to any route, so re-check
  // admin authority server-side (not just middleware/RLS).
  if (!(await currentIsOrgAdmin())) return { id: null, demo: false, ok: false };
  return createMarketer(input);
}
