'use server';

import { enqueueExport, type EnqueueExportInput } from '@/lib/data/reports';
import type { ExportJob } from '@/lib/types/db';

/**
 * Server Action backing the /report export buttons. Delegates to the server-only
 * data layer (`lib/data/reports.ts`), which is demo-safe: it returns an optimistic
 * `queued` job and never throws (RESILIENCE). The client uses the envelope to
 * surface the right toast (real vs "modalità demo").
 */

export interface ExportActionResult {
  job: ExportJob;
  demo: boolean;
  ok: boolean;
}

export async function enqueueExportAction(
  input: EnqueueExportInput,
): Promise<ExportActionResult> {
  const { job, demo, ok } = await enqueueExport(input);
  return { job, demo, ok };
}
