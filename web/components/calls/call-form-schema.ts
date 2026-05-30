import { z } from 'zod';
import type { Resolver } from 'react-hook-form';
import {
  CALL_OUTCOME_ORDER,
  CALL_TYPE_ORDER,
  type CallType,
  type CallOutcome,
} from '@/lib/types/db';
import type { CallInput } from '@/lib/data/calls';

/**
 * Zod schema + a hand-rolled react-hook-form resolver for the "Registra chiamata"
 * form. Same approach as the contact form: a local resolver (no
 * @hookform/resolvers dependency) keeps full zod validation with zero new
 * packages. Duration is captured in MINUTES (friendlier) and converted to the
 * `duration_secs` the data layer expects by {@link toCallInput}.
 */

const typeValues = CALL_TYPE_ORDER as readonly [string, ...string[]];
const outcomeValues = CALL_OUTCOME_ORDER as readonly [string, ...string[]];

const emptyToUndef = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

export const callFormSchema = z.object({
  call_type: z.enum(typeValues, {
    required_error: 'Seleziona il tipo di chiamata.',
  }),
  outcome: z.enum(outcomeValues, {
    required_error: 'Seleziona l’esito della chiamata.',
  }),
  /** Duration in minutes (string from the number input); 0..600. */
  duration_minutes: z.preprocess(
    emptyToUndef,
    z.coerce
      .number({ invalid_type_error: 'Inserisci una durata valida (in minuti).' })
      .min(0, 'La durata non può essere negativa.')
      .max(600, 'Massimo 600 minuti.')
      .optional(),
  ),
  /** datetime-local string ("YYYY-MM-DDTHH:mm"). */
  occurred_at: z
    .string()
    .min(1, 'Inserisci una data valida.')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), {
      message: 'Inserisci una data valida.',
    }),
  /** Optional linked prospect id (from the searchable picker). */
  prospect_id: z.preprocess(emptyToUndef, z.string().optional()),
  notes: z.preprocess(
    emptyToUndef,
    z.string().trim().max(2000, 'Massimo 2000 caratteri.').optional(),
  ),
});

export type CallFormValues = z.infer<typeof callFormSchema>;

/** Minimal zod resolver for react-hook-form (mirrors the contact form). */
export const zodCallResolver: Resolver<CallFormValues> = async (values) => {
  const result = callFormSchema.safeParse(values);
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

/** Current local time as the value an <input type="datetime-local"> expects. */
export function nowLocalInput(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

/** datetime-local string → ISO (UTC) string. */
function localInputToIso(local: string): string {
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

/** Blank defaults for the create form (type/outcome default to the first value). */
export function toFormValues(): CallFormValues {
  return {
    call_type: CALL_TYPE_ORDER[0],
    outcome: CALL_OUTCOME_ORDER[0],
    duration_minutes: undefined,
    occurred_at: nowLocalInput(),
    prospect_id: undefined,
    notes: undefined,
  };
}

/** Normalize validated form values into the data-layer CallInput shape. */
export function toCallInput(values: CallFormValues): CallInput {
  const mins = values.duration_minutes ?? 0;
  return {
    call_type: values.call_type as CallType,
    outcome: values.outcome as CallOutcome,
    duration_secs: Math.round(mins * 60),
    occurred_at: localInputToIso(values.occurred_at),
    prospect_id: values.prospect_id || null,
    notes: values.notes?.trim() || null,
  };
}
