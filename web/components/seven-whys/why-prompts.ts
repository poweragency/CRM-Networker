import { WHY_KEYS, type WhyKey } from '@/lib/types/db';

/**
 * The seven guided "why" slots, in canonical order. Each entry pairs the `why_*`
 * record key with the i18n key of its helper prompt (under the `sette_perche`
 * namespace). The methodology is a LADDER: every why builds on the previous one,
 * digging from the most immediate motivation down to the deepest meaning — the
 * helper prompts are phrased to drive that descent.
 */
export interface WhyStep {
  /** 1..7 position in the ladder. */
  index: number;
  /** The record column this step writes to. */
  key: WhyKey;
  /** i18n key (sette_perche.*) for the guiding helper prompt. */
  helpKey: string;
}

const ORDINALS = [
  'Primo perché',
  'Secondo perché',
  'Terzo perché',
  'Quarto perché',
  'Quinto perché',
  'Sesto perché',
  'Settimo perché',
] as const;

export const WHY_STEPS: readonly WhyStep[] = WHY_KEYS.map((key, i) => ({
  index: i + 1,
  key,
  helpKey: `why_help_${i + 1}`,
})) as readonly WhyStep[];

/** The Italian ordinal label for a 1-based step (no i18n round-trip needed). */
export function whyOrdinal(index: number): string {
  return ORDINALS[index - 1] ?? `Perché ${index}`;
}
