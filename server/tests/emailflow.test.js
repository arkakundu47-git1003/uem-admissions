// End-to-end without mocks: forgot-password -> real mailer -> fake Resend HTTP server. Needs TEST_MONGODB_URI.
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { User } from '../src/models/User.js';

const URI = process.env.TEST_MONGODB_URI;
const KEY = 're_EndToEndSecretKey987654';

describe.skipIf(!URI)('forgot-password through the real HTTPS mailer', () => {
  let server, app; const received = []; const logs = [];
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
        received.push({ auth: req.headers.authorization, body: JSON.parse(b) });
        res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"1"}');
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    Object.assign(env, { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: KEY, RESEND_API_URL: `http://127.0.0.1:${server.address().port}/emails`, CLIENT_ORIGIN: 'https://uem-admissions-ten.vercel.app,http://localhost:5173' });
    for (const k of ['log', 'error', 'warn']) vi.spyOn(console, k).mockImplementation((...a) => logs.push(a.join(' ')));
    await mongoose.connect(URI); await mongoose.connection.dropDatabase(); await User.init(); app = createApp();
    await User.create({ name: 'Flow Tester', email: 'flow@test.com', password: 'FlowPass123' });
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); await new Promise((r) => server.close(r)); vi.restoreAllMocks(); });

  it('sends the reset link by HTTPS API, and the link completes a real reset', async () => {
    const r = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'flow@test.com' });
    expect(r.status).toBe(200);
    await vi.waitFor(() => expect(received).toHaveLength(1));
    expect(received[0].auth).toBe(`Bearer ${KEY}`);
    expect(received[0].body.to).toEqual(['flow@test.com']);
    const m = /https:\/\/uem-admissions-ten\.vercel\.app\/reset-password\?token=([0-9a-f]{64})/.exec(received[0].body.text);
    expect(m).toBeTruthy();
    const ok = await request(app).post('/api/v1/auth/reset-password').send({ token: m[1], password: 'BrandNew123' });
    expect(ok.status).toBe(200);
    expect((await request(app).post('/api/v1/auth/login').send({ email: 'flow@test.com', password: 'BrandNew123' })).status).toBe(200);
    const all = logs.join('\n');
    expect(all).not.toContain(KEY);
    expect(all).not.toContain(m[1]);
  });

  it('when the provider is down the API still answers 200 and logs a safe error', async () => {
    env.RESEND_API_URL = 'http://127.0.0.1:1/emails'; // nothing listening
    logs.length = 0;
    const r = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'flow@test.com' });
    expect(r.status).toBe(200);
    await vi.waitFor(() => expect(logs.join('')).toMatch(/\[email\] resend send failed/));
    expect(logs.join('\n')).not.toContain(KEY);
    expect(logs.join('\n')).not.toMatch(/[0-9a-f]{64}/);
  });
});
