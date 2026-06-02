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
