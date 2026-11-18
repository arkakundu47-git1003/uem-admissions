// Dashboard numbers. Needs TEST_MONGODB_URI and a real MongoDB: the overview uses $lookup, which the FerretDB
// stand-in used for some local runs does not support, so the test skips itself there (CI uses real MongoDB).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { User } from '../src/models/User.js';
import { istDay } from '../src/utils/dates.js';
import { PASSWORD, makeClient, mkApplication, setupWorld, teardown } from './helpers.js';

describe.skipIf(!process.env.TEST_MONGODB_URI)('dashboard overview', () => {
  let w, as, ferret = false;
  beforeAll(async () => {
    w = await setupWorld();
    ferret = 'ferretdbVersion' in (await mongoose.connection.db.admin().command({ buildInfo: 1 }));
    as = makeClient(w.app, w.tokens);
    const extra = (n) => User.create({ name: `Extra ${n}`, email: `extra${n}@test.com`, password: PASSWORD, role: 'applicant', phone: '9876543210', dateOfBirth: new Date('2000-01-01') });
    const [e1, e2] = [await extra(1), await extra(2)];
    await mkApplication({ user: w.users.alice, course: w.courses.cs, status: 'submitted' });
    await mkApplication({ user: w.users.bob, course: w.courses.cs, status: 'submitted' });
    await mkApplication({ user: e1, course: w.courses.cs, status: 'accepted' });
    await mkApplication({ user: e2, course: w.courses.me, status: 'under_review' });
    await mkApplication({ user: e2, course: w.courses.cs, status: 'draft' }); // drafts are never counted
  });
  afterAll(teardown);

  it('admin sees counts across all departments', async (ctx) => {
    if (ferret) return ctx.skip();
    const r = await as('admin').get('/reports/overview');
    expect(r.status).toBe(200);
    expect(r.body.totals).toMatchObject({ applications: 4, applicants: 4, openCourses: 2, pending: 3, accepted: 1 });
    expect(r.body.byStatus).toEqual({ submitted: 2, accepted: 1, under_review: 1 });
    expect(r.body.byCourse.map((c) => [c.code, c.count])).toEqual([['CS-1', 3], ['ME-1', 1]]);
    expect(r.body.daily).toHaveLength(14);
    expect(r.body.daily.at(-1).date).toBe(istDay(new Date()));
    expect(r.body.daily.reduce((n, d) => n + d.count, 0)).toBe(4);
  });

  it('a coordinator sees only their own department, and not the applicant total', async (ctx) => {
    if (ferret) return ctx.skip();
    const r = await as('meCoord').get('/reports/overview');
    expect(r.body.totals).toMatchObject({ applications: 1, pending: 1, accepted: 0, applicants: null });
    expect(r.body.byCourse.map((c) => c.code)).toEqual(['ME-1']);
    const cs = await as('csCoord').get('/reports/overview');
    expect(cs.body.totals.applications).toBe(3);
  });
});
