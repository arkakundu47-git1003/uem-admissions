// Integration test. Needs MongoDB: TEST_MONGODB_URI=mongodb://127.0.0.1:27017/portal_rem_test
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

const mails = [];
vi.mock('../src/services/mailer.js', () => ({
  emailEnabled: () => true,
  emailProvider: () => 'brevo',
  maskEmail: (e) => e,
  logEmailEvent: () => {},
  sendEmail: async (to, subject, text) => { mails.push({ to, subject, text }); return true; },
}));

const { env } = await import('../src/config/env.js');
const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { Course } = await import('../src/models/Course.js');
const { Application } = await import('../src/models/Application.js');
const { Notification, ReminderLog } = await import('../src/models/Misc.js');
const { runReminders, deadlineBucket } = await import('../src/services/reminders.js');

const DAY = 864e5;
const URI = process.env.TEST_MONGODB_URI;

describe('deadlineBucket', () => {
  const now = new Date('2026-12-01T06:00:00Z');
  it('maps days left to 7 / 3 / 1 and ignores far or past deadlines', () => {
    expect(deadlineBucket(new Date(now.getTime() + 10 * DAY), now)).toBeNull();
    expect(deadlineBucket(new Date(now.getTime() + 6.5 * DAY), now)).toBe(7);
    expect(deadlineBucket(new Date(now.getTime() + 3 * DAY), now)).toBe(3);
    expect(deadlineBucket(new Date(now.getTime() + 2.2 * DAY), now)).toBe(3);
    expect(deadlineBucket(new Date(now.getTime() + 0.5 * DAY), now)).toBe(1);
    expect(deadlineBucket(new Date(now.getTime() - 1000), now)).toBeNull();
  });
});

describe.skipIf(!URI)('reminders and announcements', () => {
  let app, admin, stu1, stu2, stuOff, officer, course, draftApp, subApp;
  const mk = (n) => User.create({ name: n, email: `${n.toLowerCase().replace(/\s/g, '')}@t.com`, password: 'Passw0rdX', role: 'applicant', phone: '9876543210', dateOfBirth: new Date('2000-01-01') });
  const notes = (u, title) => Notification.countDocuments({ user: u._id, title: new RegExp(title) });

  beforeAll(async () => {
    await mongoose.connect(URI); await mongoose.connection.dropDatabase(); await User.init(); await ReminderLog.collection.createIndex({ key: 1 }, { unique: true }); // TTL index is not supported by the FerretDB stand-in, but is by MongoDB/Atlas
    app = createApp();
    [stu1, stu2, stuOff] = [await mk('Stu One'), await mk('Stu Two'), await mk('Stu Off')];
    await User.updateOne({ _id: stuOff._id }, { isActive: false });
    officer = await User.create({ name: 'Off', email: 'officer@t.com', password: 'Passw0rdX', role: 'officer' });
    admin = await User.create({ name: 'Adm', email: 'admin@t.com', password: 'Passw0rdX', role: 'admin' });
    const mkCourse = (code, deadlineDays, extra = {}) => Course.create({ code, name: `Course ${code}`, department: 'CS', level: 'UG', durationYears: 4, seats: 9, description: 'd', eligibility: 'e', minPercentage: 50, requiredDocuments: ['idProof', 'photo'], applicationFee: 0, deadline: new Date(Date.now() + deadlineDays * DAY), isOpen: true, ...extra });
    course = await mkCourse('R-1', 2.5);
    const far = await mkCourse('R-FAR', 30);
    const closed = await mkCourse('R-CLOSED', 2, { isOpen: false });
    const past = await mkCourse('R-PAST', -1);
    const base = { personal: {}, academic: {} };
    draftApp = await Application.create({ applicationNo: 'UEM-T1', applicant: stu1._id, course: course._id, status: 'draft', ...base });
    await Application.create({ applicationNo: 'UEM-T2', applicant: stu2._id, course: far._id, status: 'draft', ...base });       // far deadline: no reminder
    await Application.create({ applicationNo: 'UEM-T3', applicant: stu2._id, course: closed._id, status: 'draft', ...base });  // closed course: none
    await Application.create({ applicationNo: 'UEM-T4', applicant: stu2._id, course: past._id, status: 'draft', ...base });    // past deadline: none
    subApp = await Application.create({ applicationNo: 'UEM-T5', applicant: stuOff._id, course: course._id, status: 'under_review', submittedAt: new Date(), ...base,
      documents: [{ type: 'idProof', originalName: 'a.pdf', mimeType: 'application/pdf', size: 1, status: 'rejected', remark: 'blurry' }] }); // photo missing, idProof rejected
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  it('dry run counts but sends and records nothing', async () => {
    const s = await runReminders({ dryRun: true });
    expect(s).toMatchObject({ deadline: 1, documents: 1, dryRun: true });
    expect(await Notification.countDocuments()).toBe(0);
    expect(await ReminderLog.countDocuments()).toBe(0);
  });

  it('sends deadline and document reminders once, with email, and never twice', async () => {
    const s = await runReminders();
    expect(s).toMatchObject({ deadline: 1, documents: 1 });
    expect(await notes(stu1, 'Deadline approaching')).toBe(1);
    expect(await notes(stuOff, 'Documents needed')).toBe(1);
    expect(await notes(stu2, '.')).toBe(0); // far / closed / past: nothing
    expect(mails.map((m) => m.to).sort()).toEqual(['stuoff@t.com', 'stuone@t.com']);
    const docMsg = (await Notification.findOne({ user: stuOff._id })).message;
    expect(docMsg).toMatch(/Government ID Proof/);
    expect(docMsg).toMatch(/Passport Photograph/);
    const again = await runReminders();
    expect(again).toMatchObject({ deadline: 0, documents: 0 }); // idempotent
    expect(await Notification.countDocuments()).toBe(2);
  });

  it('overlapping runs do not double-send', async () => {
    await Notification.deleteMany({}); await ReminderLog.deleteMany({});
    const [a, b] = await Promise.all([runReminders(), runReminders()]);
    expect(a.deadline + b.deadline).toBe(1);
    expect(a.documents + b.documents).toBe(1);
    expect(await Notification.countDocuments()).toBe(2);
  });

  it('later milestones fire again: 1 day left, and documents again after 3 days', async () => {
    const later = new Date(Date.now() + 1.7 * DAY); // ~0.8 day to deadline -> bucket 1
    const s = await runReminders({ now: later });
    expect(s.deadline).toBe(1);
    const s2 = await runReminders({ now: new Date(Date.now() + 3.5 * DAY - 1) }); // deadline already passed for the draft
    expect(s2.deadline).toBe(0);
    expect(s2.documents).toBe(1); // new 3-day window
  });

  it('stops nagging when documents are complete, or the application is decided', async () => {
    await ReminderLog.deleteMany({}); await Notification.deleteMany({});
    await Application.updateOne({ _id: subApp._id }, { documents: [
      { type: 'idProof', originalName: 'a.pdf', mimeType: 'application/pdf', size: 1, status: 'verified' },
      { type: 'photo', originalName: 'p.png', mimeType: 'image/png', size: 1, status: 'pending' } ] });
    expect((await runReminders({ now: new Date(Date.now() + 8 * DAY) })).documents).toBe(0);
    await Application.updateOne({ _id: subApp._id }, { documents: [], status: 'accepted' });
    expect((await runReminders()).documents).toBe(0);
  });

  it('per-run cap is honoured', async () => {
    await ReminderLog.deleteMany({}); await Notification.deleteMany({});
    await Application.updateOne({ _id: subApp._id }, { status: 'under_review' });
    const s = await runReminders({ max: 1 });
    expect(s.deadline + s.documents).toBe(1);
    expect(s.skippedLimit).toBe(1);
  });

  describe('scheduler endpoint', () => {
    const call = (secret) => { const r = request(app).post('/api/v1/internal/run-reminders'); return secret === undefined ? r : r.set('x-cron-secret', secret); };
    it('is disabled (404) without a configured secret', async () => {
      env.CRON_SECRET = '';
      expect((await call('anything')).status).toBe(404);
    });
    it('rejects missing/wrong secret, accepts the right one', async () => {
      env.CRON_SECRET = 'x'.repeat(32);
      expect((await call()).status).toBe(401);
      expect((await call('wrong')).status).toBe(401);
      await ReminderLog.deleteMany({}); await Notification.deleteMany({});
      const ok = await call('x'.repeat(32));
      expect(ok.status).toBe(200);
      expect(ok.body).toMatchObject({ dryRun: false });
      expect(ok.body.deadline + ok.body.documents).toBe(2);
      const dry = await request(app).post('/api/v1/internal/run-reminders?dryRun=true').set('x-cron-secret', 'x'.repeat(32));
      expect(dry.body.dryRun).toBe(true);
    });
    it('a normal user token cannot use it', async () => {
      env.CRON_SECRET = 'x'.repeat(32);
      const login = await request(app).post('/api/v1/auth/login').send({ email: 'stuone@t.com', password: 'Passw0rdX' });
      const r = await request(app).post('/api/v1/internal/run-reminders').set('Authorization', `Bearer ${login.body.accessToken}`);
      expect(r.status).toBe(401);
    });
  });

  describe('announcements', () => {
    const publish = async (body) => {
      const login = await request(app).post('/api/v1/auth/login').send({ email: 'admin@t.com', password: 'Passw0rdX' });
      return request(app).post('/api/v1/announcements').set('Authorization', `Bearer ${login.body.accessToken}`).send(body);
    };
    it('notifies active applicants in-app only (no email by default), not staff or deactivated users', async () => {
      await Notification.deleteMany({}); mails.length = 0;
      const r = await publish({ title: 'Counselling dates', body: 'Counselling starts on 5 Dec.', pinned: true });
      expect(r.status).toBe(201);
      expect(r.body).toMatchObject({ notified: 2, emailed: 0 });
      expect(await notes(stu1, 'Counselling dates')).toBe(1);
      expect(await notes(stu2, 'Counselling dates')).toBe(1);
      expect(await notes(stuOff, 'Counselling')).toBe(0);
      expect(await notes(officer, 'Counselling')).toBe(0);
      await new Promise((s) => setTimeout(s, 100));
      expect(mails).toHaveLength(0);
    });
    it('emails applicants only when asked, and respects the daily cap', async () => {
      mails.length = 0; env.ANNOUNCEMENT_EMAIL_MAX = 1;
      const r = await publish({ title: 'Merit list', body: 'Merit list is out now.', emailApplicants: true });
      expect(r.body).toMatchObject({ notified: 2, emailed: 1, emailSkipped: 1 });
      await vi.waitFor(() => expect(mails).toHaveLength(1));
      expect(mails[0].subject).toMatch(/Merit list/);
    });
    it('non-admins cannot publish', async () => {
      const login = await request(app).post('/api/v1/auth/login').send({ email: 'stuone@t.com', password: 'Passw0rdX' });
      const r = await request(app).post('/api/v1/announcements').set('Authorization', `Bearer ${login.body.accessToken}`).send({ title: 'Hello there', body: 'Hello everyone' });
      expect(r.status).toBe(403);
    });
  });
});
