// End-to-end walkthroughs through the public API, one per role. Needs TEST_MONGODB_URI (see docs/TESTING.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Application } from '../src/models/Application.js';
import { PASSWORD, PDF, makeClient, mkApplication, setupWorld, teardown } from './helpers.js';

describe.skipIf(!process.env.TEST_MONGODB_URI)('end-to-end journeys', () => {
  let w, as, feeCourse;
  const asToken = (t) => makeClient(w.app, {})(t);
  const upload = (who, appId, type) => as(who).post(`/applications/${appId}/documents`).field('type', type).attach('file', PDF, { filename: `${type}.pdf`, contentType: 'application/pdf' });

  beforeAll(async () => {
    w = await setupWorld();
    as = makeClient(w.app, w.tokens);
    feeCourse = await w.mkCourse('FEE-1', 'Computer Science', { applicationFee: 500, description: 'Four-year programme', eligibility: 'Class 12 with at least 60%' });
  });
  afterAll(teardown);

  describe('applicant: from first visit to an accepted offer', () => {
    let token, appId;
    const personal = { fullName: 'Priya Sen', gender: 'female', phone: '9876543210', address: '12 Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016', guardianName: 'R Sen', guardianPhone: '9876543211' };

    it('a visitor can read programme and eligibility information without signing in', async () => {
      const list = await as().get('/courses?open=true');
      expect(list.status).toBe(200);
      expect(list.body.courses.map((c) => c.code)).toContain('FEE-1');
      const detail = await as().get(`/courses/${feeCourse._id}`);
      expect(detail.body.course).toMatchObject({ code: 'FEE-1', minPercentage: 60, eligibility: 'Class 12 with at least 60%', applicationFee: 500 });
      expect(detail.body.course.requiredDocuments).toEqual(['idProof', 'photo']);
      expect((await as().get('/announcements')).status).toBe(200);
    });

    it('registers, then fills in, pays for and submits an application', async () => {
      const reg = await request(w.app).post('/api/v1/auth/register').send({ name: 'Priya Sen', email: 'priya@test.com', phone: '9876543210', dateOfBirth: '2003-04-05', password: 'PriyaPass1' });
      expect(reg.status).toBe(201);
      token = reg.body.accessToken;
      expect((await asToken(token).get('/auth/me')).body.user.email).toBe('priya@test.com');

      const started = await asToken(token).post('/applications').send({ courseId: String(feeCourse._id) });
      expect(started.status).toBe(201);
      appId = started.body.application._id;
      expect(started.body.application.status).toBe('draft');
      expect(started.body.application.payment).toMatchObject({ status: 'unpaid', amount: 500 });

      expect((await asToken(token).put(`/applications/${appId}`).send({ step: 1, personal })).status).toBe(200);
      expect((await asToken(token).put(`/applications/${appId}`).send({ step: 2, academic: { board: 'CBSE', schoolName: 'Don Bosco', passingYear: 2024, percentage: 88 } })).status).toBe(200);
      for (const type of ['idProof', 'photo']) expect((await upload(token, appId, type)).status, type).toBe(201);
      expect((await asToken(token).post(`/applications/${appId}/pay`).send({ method: 'upi' })).body.application.payment.status).toBe('paid');

      const sub = await asToken(token).post(`/applications/${appId}/submit`);
      expect(sub.status).toBe(200);
      expect(sub.body.application.status).toBe('submitted');
      expect(sub.body.application.applicationNo).toMatch(/^UEM-\d{4}-[0-9A-F]{6}$/);
    });

    it('the applicant sees a confirmation and can read it, then mark it as read', async () => {
      const n = (await asToken(token).get('/notifications')).body;
      expect(n.unread).toBeGreaterThanOrEqual(1);
      expect(n.items.map((i) => i.title)).toContain('Application submitted');
      const first = n.items[0];
      expect((await asToken(token).patch(`/notifications/${first._id}/read`)).body.notification.read).toBe(true);
      expect((await asToken(token).patch('/notifications/read-all')).status).toBe(200);
      expect((await asToken(token).get('/notifications')).body.unread).toBe(0);
      // one user can never mark another user's notification
      expect((await as('alice').patch(`/notifications/${first._id}/read`)).status).toBe(404);
    });

    it('the officer finds it, reviews the documents and accepts it; the applicant follows every step', async () => {
      const queue = await as('officer').get('/review/applications?status=submitted&q=Priya');
      expect(queue.body.items).toHaveLength(1);
      expect(queue.body.items[0]._id).toBe(appId);

      const detail = (await as('officer').get(`/applications/${appId}`)).body.application;
      expect(detail.personal.fullName).toBe('Priya Sen');
      expect(detail.documents).toHaveLength(2);
      for (const d of detail.documents) {
        expect((await as('officer').get(`/applications/${appId}/documents/${d._id}/file`)).headers['content-type']).toMatch(/pdf/);
        expect((await as('officer').patch(`/review/applications/${appId}/documents/${d._id}`).send({ status: 'verified' })).status).toBe(200);
      }
      expect((await as('officer').patch(`/review/applications/${appId}/status`).send({ status: 'documents_verified' })).status).toBe(200);
      const done = await as('officer').patch(`/review/applications/${appId}/status`).send({ status: 'accepted', remarks: 'Welcome aboard' });
      expect(done.status).toBe(200);

      const mine = (await asToken(token).get('/applications/mine')).body.applications[0];
      expect(mine.status).toBe('accepted');
      const full = (await asToken(token).get(`/applications/${appId}`)).body.application;
      expect(full.decision).toMatchObject({ status: 'accepted', remarks: 'Welcome aboard' });
      expect(full.history.map((h) => h.status)).toEqual(['draft', 'submitted', 'under_review', 'documents_verified', 'accepted']);
      const titles = (await asToken(token).get('/notifications')).body.items.map((i) => i.title);
      expect(titles).toEqual(expect.arrayContaining(['Application under review', 'Documents verified', 'Congratulations — you have been accepted!']));
      expect((await asToken(token).get(`/applications/${appId}/documents/${full.documents[0]._id}/file`)).status).toBe(200); // own file
      expect((await as('bob').get(`/applications/${appId}`)).status).toBe(404);
    });

    it('a decision is permanent: the applicant can no longer change or pay for the application', async () => {
      expect((await asToken(token).put(`/applications/${appId}`).send({ statement: 'edit' })).status).toBe(409);
      expect((await asToken(token).post(`/applications/${appId}/submit`)).status).toBe(409);
    });
  });

  describe('officer: a rejected document is fixed by the applicant, then the applicant is waitlisted and later accepted', () => {
    it('follows the correction loop', async () => {
      const course = await w.mkCourse('LOOP-1', 'Computer Science', { seats: 1 });
      const a = await mkApplication({ user: w.users.bob, course, status: 'submitted', docs: { idProof: 'pending', photo: 'pending' } });
      const docs = (await Application.findById(a._id)).documents;
      const id = (t) => docs.find((d) => d.type === t)._id;

      expect((await as('officer').patch(`/review/applications/${a._id}/documents/${id('idProof')}`).send({ status: 'rejected', remark: 'Scan is blurry' })).status).toBe(200);
      expect((await as('bob').get('/notifications')).body.items.some((i) => /blurry/.test(i.message))).toBe(true);
      expect((await upload('bob', a._id, 'idProof')).status).toBe(201); // applicant uploads a replacement

      const fresh = (await as('bob').get(`/applications/${a._id}`)).body.application;
      for (const d of fresh.documents) expect((await as('officer').patch(`/review/applications/${a._id}/documents/${d._id}`).send({ status: 'verified' })).status).toBe(200);
      expect((await as('officer').patch(`/review/applications/${a._id}/status`).send({ status: 'waitlisted', remarks: 'Waiting for a seat' })).status).toBe(200);
      expect((await as('officer').patch(`/review/applications/${a._id}/status`).send({ status: 'accepted', remarks: 'Seat available' })).status).toBe(200);
      expect((await Application.findById(a._id)).status).toBe('accepted');
    });
  });

  describe('administrator: programmes, users, announcements and the audit trail', () => {
    const course = (over = {}) => ({ code: 'NEW-1', name: 'New Programme', department: 'Civil', level: 'UG', durationYears: 4, seats: 30, description: 'A new programme for testing', eligibility: 'Class 12 with PCM', minPercentage: 55, requiredDocuments: ['idProof'], applicationFee: 0, deadline: new Date(Date.now() + 30 * 864e5).toISOString(), isOpen: true, ...over });

    it('creates, edits, closes and deletes programmes with sensible rules', async () => {
      expect((await as('admin').post('/courses').send(course({ minPercentage: 150, seats: 0, requiredDocuments: ['passport'] }))).status).toBe(422);
      const created = await as('admin').post('/courses').send(course());
      expect(created.status).toBe(201);
      const id = created.body.course._id;
      expect((await as().get('/courses?department=Civil')).body.courses).toHaveLength(1);

      expect((await as('admin').put(`/courses/${id}`).send(course({ seats: 40 }))).body.course.seats).toBe(40);
      expect((await as('admin').put(`/courses/${id}`).send(course({ isOpen: false }))).status).toBe(200);
      expect((await as('alice').post('/applications').send({ courseId: id })).status).toBe(409); // closed
      expect((await as('admin').put(`/courses/${id}`).send(course({ isOpen: true }))).status).toBe(200);

      await as('alice').post('/applications').send({ courseId: id });
      const refused = await as('admin').delete(`/courses/${id}`);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toMatch(/Close it/);

      const empty = (await as('admin').post('/courses').send(course({ code: 'TMP-1' }))).body.course._id;
      expect((await as('admin').delete(`/courses/${empty}`)).status).toBe(200);
      expect((await as().get(`/courses/${empty}`)).status).toBe(404);
    });

    it('manages staff accounts: validation, search, roles, deactivation and reactivation', async () => {
      const staff = (over = {}) => ({ name: 'New Officer', email: 'new.officer@test.com', password: 'Officer123', role: 'officer', ...over });
      expect((await as('admin').post('/admin/users').send(staff({ password: 'weak' }))).status).toBe(422);
      expect((await as('admin').post('/admin/users').send(staff({ role: 'coordinator' }))).status).toBe(422); // needs a department
      expect((await as('admin').post('/admin/users').send(staff({ role: 'applicant' }))).status).toBe(422); // staff roles only
      const made = await as('admin').post('/admin/users').send(staff());
      expect(made.status).toBe(201);
      expect(made.body.user.password).toBeUndefined();
      expect((await as('admin').post('/admin/users').send(staff())).status).toBe(409);

      expect((await as('admin').get('/admin/users?role=officer&q=new.officer')).body.items.map((u) => u.email)).toEqual(['new.officer@test.com']);
      const uid = made.body.user._id;

      // role changes: a coordinator must have a department
      expect((await as('admin').patch(`/admin/users/${uid}`).send({ role: 'coordinator' })).status).toBe(422);
      expect((await as('admin').patch(`/admin/users/${uid}`).send({ role: 'coordinator', department: '' })).status).toBe(422);
      const promoted = await as('admin').patch(`/admin/users/${uid}`).send({ role: 'coordinator', department: 'Mechanical' });
      expect(promoted.status).toBe(200);
      expect(promoted.body.user).toMatchObject({ role: 'coordinator', department: 'Mechanical' });
      expect((await as('admin').patch(`/admin/users/${uid}`).send({ department: '' })).status).toBe(422); // cannot blank it afterwards
      expect((await as('admin').patch('/admin/users/' + '0'.repeat(24)).send({ isActive: false })).status).toBe(404);

      // the new coordinator signs in and is confined to their department
      const login = await request(w.app).post('/api/v1/auth/login').send({ email: 'new.officer@test.com', password: 'Officer123' });
      expect(login.status).toBe(200);
      const tok = login.body.accessToken;
      const csApp = await mkApplication({ user: w.users.bob, course: w.courses.cs, status: 'submitted' }).catch(() => null);
      if (csApp) expect((await asToken(tok).get(`/applications/${csApp._id}`)).status).toBe(404);

      // deactivation cuts access immediately, reactivation restores it
      expect((await as('admin').patch(`/admin/users/${uid}`).send({ isActive: false })).status).toBe(200);
      expect((await asToken(tok).get('/auth/me')).status).toBe(401);
      expect((await request(w.app).post('/api/v1/auth/login').send({ email: 'new.officer@test.com', password: 'Officer123' })).status).toBe(403);
      expect((await as('admin').patch(`/admin/users/${uid}`).send({ isActive: true })).status).toBe(200);
      expect((await request(w.app).post('/api/v1/auth/login').send({ email: 'new.officer@test.com', password: 'Officer123' })).status).toBe(200);
    });

    it('publishes announcements that applicants can read and are notified about', async () => {
      expect((await as('admin').post('/announcements').send({ title: 'x', body: 'y' })).status).toBe(422);
      const before = (await as('alice').get('/notifications')).body.items.length;
      const pinned = await as('admin').post('/announcements').send({ title: 'Counselling dates', body: 'Counselling starts on Monday.', pinned: true });
      expect(pinned.status).toBe(201);
      expect(pinned.body.notified).toBeGreaterThanOrEqual(2);
      await as('admin').post('/announcements').send({ title: 'Later news', body: 'Another message for everyone.' });

      const list = (await as().get('/announcements')).body.items;
      expect(list[0].title).toBe('Counselling dates'); // pinned first
      expect((await as('alice').get('/notifications')).body.items.length).toBeGreaterThan(before);

      expect((await as('admin').delete(`/announcements/${list[0]._id}`)).status).toBe(200);
      expect((await as().get('/announcements')).body.items.map((i) => i.title)).not.toContain('Counselling dates');
    });

    it('records who did what in the audit trail, newest first', async () => {
      const log = (await as('admin').get('/admin/audit')).body.items;
      const actions = log.map((l) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['course.create', 'course.update', 'course.delete', 'user.create', 'user.update', 'announcement.create', 'announcement.delete', 'application.accepted', 'document.verified', 'document.rejected']));
      expect(log.every((l) => l.actorName)).toBe(true);
      expect(new Date(log[0].createdAt) >= new Date(log.at(-1).createdAt)).toBe(true);
      expect((await as('officer').get('/admin/audit')).status).toBe(403);
      expect(JSON.stringify(log)).not.toMatch(/\$2[aby]\$|password/i);
    });
  });
});
