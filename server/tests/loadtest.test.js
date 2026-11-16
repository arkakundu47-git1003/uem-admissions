import { describe, expect, it } from 'vitest';
import { evaluate, parseArgs, percentile, summarize } from '../loadtest/loadtest.js';

const sample = (ms, ok = true) => ({ name: 'x', ms, ok, status: ok ? 200 : 500 });

describe('load test measurements', () => {
  it('percentile uses the nearest-rank method', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(95);
    expect(percentile(v, 100)).toBe(100);
    expect(percentile([], 95)).toBe(0);
    expect(percentile([7], 99)).toBe(7);
  });

  it('summarize reports counts, errors and percentiles', () => {
    const s = summarize([...Array.from({ length: 98 }, () => sample(100)), sample(5000), sample(10, false)]);
    expect(s.count).toBe(100);
    expect(s.failed).toBe(1);
    expect(s.errorRate).toBeCloseTo(0.01);
    expect(s.p50).toBe(100);
    expect(s.max).toBe(5000);
  });

  it('passes when 95% of requests are under the limit and enough users took part', () => {
    const fast = Array.from({ length: 96 }, () => sample(200));
    const slow = Array.from({ length: 4 }, () => sample(9000)); // 4% slow is allowed
    const v = evaluate([...fast, ...slow], { limitMs: 3000, users: 100, usersStarted: 100 });
    expect(v.pass).toBe(true);
  });

  it('fails when more than 5% of requests are slow', () => {
    const v = evaluate([...Array.from({ length: 90 }, () => sample(200)), ...Array.from({ length: 10 }, () => sample(4000))], { usersStarted: 100 });
    expect(v.pass).toBe(false);
    expect(v.checks[0].ok).toBe(false);
  });

  it('fails when too few users reached the portal, or too many requests error, or nothing was measured', () => {
    expect(evaluate([sample(100)], { users: 100, usersStarted: 60 }).checks[1].ok).toBe(false);
    expect(evaluate([sample(100), sample(100, false)], { usersStarted: 100 }).checks[2].ok).toBe(false);
    expect(evaluate([], { usersStarted: 100 }).pass).toBe(false);
  });

  it('parses command-line options', () => {
    expect(parseArgs(['--url', 'https://a.b', '--users', '50', '--dry-run'])).toEqual({ url: 'https://a.b', users: '50', 'dry-run': true });
  });
});
