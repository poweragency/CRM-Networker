import { z } from 'zod';
import type { Resolver } from 'react-hook-form';
import {
  CONTACT_SOURCE_ORDER,
  CONTACT_STATUS_ORDER,
  type Contact,
} from '@/lib/types/db';

/**
 * Zod schema + a hand-rolled react-hook-form resolver for the contact create/
 * edit form. We use a local resolver (instead of @hookform/resolvers, which is
 * not a project dependency) so the form keeps full zod validation with zero new
 * packages. The schema is intentionally lenient on optional fields — empty
 * strings are normalized to null at submit time by {@link toContactInput}.
 */

const statusValues = CONTACT_STATUS_ORDER as readonly [string, ...string[]];
const sourceValues = CONTACT_SOURCE_ORDER as readonly [string, ...string[]];

/** Empty string → undefined (so optional + url/email checks don't fire on ""). */
const emptyToUndef = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

export const contactFormSchema = z.object({
  first_name: z
    .string({ required_error: 'Il nome è obbligatorio.' })
    .trim()
    .min(1, 'Il nome è obbligatorio.')
    .max(80, 'Massimo 80 caratteri.'),
  last_name: z.preprocess(
    emptyToUndef,
    z.string().trim().max(80, 'Massimo 80 caratteri.').optional(),
  ),
  email: z.preprocess(
    emptyToUndef,
    z.string().trim().email('Email non valida.').optional(),
  ),
  phone: z.preprocess(
    emptyToUndef,
    z.string().trim().max(40, 'Massimo 40 caratteri.').optional(),
  ),
  city: z.preprocess(
    emptyToUndef,
    z.string().trim().max(80, 'Massimo 80 caratteri.').optional(),
  ),
  status: z.enum(statusValues),
  source: z.enum(sourceValues),
  tags: z.array(z.string()).default([]),
  /** datetime-local string ("YYYY-MM-DDTHH:mm") or empty. */
  next_follow_up_at: z.preprocess(
    emptyToUndef,
    z.string().optional(),
  ),
  notes: z.preprocess(
    emptyToUndef,
    z.string().trim().max(2000, 'Massimo 2000 caratteri.').optional(),
  ),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

/**
 * Minimal zod resolver for react-hook-form (replaces @hookform/resolvers/zod).
 * Maps zod issues onto RHF's `errors` shape and returns parsed values.
 */
export const zodContactResolver: Resolver<ContactFormValues> = async (
  values,
) => {
  const result = contactFormSchema.safeParse(values);
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

/** ISO timestamp → the value an <input type="datetime-local"> expects. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // Shift to local time then trim seconds/zone for the control.
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 16);
}

/** datetime-local string → ISO (UTC) string, or null when empty. */
export function localInputToIso(local: string | undefined): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Build default form values from an existing contact (or blanks for create). */
export function toFormValues(contact?: Contact | null): ContactFormValues {
  return {
    first_name: contact?.first_name ?? '',
    last_name: contact?.last_name ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    city: contact?.city ?? '',
    status: contact?.status ?? 'nuovo',
    source: contact?.source ?? 'altro',
    tags: contact?.tags ?? [],
    next_follow_up_at: isoToLocalInput(contact?.next_follow_up_at),
    notes: contact?.notes ?? '',
  };
}

/** Normalize validated form values into the data-layer ContactInput shape. */
export function toContactInput(values: ContactFormValues) {
  return {
    first_name: values.first_name.trim(),
    last_name: values.last_name?.trim() || null,
    email: values.email?.trim() || null,
    phone: values.phone?.trim() || null,
    city: values.city?.trim() || null,
    status: values.status as Contact['status'],
    source: values.source as Contact['source'],
    tags: values.tags ?? [],
    next_follow_up_at: localInputToIso(values.next_follow_up_at),
    notes: values.notes?.trim() || null,
  };
}
