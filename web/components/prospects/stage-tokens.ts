import type { ProspectStage } from '@/lib/types/db';

/**
 * Stage → design-system color token mapping (presentation only).
 *
 * The funnel stage *values* are snake_case (`business_info`) while the fixed
 * Tailwind `stage-*` palette tokens are camelCase (`stage-businessInfo`). This
 * map bridges the two so the kanban surface can paint each phase with its own
 * cool→warm color (accent rail, header chip, soft tints) using ONLY design-system
 * tokens — never a hardcoded color. Keeping it in one place keeps every kanban
 * component perfectly consistent in both light and dark mode.
 */
export interface StageTokens {
  /** solid text color, e.g. `text-stage-conoscitiva` */
  text: string;
  /** solid background, e.g. `bg-stage-conoscitiva` */
  bg: string;
  /** soft tint background (~12%) for chips/tints */
  bgSoft: string;
  /** softer tint (~8%) for surfaces */
  bgFaint: string;
  /** border color */
  border: string;
  /** ring color (used for drop highlight) */
  ring: string;
  /** subtle gradient-from for headers */
  from: string;
}

const TOKENS: Record<ProspectStage, StageTokens> = {
  conoscitiva: {
    text: 'text-stage-conoscitiva',
    bg: 'bg-stage-conoscitiva',
    bgSoft: 'bg-stage-conoscitiva/12',
    bgFaint: 'bg-stage-conoscitiva/[0.07]',
    border: 'border-stage-conoscitiva/30',
    ring: 'ring-stage-conoscitiva/40',
    from: 'from-stage-conoscitiva/10',
  },
  business_info: {
    text: 'text-stage-businessInfo',
    bg: 'bg-stage-businessInfo',
    bgSoft: 'bg-stage-businessInfo/12',
    bgFaint: 'bg-stage-businessInfo/[0.07]',
    border: 'border-stage-businessInfo/30',
    ring: 'ring-stage-businessInfo/40',
    from: 'from-stage-businessInfo/10',
  },
  follow_up: {
    text: 'text-stage-followUp',
    bg: 'bg-stage-followUp',
    bgSoft: 'bg-stage-followUp/12',
    bgFaint: 'bg-stage-followUp/[0.07]',
    border: 'border-stage-followUp/30',
    ring: 'ring-stage-followUp/40',
    from: 'from-stage-followUp/10',
  },
  closing: {
    text: 'text-stage-closing',
    bg: 'bg-stage-closing',
    bgSoft: 'bg-stage-closing/12',
    bgFaint: 'bg-stage-closing/[0.07]',
    border: 'border-stage-closing/30',
    ring: 'ring-stage-closing/40',
    from: 'from-stage-closing/10',
  },
  check_soldi: {
    text: 'text-stage-checkSoldi',
    bg: 'bg-stage-checkSoldi',
    bgSoft: 'bg-stage-checkSoldi/12',
    bgFaint: 'bg-stage-checkSoldi/[0.07]',
    border: 'border-stage-checkSoldi/30',
    ring: 'ring-stage-checkSoldi/40',
    from: 'from-stage-checkSoldi/10',
  },
  iscrizione: {
    text: 'text-stage-iscrizione',
    bg: 'bg-stage-iscrizione',
    bgSoft: 'bg-stage-iscrizione/12',
    bgFaint: 'bg-stage-iscrizione/[0.07]',
    border: 'border-stage-iscrizione/30',
    ring: 'ring-stage-iscrizione/40',
    from: 'from-stage-iscrizione/10',
  },
};

export function stageTokens(stage: ProspectStage): StageTokens {
  return TOKENS[stage];
}
