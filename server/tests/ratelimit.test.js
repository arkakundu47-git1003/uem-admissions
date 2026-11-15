import { describe, expect, it } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { apiKey, bearerUserId, loginEmailLimiter } from '../src/middleware/rateLimits.js';

const token = (sub, secret = env.JWT_ACCESS_SECRET) => jwt.sign({ sub, role: 'applicant' }, secret);

describe('rate-limit keys', () => {
  it('keys signed-in traffic by user and anonymous traffic by IP', () => {
    expect(apiKey({ ip: '1.2.3.4', headers: { authorization: `Bearer ${token('abc')}` } })).toBe('u:abc');
    expect(apiKey({ ip: '1.2.3.4', headers: {} })).toBe('ip:1.2.3.4');
  });
  it('ignores forged tokens (falls back to IP)', () => {
    const forged = token('victim', 'attacker-secret');
    expect(bearerUserId({ headers: { authorization: `Bearer ${forged}` } })).toBeNull();
    expect(apiKey({ ip: '9.9.9.9', headers: { authorization: `Bearer ${forged}` } })).toBe('ip:9.9.9.9');
  });
});

describe('login limits', () => {
  it('per-IP login cap is 300, not the old 40, and other IPs are unaffected', async () => {
    const app = createApp();
    const bad = { email: 'not-an-email', password: 'x' }; // rejected by validation before any DB access
    for (let i = 0; i < 60; i++) {
      const r = await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '10.0.0.1').send(bad);
      expect(r.status).toBe(422); // old limiter would have returned 429 from the 41st
    }
    const other = await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '10.0.0.2').send(bad);
    expect(other.status).toBe(422);
  });

  it('per-email cap blocks guessing one account but not other accounts; successes are not counted', async () => {
    const app = express();
    app.use(express.json());
    app.post('/l', loginEmailLimiter, (req, res) => res.status(req.body.ok ? 200 : 401).json({}));
    for (let i = 0; i < 10; i++) await request(app).post('/l').send({ email: 'a@x.com' }).expect(401);
    await request(app).post('/l').send({ email: 'A@X.com ' }).expect(429); // same account, case/space-insensitive
    await request(app).post('/l').send({ email: 'b@x.com' }).expect(401);
    for (let i = 0; i < 15; i++) await request(app).post('/l').send({ email: 'c@x.com', ok: true }).expect(200);
  });
});
