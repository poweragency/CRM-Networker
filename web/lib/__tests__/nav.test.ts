import { describe, it, expect } from 'vitest';
import {
  isLimitedViewer,
  visibleNavSections,
  visibleNavFooter,
  type NavViewer,
} from '@/lib/nav';

const limited: NavViewer = { role: 'member', rank: 'cliente', crmAccess: false };
const noRank: NavViewer = { role: 'member', rank: 'no_rank', crmAccess: false };
const consultant: NavViewer = { role: 'member', rank: 'consultant', crmAccess: true };
const coAdmin: NavViewer = { role: 'co_admin', rank: 'cliente', crmAccess: false };
const owner: NavViewer = { role: 'owner', rank: 'vice_president', crmAccess: true };

describe('isLimitedViewer', () => {
  it('limits cliente / no_rank plain members', () => {
    expect(isLimitedViewer(limited)).toBe(true);
    expect(isLimitedViewer(noRank)).toBe(true);
  });

  it('does NOT limit consultant+ rank or co_admin+ role', () => {
    expect(isLimitedViewer(consultant)).toBe(false);
    expect(isLimitedViewer(coAdmin)).toBe(false);
    expect(isLimitedViewer(owner)).toBe(false);
  });
});

describe('visibleNav gating', () => {
  it('limited viewer sees only Profilo + Informativa, no footer', () => {
    const sections = visibleNavSections(limited);
    expect(sections).toHaveLength(1);
    const hrefs = sections.flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/impostazioni');
    expect(hrefs).toContain('/informativa');
    expect(hrefs).not.toContain('/dashboard');
    expect(visibleNavFooter(limited)).toHaveLength(0);
  });

  it('owner sees the full rail', () => {
    const hrefs = visibleNavSections(owner).flatMap((s) => s.items.map((i) => i.href));
    expect(hrefs).toContain('/dashboard');
    expect(hrefs).toContain('/genealogia');
    expect(visibleNavFooter(owner).length).toBeGreaterThan(0);
  });
});
