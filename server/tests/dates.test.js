import { describe, expect, it } from 'vitest';
import { istDay, lastIstDays } from '../src/utils/dates.js';

describe('Indian calendar days for reports', () => {
  it('uses the Indian date, not the server (UTC) date', () => {
    expect(istDay(new Date('2026-11-17T18:29:00Z'))).toBe('2026-11-17'); // 23:59 IST
    expect(istDay(new Date('2026-11-17T18:31:00Z'))).toBe('2026-11-18'); // 00:01 IST next day
  });
  it('ends on today (IST) even when it is already tomorrow in UTC terms, so early-morning applications are counted', () => {
    const now = Date.parse('2026-11-17T19:00:00Z'); // 00:30 IST on the 18th
    const { keys, start } = lastIstDays(14, now);
    expect(keys).toHaveLength(14);
    expect(keys.at(-1)).toBe('2026-11-18');
    expect(keys[0]).toBe('2026-11-05');
    expect(start.toISOString()).toBe('2026-11-04T18:30:00.000Z'); // midnight IST starting the first day
    expect(start <= new Date('2026-11-05T00:00:00+05:30')).toBe(true);
  });
  it('is continuous with no gaps or repeats, including across a month end', () => {
    const { keys } = lastIstDays(14, Date.parse('2026-12-03T06:00:00Z'));
    expect(keys[0]).toBe('2026-11-20');
    expect(new Set(keys).size).toBe(14);
    expect(keys).toEqual([...keys].sort());
  });
});
