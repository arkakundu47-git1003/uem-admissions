import { describe, expect, it } from 'vitest';
import { passwordRules } from '../src/features/auth/passwordRules';
import { homeFor } from '../src/lib/constants';
import { deadlineInfo, formatINR, initials } from '../src/lib/format';

describe('password rules (must match the server)', () => {
  it.each([['short1A', 'at least 8'], ['alllowercase1', 'uppercase'], ['ALLUPPERCASE1', 'lowercase'], ['NoNumbersHere', 'number']])('%s is refused', (pw, hint) => {
    const r = passwordRules.safeParse(pw);
    expect(r.success).toBe(false);
    expect(r.error.issues.map((i) => i.message).join(' ')).toContain(hint);
  });
  it('accepts a strong password', () => expect(passwordRules.safeParse('Passw0rdX').success).toBe(true));
});

describe('helpers', () => {
  it('homeFor maps roles to their area', () => {
    expect(homeFor('applicant')).toBe('/applicant');
    for (const r of ['officer', 'coordinator', 'admin']) expect(homeFor(r)).toBe('/staff');
  });
  it('deadlineInfo labels urgency', () => {
    const inDays = (n) => new Date(Date.now() + n * 864e5 - 1000);
    expect(deadlineInfo(inDays(-2)).tone).toBe('closed');
    expect(deadlineInfo(inDays(30), false).tone).toBe('closed');
    expect(deadlineInfo(inDays(3)).tone).toBe('urgent');
    expect(deadlineInfo(inDays(15)).tone).toBe('soon');
    expect(deadlineInfo(inDays(60)).tone).toBe('ok');
  });
  it('formats fees and initials', () => {
    expect(formatINR(0)).toBe('Free');
    expect(formatINR(1500)).toBe('₹1,500');
    expect(initials('asha rao kumar')).toBe('AR');
    expect(initials('')).toBe('?');
  });
});
