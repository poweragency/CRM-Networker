import { describe, it, expect } from 'vitest';
import { kpisFromStages } from '@/lib/prospect-kpis';
import type { ProspectStage } from '@/lib/types/db';

describe('kpisFromStages', () => {
  it('returns zeros for an empty list', () => {
    const k = kpisFromStages([]);
    expect(k.prospects).toBe(0);
    expect(k.businessInfoReached).toBe(0);
    expect(k.iscrizioni).toBe(0);
    expect(k.conversionRate).toBe(0);
  });

  it('counts business-info-reached off the current stage (linear funnel)', () => {
    const stages: ProspectStage[] = ['conoscitiva', 'business_info', 'iscrizione'];
    const k = kpisFromStages(stages);
    expect(k.prospects).toBe(3);
    // business_info + iscrizione reached business info; conoscitiva did not.
    expect(k.businessInfoReached).toBe(2);
    expect(k.iscrizioni).toBe(1);
    expect(k.conversionRate).toBeCloseTo(0.5);
  });

  it('conversion = iscritti / business-info-reached', () => {
    const stages: ProspectStage[] = ['business_info', 'closing', 'iscrizione', 'iscrizione'];
    const k = kpisFromStages(stages);
    expect(k.businessInfoReached).toBe(4);
    expect(k.iscrizioni).toBe(2);
    expect(k.conversionRate).toBeCloseTo(0.5);
  });
});
