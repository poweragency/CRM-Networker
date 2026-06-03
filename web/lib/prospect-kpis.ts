import { STAGE_ORDER, type ProspectStage } from '@/lib/types/db';

/**
 * Pure, client-safe funnel-KPI math (no 'server-only' — imported by both the
 * server data layer and the interactive performance widget). Conversion is the
 * share of prospects that reached Business Info and went on to enroll
 * (iscritti ÷ business info), i.e. "di quelli che hanno visto il business,
 * quanti si sono iscritti".
 */

export interface ProspectKpis {
  /** Prospects in the (already-scoped) set. */
  prospects: number;
  /** How many reached the Business Info stage (or beyond). */
  businessInfoReached: number;
  /** Enrollments (iscrizioni). */
  iscrizioni: number;
  /** 0..1 — share of Business-Info prospects that enrolled. */
  conversionRate: number;
}

const BUSINESS_INFO_INDEX = STAGE_ORDER.indexOf('business_info');

/** Compute the KPIs from a flat list of current stages. */
export function kpisFromStages(stages: ProspectStage[]): ProspectKpis {
  let businessInfoReached = 0;
  let iscrizioni = 0;
  for (const stage of stages) {
    const idx = STAGE_ORDER.indexOf(stage);
    if (idx >= BUSINESS_INFO_INDEX) businessInfoReached += 1;
    if (stage === 'iscrizione') iscrizioni += 1;
  }
  return {
    prospects: stages.length,
    businessInfoReached,
    iscrizioni,
    conversionRate:
      businessInfoReached > 0 ? iscrizioni / businessInfoReached : 0,
  };
}

/** A single funnel-step conversion: of `from` that reached a stage, `to` advanced. */
export interface PhaseConversion {
  /** How many reached the source stage (or beyond) — the denominator. */
  from: number;
  /** How many reached the next stage (or beyond) — the numerator. */
  to: number;
  /** 0..1 — `to ÷ from` (0 when `from` is 0). */
  rate: number;
}

export interface FunnelPhaseConversions {
  /** Business Info → Follow-up. */
  biToFup: PhaseConversion;
  /** Follow-up → Closing. */
  fupToClosing: PhaseConversion;
  /** Closing → Iscrizione. */
  closingToIscrizione: PhaseConversion;
}

/** How many of the given current-stages reached `stage` (or any later stage). */
function reachedCount(stages: ProspectStage[], stage: ProspectStage): number {
  const idx = STAGE_ORDER.indexOf(stage);
  return stages.reduce(
    (n, s) => (STAGE_ORDER.indexOf(s) >= idx ? n + 1 : n),
    0,
  );
}

/**
 * Per-phase conversion rates from a flat list of current stages. "Reached" is
 * read off the current stage (linear funnel): a prospect at `closing` has passed
 * Business Info and Follow-up. Same projection as {@link kpisFromStages}.
 */
export function phaseConversionsFromStages(
  stages: ProspectStage[],
): FunnelPhaseConversions {
  const bi = reachedCount(stages, 'business_info');
  const fup = reachedCount(stages, 'follow_up');
  const cl = reachedCount(stages, 'closing');
  const isc = reachedCount(stages, 'iscrizione');
  const mk = (from: number, to: number): PhaseConversion => ({
    from,
    to,
    rate: from > 0 ? to / from : 0,
  });
  return {
    biToFup: mk(bi, fup),
    fupToClosing: mk(fup, cl),
    closingToIscrizione: mk(cl, isc),
  };
}
