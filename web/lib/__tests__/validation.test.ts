import { describe, it, expect } from 'vitest';
import {
  prospectInputSchema,
  contactCreateSchema,
  callInputSchema,
  idListSchema,
  MAX_BULK,
} from '@/lib/validation';

describe('prospectInputSchema', () => {
  it('accepts a minimal valid prospect', () => {
    expect(prospectInputSchema.safeParse({ full_name: 'Mario Rossi' }).success).toBe(true);
  });
  it('rejects an empty name', () => {
    expect(prospectInputSchema.safeParse({ full_name: '' }).success).toBe(false);
  });
  it('rejects an out-of-enum stage', () => {
    expect(
      prospectInputSchema.safeParse({ full_name: 'x', current_stage: 'bogus' }).success,
    ).toBe(false);
  });
  it('keeps unknown extra keys (passthrough → never rejects valid extras)', () => {
    expect(prospectInputSchema.safeParse({ full_name: 'x', whatever: 1 }).success).toBe(true);
  });
});

describe('idListSchema (bulk DoS cap)', () => {
  it('accepts a reasonable list', () => {
    expect(idListSchema.safeParse(['a', 'b', 'c']).success).toBe(true);
  });
  it('rejects an oversized list', () => {
    const huge = Array.from({ length: MAX_BULK + 1 }, (_, i) => String(i));
    expect(idListSchema.safeParse(huge).success).toBe(false);
  });
});

describe('callInputSchema', () => {
  it('accepts a valid call', () => {
    expect(
      callInputSchema.safeParse({ call_type: 'outbound', outcome: 'connesso', duration_secs: 60 })
        .success,
    ).toBe(true);
  });
  it('rejects a negative duration', () => {
    expect(
      callInputSchema.safeParse({ call_type: 'outbound', outcome: 'connesso', duration_secs: -5 })
        .success,
    ).toBe(false);
  });
});

describe('contactCreateSchema', () => {
  it('requires first_name', () => {
    expect(contactCreateSchema.safeParse({}).success).toBe(false);
    expect(contactCreateSchema.safeParse({ first_name: 'Anna' }).success).toBe(true);
  });
});
