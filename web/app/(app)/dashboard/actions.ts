'use server';

import { getCycleTeamReport, type CycleTeamReport } from '@/lib/data/reports';

/**
 * Fetch the end-of-cycle team aggregates for a given cycle (RLS-scoped). Called on
 * demand from the dashboard's "Scarica report ciclo" button so the data is only
 * loaded when a report is actually generated.
 */
export async function fetchCycleReportAction(cycleNumber: number): Promise<CycleTeamReport> {
  return getCycleTeamReport(cycleNumber);
}
