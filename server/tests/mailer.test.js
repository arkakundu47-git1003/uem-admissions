import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { emailProvider, parseFrom, sendEmail } from '../src/services/mailer.js';

const KEY = 're_SuperSecretKey1234567890';
const TOKEN = 'a1b2c3d4'.repeat(8); // 64 hex chars, same shape as a reset token
const SNAP = { ...env };
let errors;

beforeEach(() => {
  Object.assign(env, { EMAIL_PROVIDER: '', RESEND_API_KEY: '', BREVO_API_KEY: '', SMTP_HOST: '', MAIL_FROM: 'UEM Admissions <noreply@uem.example>' });
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { Object.assign(env, SNAP); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('provider selection', () => {
  it('auto-detects resend > brevo > smtp > none, and honours EMAIL_PROVIDER', () => {
    expect(emailProvider()).toBe('none');
    env.SMTP_HOST = 'smtp.x.com'; expect(emailProvider()).toBe('smtp');
    env.BREVO_API_KEY = 'k'; expect(emailProvider()).toBe('brevo');
    env.RESEND_API_KEY = 'k'; expect(emailProvider()).toBe('resend');
    env.EMAIL_PROVIDER = 'smtp'; expect(emailProvider()).toBe('smtp');
    env.EMAIL_PROVIDER = 'none'; expect(emailProvider()).toBe('none');
  });
  it('parses MAIL_FROM', () => {
    expect(parseFrom('UEM Admissions <a@b.com>')).toEqual({ name: 'UEM Admissions', email: 'a@b.com' });
    expect(parseFrom('a@b.com')).toEqual({ name: '', email: 'a@b.com' });
  });
});

describe('resend over HTTPS', () => {
  it('posts the documented request and returns true on 200', async () => {
    env.RESEND_API_KEY = KEY;
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'abc' }) });
    vi.stubGlobal('fetch', f);
    expect(await sendEmail('user@x.com', 'Subject', `link?token=${TOKEN}`)).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init.body)).toEqual({ from: 'UEM Admissions <noreply@uem.example>', to: ['user@x.com'], subject: 'Subject', text: `link?token=${TOKEN}` });
    expect(init.signal).toBeDefined(); // timeout is set
  });

  it('403 returns false with a helpful hint and leaks no key, token or full address', async () => {
    env.RESEND_API_KEY = KEY;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({ message: `You can only send testing emails to your own email address (key ${KEY}, token=${TOKEN})` }) }));
    expect(await sendEmail('student@gmail.com', 'S', `x token=${TOKEN}`)).toBe(false);
    const log = errors.join('\n');
    expect(log).toMatch(/HTTP 403/);
    expect(log).toMatch(/verified|domain/i);
    expect(log).not.toContain(KEY);
    expect(log).not.toContain(TOKEN);
    expect(log).not.toContain('student@gmail.com');
    expect(log).toContain('s***@gmail.com');
  });

  it('401 hints at the key without printing it', async () => {
    env.RESEND_API_KEY = KEY;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ message: 'API key is invalid' }) }));
    expect(await sendEmail('a@b.com', 'S', 'x')).toBe(false);
    expect(errors.join('')).toMatch(/401.*API key rejected/);
    expect(errors.join('')).not.toContain(KEY);
  });

  it('network failure and timeout never throw', async () => {
    env.RESEND_API_KEY = KEY;
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('fetch failed'), { cause: { code: 'ENOTFOUND' } })));
    expect(await sendEmail('a@b.com', 'S', 'x')).toBe(false);
    expect(errors.join('')).toMatch(/ENOTFOUND/);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('t'), { name: 'TimeoutError' })));
    expect(await sendEmail('a@b.com', 'S', 'x')).toBe(false);
    expect(errors.join('')).toMatch(/no response within 10s/);
  });

  it('a non-JSON error body is handled', async () => {
    env.RESEND_API_KEY = KEY;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: async () => { throw new Error('not json'); } }));
    expect(await sendEmail('a@b.com', 'S', 'x')).toBe(false);
    expect(errors.join('')).toMatch(/HTTP 502/);
  });
});

describe('brevo over HTTPS', () => {
  it('uses api-key header and brevo payload shape', async () => {
    env.BREVO_API_KEY = 'xkeysib-secretsecretsecret';
    const f = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ messageId: 'm' }) });
    vi.stubGlobal('fetch', f);
    expect(await sendEmail('user@x.com', 'Subject', 'Body')).toBe(true);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe('xkeysib-secretsecretsecret');
    expect(JSON.parse(init.body)).toEqual({ sender: { name: 'UEM Admissions', email: 'noreply@uem.example' }, to: [{ email: 'user@x.com' }], subject: 'Subject', textContent: 'Body' });
  });
});

describe('real HTTP round trip (fake Resend server)', () => {
  it('actually sends headers/body over the wire and handles an error status', async () => {
    const seen = [];
    const server = http.createServer((req, res) => {
      let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
        seen.push({ auth: req.headers.authorization, ct: req.headers['content-type'], body: JSON.parse(b) });
        if (b.includes('reject')) { res.writeHead(422, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: 'Invalid `from` field' })); } else { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"x"}'); }
      });
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    env.RESEND_API_URL = `http://127.0.0.1:${server.address().port}/emails`;
    env.RESEND_API_KEY = KEY;
    expect(await sendEmail('u@x.com', 'Hi', 'hello')).toBe(true);
    expect(seen[0].auth).toBe(`Bearer ${KEY}`);
    expect(seen[0].ct).toMatch(/application\/json/);
    expect(seen[0].body.to).toEqual(['u@x.com']);
    expect(await sendEmail('u@x.com', 'reject', 'reject')).toBe(false);
    expect(errors.join('')).toMatch(/HTTP 422.*Invalid `from`.*MAIL_FROM/);
    await new Promise((r) => server.close(r));
  });
});

describe('smtp and none', () => {
  it('smtp timeout on Render is explained and does not throw', async () => {
    env.SMTP_HOST = '10.255.255.1'; env.SMTP_PORT = 587; // unroutable: connection cannot succeed
    const t = Date.now();
    expect(await sendEmail('a@b.com', 'S', 'x')).toBe(false);
    expect(Date.now() - t).toBeLessThan(15000);
    expect(errors.join('')).toMatch(/smtp send failed/);
  }, 20000);
  it('no provider: returns false', async () => {
    expect(await sendEmail('a@b.com', 'S', 'x')).toBe(false);
  });
});
