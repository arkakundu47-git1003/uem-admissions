// Integration test. Needs a MongoDB: TEST_MONGODB_URI=mongodb://127.0.0.1:27017/portal_pw_test npm test
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

const mails = [];
let mailOk = true;
vi.mock('../src/services/mailer.js', () => ({
  emailEnabled: () => true,
  sendEmail: async (to, subject, text) => { mails.push({ to, subject, text }); return mailOk; },
}));

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');

const URI = process.env.TEST_MONGODB_URI;
const tokenFrom = (m) => /token=([0-9a-f]{64})/.exec(m.text)?.[1];
const lastReset = () => [...mails].reverse().find((m) => /reset-password\?token=/.test(m.text));

describe.skipIf(!URI)('password management', () => {
  let app;
  const creds = { name: 'Pw Tester', email: 'pw@test.com', phone: '9876543210', dateOfBirth: '2000-05-15', password: 'OldPass123' };
  beforeAll(async () => {
    await mongoose.connect(URI);
    await mongoose.connection.dropDatabase();
    await User.init();
    app = createApp();
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  const login = (password) => request(app).post('/api/v1/auth/login').send({ email: creds.email, password });

  it('registers, then change-password needs the right current password', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send(creds);
    expect(reg.status).toBe(201);
    const t = reg.body.accessToken;
    const bad = await request(app).post('/api/v1/auth/change-password').set('Authorization', `Bearer ${t}`).send({ currentPassword: 'WrongPass123', newPassword: 'NewPass123' });
    expect(bad.status).toBe(400);
    expect(bad.body.fields.currentPassword).toBeTruthy();
    const same = await request(app).post('/api/v1/auth/change-password').set('Authorization', `Bearer ${t}`).send({ currentPassword: 'OldPass123', newPassword: 'OldPass123' });
    expect(same.status).toBe(422);
    const weak = await request(app).post('/api/v1/auth/change-password').set('Authorization', `Bearer ${t}`).send({ currentPassword: 'OldPass123', newPassword: 'weak' });
    expect(weak.status).toBe(422);
    const ok = await request(app).post('/api/v1/auth/change-password').set('Authorization', `Bearer ${t}`).send({ currentPassword: 'OldPass123', newPassword: 'NewPass123' });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
    expect((await login('OldPass123')).status).toBe(401);
    expect((await login('NewPass123')).status).toBe(200);
    expect(mails.some((m) => /password was changed/.test(m.subject))).toBe(true);
    const noAuth = await request(app).post('/api/v1/auth/change-password').send({ currentPassword: 'a', newPassword: 'NewPass456' });
    expect(noAuth.status).toBe(401);
  });

  it('change-password revokes refresh cookies of other devices', async () => {
    const a = await login('NewPass123');
    const cookie = a.headers['set-cookie'];
    const b = await login('NewPass123'); // second device
    await request(app).post('/api/v1/auth/change-password').set('Authorization', `Bearer ${b.body.accessToken}`).send({ currentPassword: 'NewPass123', newPassword: 'ThirdPass123' }).expect(200);
    const refresh = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });

  it('forgot-password answers identically for known and unknown emails', async () => {
    const known = await request(app).post('/api/v1/auth/forgot-password').send({ email: creds.email });
    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.com' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    expect(mails.filter((m) => m.to === 'nobody@test.com')).toHaveLength(0);
    expect(lastReset().to).toBe(creds.email);
  });

  it('reset link works once, signs out sessions, clears lockout, and only stores a hash', async () => {
    const token = tokenFrom(lastReset());
    const raw = await User.findOne({ email: creds.email }).select('+resetTokenHash');
    expect(raw.resetTokenHash).toBeTruthy();
    expect(raw.resetTokenHash).not.toContain(token);
    await User.updateOne({ email: creds.email }, { lockUntil: new Date(Date.now() + 600000), failedLogins: 3 });
    expect((await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'weak' })).status).toBe(422);
    const ok = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'ResetPass123' });
    expect(ok.status).toBe(200);
    expect((await login('ThirdPass123')).status).toBe(401);
    expect((await login('ResetPass123')).status).toBe(200); // lockout cleared
    const again = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'AnotherPass123' });
    expect(again.status).toBe(400); // single use
  });

  it('expired and made-up tokens are rejected', async () => {
    await request(app).post('/api/v1/auth/forgot-password').send({ email: creds.email });
    const token = tokenFrom(lastReset());
    await User.updateOne({ email: creds.email }, { resetTokenExpires: new Date(Date.now() - 1000) });
    expect((await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'LatePass123' })).status).toBe(400);
    expect((await request(app).post('/api/v1/auth/reset-password').send({ token: 'a'.repeat(64), password: 'LatePass123' })).status).toBe(400);
  });

  it('forgot-password is capped at 5 per email', async () => {
    let last;
    for (let i = 0; i < 6; i++) last = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'spam@test.com' });
    expect(last.status).toBe(429);
  });

  it('admin can send a reset link; non-admins cannot; deactivated users are refused', async () => {
    await User.create({ name: 'Admin', email: 'admin@test.com', password: 'AdminPass123', role: 'admin' });
    const adm = await request(app).post('/api/v1/auth/login').send({ email: 'admin@test.com', password: 'AdminPass123' });
    const target = await User.findOne({ email: creds.email });
    const before = mails.length;
    const r = await request(app).post(`/api/v1/admin/users/${target.id}/reset-password`).set('Authorization', `Bearer ${adm.body.accessToken}`);
    expect(r.status).toBe(200);
    expect(r.body.emailed).toBe(true);
    expect(r.body.resetUrl).toBeUndefined(); // link never returned when email works
    expect(mails.length).toBe(before + 1);
    const apl = await login('ResetPass123');
    expect((await request(app).post(`/api/v1/admin/users/${target.id}/reset-password`).set('Authorization', `Bearer ${apl.body.accessToken}`)).status).toBe(403);
    mailOk = false; // provider outage: admin must still be able to hand the link over
    const down = await request(app).post(`/api/v1/admin/users/${target.id}/reset-password`).set('Authorization', `Bearer ${adm.body.accessToken}`);
    expect(down.body.emailed).toBe(false);
    expect(down.body.resetUrl).toMatch(/reset-password\?token=[0-9a-f]{64}/);
    mailOk = true;
    await User.updateOne({ _id: target._id }, { isActive: false });
    expect((await request(app).post(`/api/v1/admin/users/${target.id}/reset-password`).set('Authorization', `Bearer ${adm.body.accessToken}`)).status).toBe(409);
  });
});
