import { z } from 'zod';
import type { Resolver } from 'react-hook-form';
import type { CentosEntry } from '@/lib/types/db';
import type { CentosInput } from '@/lib/data/centos';

/**
 * Zod schema + a hand-rolled react-hook-form resolver for the Centos create/edit
 * form. We use a local resolver (instead of @hookform/resolvers, which is not a
 * project dependency) so the form keeps full zod validation with zero new
 * packages — same pattern as the contacts form. Optional fields are lenient:
 * empty strings normalize to null at submit time via {@link toCentosInput}.
 */

/** Empty string → undefined (so optional checks don't fire on ""). */
const emptyToUndef = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

export const centosFormSchema = z.object({
  full_name: z
    .string({ required_error: 'Il nome è obbligatorio.' })
    .trim()
    .min(1, 'Il nome è obbligatorio.')
    .max(120, 'Massimo 120 caratteri.'),
  phone: z.preprocess(
    emptyToUndef,
    z.string().trim().max(40, 'Massimo 40 caratteri.').optional(),
  ),
  relationship: z.preprocess(
    emptyToUndef,
    z.string().trim().max(600, 'Massimo 600 caratteri.').optional(),
  ),
  /** 1..5 quality score, or 0 → "no rating". */
  rating: z.coerce.number().int().min(0).max(5).default(0),
  contacted: z.boolean().default(false),
  notes: z.preprocess(
    emptyToUndef,
    z.string().trim().max(2000, 'Massimo 2000 caratteri.').optional(),
  ),
});

export type CentosFormValues = z.infer<typeof centosFormSchema>;

/**
 * Minimal zod resolver for react-hook-form (replaces @hookform/resolvers/zod).
 * Maps zod issues onto RHF's `errors` shape and returns parsed values.
 */
export const zodCentosResolver: Resolver<CentosFormValues> = async (values) => {
  const result = centosFormSchema.safeParse(values);
  if (result.success) {
    return { values: result.data, errors: {} };
  }
  const errors: Record<string, { type: string; message: string }> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!errors[path]) {
      errors[path] = { type: issue.code, message: issue.message };
    }
  }
  return { values: {}, errors: errors as never };
};

/** Build default form values from an existing entry (or blanks for create). */
export function toFormValues(entry?: CentosEntry | null): CentosFormValues {
  return {
    full_name: entry?.full_name ?? '',
    phone: entry?.phone ?? '',
    relationship: entry?.relationship ?? '',
    rating: entry?.rating ?? 0,
    contacted: entry?.contacted ?? false,
    notes: entry?.notes ?? '',
  };
}

/** Normalize validated form values into the data-layer CentosInput shape. */
export function toCentosInput(values: CentosFormValues): CentosInput {
  return {
    full_name: values.full_name.trim(),
    phone: values.phone?.trim() || null,
    relationship: values.relationship?.trim() || null,
    // 0 in the form means "no rating" → store null.
    rating: values.rating && values.rating > 0 ? values.rating : null,
    contacted: values.contacted,
    notes: values.notes?.trim() || null,
  };
}
