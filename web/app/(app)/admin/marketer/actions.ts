'use server';

import {
  createMarketer,
  type CreateMarketerInput,
  type CreateMarketerResult,
} from '@/lib/data/admin';

/**
 * Server Action backing /admin/marketer/nuovo. Delegates to the server-only data
 * layer (`place_marketer`, ADR-001 operator-driven placement), which is
 * demo-safe: it returns a simulated id when env is missing OR the call throws
 * (RESILIENCE). The client uses the envelope to toast + redirect.
 */
export async function createMarketerAction(
  input: CreateMarketerInput,
): Promise<CreateMarketerResult> {
  return createMarketer(input);
}
