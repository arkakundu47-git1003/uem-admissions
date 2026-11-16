// Access-control and attack-surface tests. Needs TEST_MONGODB_URI (see docs/TESTING.md).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { PASSWORD, PDF, makeClient, mkApplication, setupWorld, teardown } from './helpers.js';

describe.skipIf(!process.env.TEST_MONGODB_URI)('security', () => {
  let w, as, aliceCs, aliceDraft;
  beforeAll(async () => {
    w = await setupWorld();
    as = makeClient(w.app, w.tokens);
    aliceCs = await mkApplication({ user: w.users.alice, course: w.courses.cs, status: 'submitted', docs: { idProof: 'pending' } });
    aliceDraft = await mkApplication({ user: w.users.alice, course: w.courses.me, status: 'draft' });
  });
  afterAll(teardown);

  describe('authentication', () => {
    it('protected endpoints reject anonymous requests with 401', async () => {
      for (const p of ['/auth/me', '/applications/mine', '/review/applications', '/admin/users', '/notifications', '/reports/overview', '/reports/applications.csv']) {
        expect((await as().get(p)).status, p).toBe(401);
      }
    });

    it('malformed, wrong-secret and expired tokens are rejected', async () => {
      const id = String(w.users.alice._id);
      const forged = jwt.sign({ sub: id, role: 'admin' }, 'attacker-secret');
      const expired = jwt.sign({ sub: id, role: 'applicant' }, env.JWT_ACCESS_SECRET, { expiresIn: -10 });
      const noneAlg = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, role: 'admin' })).toString('base64url')}.`;
      for (const t of ['garbage', forged, expired, noneAlg]) expect((await as(t).get('/auth/me')).status).toBe(401);
    });

    it('a token whose user is deactivated stops working immediately', async () => {
      const temp = await User.create({ name: 'Temp', email: 'temp@test.com', password: PASSWORD, role: 'applicant', phone: '9876543210', dateOfBirth: new Date('2000-01-01') });
      const login = await request(w.app).post('/api/v1/auth/login').send({ email: 'temp@test.com', password: PASSWORD });
      expect((await as(login.body.accessToken).get('/auth/me')).status).toBe(200);
      await User.updateOne({ _id: temp._id }, { isActive: false });
      expect((await as(login.body.accessToken).get('/auth/me')).status).toBe(401);
      expect((await request(w.app).post('/api/v1/auth/login').send({ email: 'temp@test.com', password: PASSWORD })).status).toBe(403);
    });

    it('locks an account after 5 wrong passwords, even for the right password afterwards', async () => {
      await User.create({ name: 'Locky', email: 'locky@test.com', password: PASSWORD, role: 'applicant', phone: '9876543210', dateOfBirth: new Date('2000-01-01') });
      for (let i = 0; i < 5; i++) expect((await request(w.app).post('/api/v1/auth/login').send({ email: 'locky@test.com', password: 'WrongPass1' })).status).toBe(401);
      const ok = await request(w.app).post('/api/v1/auth/login').send({ email: 'locky@test.com', password: PASSWORD });
      expect(ok.status).toBe(423);
      expect(ok.body.accessToken).toBeUndefined();
    });

    it('NoSQL operator injection in login is rejected, not executed', async () => {
      for (const body of [{ email: { $ne: null }, password: { $ne: null } }, { email: 'alice@test.com', password: { $gt: '' } }, { email: { $regex: '.*' }, password: 'x' }]) {
        const r = await request(w.app).post('/api/v1/auth/login').send(body);
        expect(r.status).toBe(422);
        expect(r.body.accessToken).toBeUndefined();
      }
    });

    it('passwords and hashes never appear in API responses', async () => {
      const reg = await request(w.app).post('/api/v1/auth/register').send({ name: 'Reggie', email: 'reggie@test.com', phone: '9876543210', dateOfBirth: '2000-05-15', password: 'RegPass123' });
      const outputs = [reg.text, (await as('alice').get('/auth/me')).text, (await as('admin').get('/admin/users')).text, (await request(w.app).post('/api/v1/auth/login').send({ email: 'alice@test.com', password: PASSWORD })).text];
      for (const o of outputs) {
        expect(o).not.toMatch(/\$2[aby]\$/); // bcrypt hash
        expect(o).not.toContain('RegPass123');
        expect(o).not.toMatch(/"password"/);
        expect(o).not.toMatch(/resetTokenHash|tokenVersion|failedLogins/);
      }
    });

    it('registration cannot choose a role (mass assignment)', async () => {
      const r = await request(w.app).post('/api/v1/auth/register').send({ name: 'Sneaky', email: 'sneaky@test.com', phone: '9876543210', dateOfBirth: '2000-05-15', password: 'Sneaky123', role: 'admin', isActive: true, department: 'Computer Science' });
      expect(r.status).toBe(201);
      expect(r.body.user.role).toBe('applicant');
    });

    it('refresh cookie is HttpOnly and is useless after sign-out-everywhere', async () => {
      const login = await request(w.app).post('/api/v1/auth/login').send({ email: 'bob@test.com', password: PASSWORD });
      const cookie = login.headers['set-cookie'].find((c) => c.startsWith('refresh_token='));
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
      expect((await request(w.app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(200);
      await as(login.body.accessToken).post('/auth/logout-all');
      expect((await request(w.app).post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
      expect((await request(w.app).post('/api/v1/auth/refresh')).status).toBe(401);
    });
  });

  describe('role permissions', () => {
    it('applicants cannot use staff or admin endpoints', async () => {
      for (const [m, p] of [['get', '/review/applications'], ['get', '/reports/overview'], ['get', '/reports/applications.csv'], ['get', '/admin/users'], ['post', '/courses'], ['post', '/announcements']]) {
        expect((await as('alice')[m](p)).status, `${m} ${p}`).toBe(403);
      }
    });
    it('officers and coordinators cannot administer programmes or users', async () => {
      for (const who of ['officer', 'csCoord']) {
        for (const [m, p] of [['get', '/admin/users'], ['post', '/courses'], ['post', '/announcements'], ['post', `/admin/users/${w.users.bob._id}/reset-password`]]) {
          expect((await as(who)[m](p)).status, `${who} ${m} ${p}`).toBe(403);
        }
      }
    });
    it('staff cannot act as applicants', async () => {
      for (const who of ['officer', 'csCoord', 'admin']) {
        expect((await as(who).post('/applications').send({ courseId: String(w.courses.cs._id) })).status, who).toBe(403);
        expect((await as(who).get('/applications/mine')).status, who).toBe(403);
      }
    });
    it('an admin cannot change their own role or status', async () => {
      expect((await as('admin').patch(`/admin/users/${w.users.admin._id}`).send({ role: 'applicant' })).status).toBe(409);
    });
  });

  describe("one applicant cannot reach another applicant's data", () => {
    it('Bob gets 404 (not 403, so existence is not revealed) for every action on Alice\'s application', async () => {
      const id = aliceCs._id;
      const doc = (await aliceCs.constructor.findById(id)).documents[0]._id;
      const attempts = [
        ['get', `/applications/${id}`], ['put', `/applications/${id}`, { statement: 'hijack' }], ['post', `/applications/${id}/submit`],
        ['post', `/applications/${id}/pay`, { method: 'upi' }], ['delete', `/applications/${id}/documents/${doc}`], ['get', `/applications/${id}/documents/${doc}/file`],
      ];
      for (const [m, p, body] of attempts) {
        const r = await as('bob')[m](p).send(body);
        expect(r.status, `${m} ${p}`).toBe(404);
      }
    });
    it("Bob cannot upload into Alice's application", async () => {
      const r = await as('bob').post(`/applications/${aliceDraft._id}/documents`).field('type', 'idProof').attach('file', PDF, { filename: 'x.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(404);
    });
    it('Alice still has her own access', async () => {
      expect((await as('alice').get(`/applications/${aliceCs._id}`)).status).toBe(200);
      expect((await as('alice').get('/applications/mine')).body.applications.length).toBeGreaterThanOrEqual(2);
      expect((await as('bob').get('/applications/mine')).body.applications).toHaveLength(0);
    });
    it('draft fields cannot be used to change status, owner or payment (mass assignment)', async () => {
      const r = await as('alice').put(`/applications/${aliceDraft._id}`).send({ statement: 'my statement', status: 'accepted', applicant: String(w.users.bob._id), payment: { status: 'paid' }, decision: { status: 'accepted' }, personal: { fullName: 'Alice Real' } });
      expect(r.status).toBe(200);
      const { Application } = await import('../src/models/Application.js');
      const fresh = await Application.findById(aliceDraft._id);
      expect(fresh.status).toBe('draft');
      expect(String(fresh.applicant)).toBe(String(w.users.alice._id));
      expect(fresh.payment.status).not.toBe('paid');
      expect(fresh.decision?.status).toBeUndefined();
      expect(fresh.statement).toBe('my statement');
      expect(fresh.personal.fullName).toBe('Alice Real');
    });
  });

  describe('staff see only what their role allows', () => {
    it('a coordinator sees their own department but not another one', async () => {
      const id = aliceCs._id;
      expect((await as('csCoord').get(`/applications/${id}`)).status).toBe(200);
      expect((await as('officer').get(`/applications/${id}`)).status).toBe(200);
      expect((await as('meCoord').get(`/applications/${id}`)).status).toBe(404);
      const doc = (await aliceCs.constructor.findById(id)).documents[0]._id;
      expect((await as('meCoord').get(`/applications/${id}/documents/${doc}/file`)).status).toBe(404);
    });
    it("a coordinator from another department cannot review or decide", async () => {
      const id = aliceCs._id;
      const doc = (await aliceCs.constructor.findById(id)).documents[0]._id;
      expect((await as('meCoord').patch(`/review/applications/${id}/status`).send({ status: 'under_review' })).status).toBe(404);
      expect((await as('meCoord').patch(`/review/applications/${id}/documents/${doc}`).send({ status: 'verified' })).status).toBe(404);
      expect((await as('meCoord').get('/review/applications')).body.items.map((a) => String(a._id))).not.toContain(String(id));
    });
    it('draft applications are invisible to staff', async () => {
      expect((await as('officer').patch(`/review/applications/${aliceDraft._id}/status`).send({ status: 'under_review' })).status).toBe(404);
      expect((await as('officer').get('/review/applications')).body.items.map((a) => String(a._id))).not.toContain(String(aliceDraft._id));
    });
  });

  describe('uploads', () => {
    it('rejects a wrong type, a fake PDF, an unrequested document type, and an oversized file', async () => {
      const up = (buf, name, mime, type = 'idProof') => as('alice').post(`/applications/${aliceDraft._id}/documents`).field('type', type).attach('file', buf, { filename: name, contentType: mime });
      expect((await up(Buffer.from('MZ\x90\x00 fake exe'), 'virus.exe', 'application/x-msdownload')).status).toBe(415);
      expect((await up(Buffer.from('<?php echo 1; ?>'), 'shell.pdf', 'application/pdf')).status).toBe(415); // right label, wrong content
      expect((await up(PDF, 'a.pdf', 'application/pdf', 'marksheet10')).status).toBe(422); // not required for this programme
      const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc((env.MAX_UPLOAD_MB + 1) * 1024 * 1024)]);
      expect((await up(big, 'big.pdf', 'application/pdf')).status).toBe(413);
      expect((await as('alice').post(`/applications/${aliceDraft._id}/documents`).field('type', 'idProof')).status).toBe(400); // no file
    });
    it('a stored file name cannot be used to reach other files (path traversal)', async () => {
      const r = await as('alice').post(`/applications/${aliceDraft._id}/documents`).field('type', 'idProof').attach('file', PDF, { filename: '../../../etc/passwd.pdf', contentType: 'application/pdf' });
      expect(r.status).toBe(201);
      const { Application } = await import('../src/models/Application.js');
      const stored = (await Application.findById(aliceDraft._id)).documents.find((d) => d.type === 'idProof');
      expect(stored.filename).toMatch(/^\d+-[0-9a-f]{16}\.pdf$/); // server-generated name only
    });
  });

  describe('transport and input hardening', () => {
    it('sends security headers and hides the framework', async () => {
      const r = await request(w.app).get('/health');
      expect(r.headers['x-powered-by']).toBeUndefined();
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(r.headers['strict-transport-security']).toBeTruthy();
    });
    it('CORS allows the configured frontend and refuses other origins', async () => {
      const good = await request(w.app).get('/health').set('Origin', env.CLIENT_ORIGIN.split(',')[0].trim());
      expect(good.headers['access-control-allow-origin']).toBe(env.CLIENT_ORIGIN.split(',')[0].trim());
      expect(good.headers['access-control-allow-credentials']).toBe('true');
      const evil = await request(w.app).get('/health').set('Origin', 'https://evil.example');
      expect(evil.headers['access-control-allow-origin']).toBeUndefined();
      expect(evil.status).toBe(403);
    });
    it('malformed identifiers give 4xx, never a 500, and unknown routes are JSON 404s', async () => {
      for (const p of ['/applications/not-an-id', '/review/applications/xyz/status']) {
        const r = await as(p.startsWith('/review') ? 'officer' : 'alice')[p.startsWith('/review') ? 'patch' : 'get'](p).send({ status: 'under_review' });
        expect(r.status, p).toBeGreaterThanOrEqual(400);
        expect(r.status, p).toBeLessThan(500);
      }
      const nf = await request(w.app).get('/api/v1/nope');
      expect(nf.status).toBe(404);
      expect(nf.headers['content-type']).toMatch(/json/);
    });
    it('oversized JSON bodies are refused', async () => {
      const r = await request(w.app).post('/api/v1/auth/login').send({ email: 'a@b.com', password: 'x'.repeat(2 * 1024 * 1024) });
      expect(r.status).toBe(413);
    });
    it('regex characters in search are treated as text, not as a pattern', async () => {
      const r = await as('officer').get('/review/applications?q=' + encodeURIComponent('(.*)+$['));
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(0);
    });
  });
});
