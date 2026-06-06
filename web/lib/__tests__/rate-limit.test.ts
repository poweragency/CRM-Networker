import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimit, __resetRateLimit } from '@/lib/rate-limit';

beforeEach(() => __resetRateLimit());

describe('rateLimit', () => {
  it('allows up to the limit, then blocks', () => {
    for (let i = 0; i < 3; i++) expect(rateLimit('k', 3, 60_000).ok).toBe(true);
    expect(rateLimit('k', 3, 60_000).ok).toBe(false);
  });

  it('tracks keys independently', () => {
    expect(rateLimit('a', 1, 60_000).ok).toBe(true);
    expect(rateLimit('a', 1, 60_000).ok).toBe(false);
    expect(rateLimit('b', 1, 60_000).ok).toBe(true);
  });

  it('reports remaining budget', () => {
    expect(rateLimit('c', 5, 60_000).remaining).toBe(4);
  });

  it('resets after the window elapses', async () => {
    expect(rateLimit('d', 1, 10).ok).toBe(true);
    expect(rateLimit('d', 1, 10).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(rateLimit('d', 1, 10).ok).toBe(true);
  });
});
