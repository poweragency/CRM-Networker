import { z } from 'zod';
import type { Resolver } from 'react-hook-form';
import type { ListaContattiEntry } from '@/lib/types/db';
import type { ListaContattiInput } from '@/lib/data/lista-contatti';

/**
 * Zod schema + a hand-rolled react-hook-form resolver for the Lista contatti create/edit
 * form. We use a local resolver (instead of @hookform/resolvers, which is not a
 * project dependency) so the form keeps full zod validation with zero new
 * packages — same pattern as the contacts form. Optional fields are lenient:
 * empty strings normalize to null at submit time via {@link toListaContattiInput}.
 */

/** Empty string → undefined (so optional checks don't fire on ""). */
const emptyToUndef = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

export const listaContattiFormSchema = z.object({
  full_name: z
    .string({ required_error: 'Il nome è obbligatorio.' })
    .trim()
    .min(1, 'Il nome è obbligatorio.')
    .max(120, 'Massimo 120 caratteri.'),
  relationship: z.preprocess(
    emptyToUndef,
    z.string().trim().max(600, 'Massimo 600 caratteri.').optional(),
  ),
  /** Warmth — '' means "non impostato" → null at submit. */
  rapporto: z
    .enum(['caldo', 'tiepido', 'freddo'])
    .or(z.literal(''))
    .default(''),
  /** Funnel status — always set (defaults to "non invitato"). */
  stato: z
    .enum(['non_invitato', 'invitato', 'iscritto', 'non_iscritto'])
    .default('non_invitato'),
  notes: z.preprocess(
    emptyToUndef,
    z.string().trim().max(2000, 'Massimo 2000 caratteri.').optional(),
  ),
});

export type ListaContattiFormValues = z.infer<typeof listaContattiFormSchema>;

/**
 * Minimal zod resolver for react-hook-form (replaces @hookform/resolvers/zod).
 * Maps zod issues onto RHF's `errors` shape and returns parsed values.
 */
export const zodListaContattiResolver: Resolver<ListaContattiFormValues> = async (values) => {
  const result = listaContattiFormSchema.safeParse(values);
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
export function toFormValues(entry?: ListaContattiEntry | null): ListaContattiFormValues {
  return {
    full_name: entry?.full_name ?? '',
    relationship: entry?.relationship ?? '',
    rapporto: entry?.rapporto ?? '',
    stato: entry?.stato ?? 'non_invitato',
    notes: entry?.notes ?? '',
  };
}

/** Normalize validated form values into the data-layer ListaContattiInput shape. */
export function toListaContattiInput(values: ListaContattiFormValues): ListaContattiInput {
  return {
    full_name: values.full_name.trim(),
    relationship: values.relationship?.trim() || null,
    rapporto: values.rapporto ? values.rapporto : null,
    stato: values.stato,
    notes: values.notes?.trim() || null,
  };
}
