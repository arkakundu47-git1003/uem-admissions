import { describe, expect, it } from 'vitest';
import { completeSchema } from '../src/routes/applications.routes.js';

const issues = (input) => {
  const r = completeSchema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('application completeness messages (Zod 4)', () => {
  it('gives friendly messages for missing fields, not generic Zod text', () => {
    const f = issues({ personal: {}, academic: {} });
    expect(f['personal.fullName']).toBe('Full name is required');
    expect(f['personal.dateOfBirth']).toBe('Date of birth is required');
    expect(f['personal.gender']).toBe('Select a gender');
    expect(f['personal.pincode']).toBeTruthy();
    expect(f['academic.passingYear']).toBe('Passing year is required');
    expect(f['academic.percentage']).toBe('Percentage is required');
  });

  it('accepts a complete record', () => {
    expect(
      completeSchema.safeParse({
        personal: { fullName: 'A B', dateOfBirth: '2005-01-02', gender: 'female', phone: '9876543210', address: 'x', city: 'c', state: 's', pincode: '700091', guardianName: 'g', guardianPhone: '9876543211' },
        academic: { board: 'CBSE', schoolName: 'S', passingYear: 2024, percentage: 88 },
      }).success,
    ).toBe(true);
  });
});
