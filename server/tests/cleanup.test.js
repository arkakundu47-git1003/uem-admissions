// Registration duplicate handling and the load-test cleanup scope. Needs TEST_MONGODB_URI (see docs/TESTING.md).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Application } from '../src/models/Application.js';
import { User } from '../src/models/User.js';
import { Notification } from '../src/models/Misc.js';
import { cleanupLoadTestData } from '../loadtest/cleanup-lib.js';
import { mkApplication, setupWorld, teardown } from './helpers.js';

describe.skipIf(!process.env.TEST_MONGODB_URI)('registration and cleanup', () => {
  let w;
  beforeAll(async () => { w = await setupWorld(); });
  afterAll(teardown);

  const body = (email) => ({ name: 'Dup Test', email, phone: '9876543210', dateOfBirth: '2000-05-15', password: 'DupPass123' });

  it('a duplicate email is refused with 409 before any account (or password hash) is created', async () => {
    expect((await request(w.app).post('/api/v1/auth/register').send(body('dup@test.com'))).status).toBe(201);
    const create = vi.spyOn(User, 'create');
    const r = await request(w.app).post('/api/v1/auth/register').send(body('DUP@test.com'));
    expect(r.status).toBe(409);
    expect(r.body.fields.email).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });

  it('two simultaneous registrations of one email give one account and one 409', async () => {
    const results = await Promise.all([1, 2, 3].map(() => request(w.app).post('/api/v1/auth/register').send(body('race@test.com'))));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await User.countDocuments({ email: 'race@test.com' })).toBe(1);
  });

  describe('load-test cleanup', () => {
    let testUser, realUser, lookalike, testApp, realApp, staffNote;
    const mkUser = (email, role = 'applicant') => User.create({ name: 'Test Person', email, password: 'Passw0rdX', role, phone: '9876543210', dateOfBirth: new Date('2000-01-01') });
    beforeAll(async () => {
      testUser = await mkUser('loadtest+abc123-4@example.com');
      realUser = await mkUser('real.student@example.com');
      lookalike = await mkUser('loadtest+abc123-4@example.org');         // wrong domain
      await mkUser('loadtest+zzzzzz-1@example.com');                     // not hex: not ours
      await mkUser('loadtest+abc123-5@example.com', 'officer');          // right pattern, wrong role
      testApp = await mkApplication({ user: testUser, course: w.courses.cs, status: 'submitted', docs: { idProof: 'pending' } });
      realApp = await mkApplication({ user: realUser, course: w.courses.cs, status: 'submitted' });
      await Notification.create({ user: testUser._id, title: 't', message: 'own' });
      staffNote = await Notification.create({ user: w.users.csCoord._id, title: 'New application to review', message: 'x', link: `/staff/applications/${testApp.id}` });
      await Notification.create({ user: w.users.csCoord._id, title: 'Unrelated', message: 'keep', link: `/staff/applications/${realApp.id}` });
      await Notification.create({ user: realUser._id, title: 'Mine', message: 'keep' });
    });

    it('preview counts only generated data and changes nothing', async () => {
      const r = await cleanupLoadTestData({ apply: false });
      expect(r).toMatchObject({ users: 1, applications: 1, documents: 1, notifications: 2, applied: false });
      expect(await User.countDocuments()).toBeGreaterThan(0);
      expect(await Application.findById(testApp._id)).toBeTruthy();
    });

    it('apply removes the generated users, applications and both sets of notifications, and nothing else', async () => {
      const before = { users: await User.countDocuments(), apps: await Application.countDocuments(), notes: await Notification.countDocuments() };
      const r = await cleanupLoadTestData({ apply: true });
      expect(r.applied).toBe(true);
      expect(await User.countDocuments()).toBe(before.users - 1);
      expect(await Application.countDocuments()).toBe(before.apps - 1);
      expect(await Notification.countDocuments()).toBe(before.notes - 2);
      expect(await User.findById(testUser._id)).toBeNull();
      expect(await Notification.findById(staffNote._id)).toBeNull();
      for (const keep of [realUser, lookalike]) expect(await User.findById(keep._id)).toBeTruthy();
      expect(await Application.findById(realApp._id)).toBeTruthy();
      expect(await Notification.findOne({ title: 'Unrelated' })).toBeTruthy();
      expect(await Notification.findOne({ title: 'Mine' })).toBeTruthy();
    });

    it('running it again finds nothing', async () => {
      expect(await cleanupLoadTestData({ apply: true })).toMatchObject({ users: 0, applications: 0, applied: false });
    });
  });
});
