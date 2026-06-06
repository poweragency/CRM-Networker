import { z } from 'zod';
import {
  STAGE_ORDER,
  CONTACT_STATUS_ORDER,
  CALL_TYPE_ORDER,
  CALL_OUTCOME_ORDER,
  LISTA_CONTATTI_RAPPORTO_ORDER,
  LISTA_CONTATTI_STATUS_ORDER,
} from '@/lib/types/db';
import { logWarn } from '@/lib/log';

/**
 * Server-side input validation (audit A11). Server Actions are PUBLIC RPC
 * endpoints: their arguments arrive from an attacker-controllable POST body and
 * TypeScript types are erased at runtime. These zod schemas enforce bounds, enum
 * membership and array caps at the trust boundary.
 *
 * They are deliberately PERMISSIVE so valid input is NEVER rejected: unknown
 * extra keys pass through (`.passthrough()`), optional fields stay optional, and
 * limits are generous. The goal is to stop oversized strings (DB bloat), unbounded
 * bulk-id arrays (DoS) and out-of-enum values — not to re-shape the payload.
 */

const enumOf = (arr: readonly string[]) =>
  z.string().refine((v) => (arr as readonly string[]).includes(v), 'invalid value');

const MAX_NAME = 200;
const MAX_TEXT = 5000;
const MAX_ID = 64;

const optId = z.string().max(MAX_ID).nullish();
const optText = z.string().max(MAX_TEXT).nullish();
const optName = z.string().max(MAX_NAME).nullish();

/** Hard caps on bulk-operation arrays (DoS guard). */
export const MAX_BULK = 1000;
export const idListSchema = z.array(z.string().max(MAX_ID)).max(MAX_BULK);
export const tagListSchema = z.array(z.string().max(60)).max(100);

export const prospectInputSchema = z
  .object({
    full_name: z.string().trim().min(1).max(MAX_NAME),
    contact_id: optId,
    current_stage: enumOf(STAGE_ORDER).optional(),
    notes: optText,
    owner_marketer_id: z.string().max(MAX_ID).optional(),
  })
  .passthrough();

export const contactCreateSchema = z
  .object({
    first_name: z.string().trim().min(1).max(MAX_NAME),
    last_name: optName,
    email: optName,
    phone: optName,
    status: enumOf(CONTACT_STATUS_ORDER).optional(),
    tags: tagListSchema.optional(),
    notes: optText,
  })
  .passthrough();

export const contactPatchSchema = contactCreateSchema.partial();

export const callInputSchema = z
  .object({
    call_type: enumOf(CALL_TYPE_ORDER),
    outcome: enumOf(CALL_OUTCOME_ORDER),
    duration_secs: z.number().min(0).max(86_400).optional(),
    occurred_at: z.string().max(40).optional(),
    prospect_id: optId,
    contact_id: optId,
    notes: optText,
    marketer_id: z.string().max(MAX_ID).optional(),
  })
  .passthrough();

export const listaCreateSchema = z
  .object({
    full_name: z.string().trim().min(1).max(MAX_NAME),
    phone: optName,
    relationship: optText,
    rating: z.number().min(0).max(5).nullish(),
    rapporto: enumOf(LISTA_CONTATTI_RAPPORTO_ORDER).nullish(),
    stato: enumOf(LISTA_CONTATTI_STATUS_ORDER).optional(),
    percorso: z.number().min(0).max(5).optional(),
    position: z.number().min(0).optional(),
    contacted: z.boolean().optional(),
    notes: optText,
  })
  .passthrough();

export const listaPatchSchema = listaCreateSchema.partial();

/** True when `input` satisfies `schema`; logs (does not throw) on rejection. */
export function isValid(schema: z.ZodTypeAny, input: unknown, scope: string): boolean {
  const r = schema.safeParse(input);
  if (!r.success) {
    logWarn(`validation:${scope}`, 'rejected input', {
      issues: r.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), code: i.code })),
    });
  }
  return r.success;
}
