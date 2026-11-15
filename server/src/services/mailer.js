import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Sends email through an HTTPS API (Resend / Brevo) or SMTP. Never throws; resolves true only when the
// provider accepted the message. Logs say WHAT failed, never the API key, password, body or any reset link.
const TIMEOUT_MS = 10_000;

export function emailProvider() {
  const p = env.EMAIL_PROVIDER;
  if (p === 'none') return 'none';
  if (p === 'resend' || p === 'brevo' || p === 'smtp') return p;
  if (env.RESEND_API_KEY) return 'resend';
  if (env.BREVO_API_KEY) return 'brevo';
  if (env.SMTP_HOST) return 'smtp';
  return 'none';
}

export const emailEnabled = () => emailProvider() !== 'none';

/** "UEM Admissions <a@b.com>" -> { name, email } */
export function parseFrom(from) {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from || '');
  return m ? { name: m[1].trim(), email: m[2].trim() } : { name: '', email: String(from || '').trim() };
}

// Defence in depth: strip anything that looks like a secret or a reset token from text we log.
const redact = (s) => {
  let value = String(s ?? '')
    .replace(/re_[A-Za-z0-9_]{8,}/g, '[redacted-key]')
    .replace(/xkeysib-[A-Za-z0-9-]{8,}/g, '[redacted-key]')
    .replace(/https?:\/\/[^\s"'<>]*reset-password[^\s"'<>]*/gi, '[redacted-reset-url]')
    .replace(/\b[0-9a-f]{40,}\b/gi, '[redacted-token]')
    .replace(/token=[^\s&"]+/gi, 'token=[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (email) => maskEmail(email));
  for (const secret of [env.BREVO_API_KEY, env.RESEND_API_KEY, env.SMTP_PASS, env.JWT_ACCESS_SECRET, env.JWT_REFRESH_SECRET]) {
    if (secret) value = value.split(secret).join('[redacted-secret]');
  }
  return value.slice(0, 300);
};

export const maskEmail = (email) => String(email).replace(/^(.).*(@.*)$/, '$1***$2');

export function logEmailEvent(event, details = {}, level = 'info') {
  console[level]('[email]', JSON.stringify({ event, ...details }));
}

function fail(provider, to, detail, hint) {
  logEmailEvent('delivery_failed', {
    provider,
    recipient: maskEmail(to),
    error: redact(detail),
    ...(hint && { hint }),
  }, 'error');
  return false;
}

async function postJson(provider, url, headers, payload, to) {
  let res;
  logEmailEvent('api_request_initiated', { provider, recipient: maskEmail(to) });
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const detail = timedOut
      ? `no response within ${TIMEOUT_MS / 1000}s`
      : `network error${err?.cause?.code ? `: ${err.cause.code}` : ` (${err?.name || 'Error'})`}`;
    return fail(provider, to, detail);
  }
  logEmailEvent('api_response_received', { provider, recipient: maskEmail(to), status: res.status, ok: res.ok });
  if (res.ok) {
    logEmailEvent('provider_accepted', { provider, recipient: maskEmail(to), status: res.status });
    return true;
  }
  let msg = '';
  try {
    const body = await res.json();
    msg = body?.message || body?.error?.message || body?.error || '';
  } catch { /* non-JSON error body */ }
  const hints = {
    401: 'API key rejected: check the key value in Render',
    403: provider === 'resend' ? 'Resend only sends to your own account email until a domain is verified, and MAIL_FROM must use that domain' : 'sender or key not authorised: verify the sender in the provider dashboard',
    422: 'invalid request: check MAIL_FROM format and that its address/domain is verified with the provider',
    429: 'provider rate limit reached',
  };
  const senderHint = provider === 'brevo' && /sender.*(verif|valid|authori)/i.test(msg)
    ? 'Brevo rejected the sender: verify MAIL_FROM in the Brevo sender settings'
    : undefined;
  return fail(provider, to, `HTTP ${res.status} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, senderHint || hints[res.status]);
}

let transporter;
const smtp = () =>
  (transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  }));

export async function sendEmail(to, subject, text) {
  const provider = emailProvider();
  if (provider === 'none') {
    if (!env.isProd) console.log(`[email:simulated] to=${maskEmail(to)} subject="${subject}"`);
    else console.warn('[email] not sent: no email provider configured (set RESEND_API_KEY, BREVO_API_KEY or SMTP_HOST)');
    return false;
  }
  if (provider === 'resend') {
    if (!env.RESEND_API_KEY) return fail(provider, to, 'RESEND_API_KEY is not set');
    return postJson('resend', env.RESEND_API_URL, { Authorization: `Bearer ${env.RESEND_API_KEY}` }, { from: env.MAIL_FROM, to: [to], subject, text }, to);
  }
  if (provider === 'brevo') {
    if (!env.BREVO_API_KEY) return fail(provider, to, 'BREVO_API_KEY is not set');
    const sender = parseFrom(env.MAIL_FROM);
    return postJson('brevo', env.BREVO_API_URL, { 'api-key': env.BREVO_API_KEY }, { sender: { ...(sender.name && { name: sender.name }), email: sender.email }, to: [{ email: to }], subject, textContent: text }, to);
  }
  try {
    await smtp().sendMail({ from: env.MAIL_FROM, to, subject, text });
    return true;
  } catch (err) {
    const blocked = /timeout|ETIMEDOUT|ENETUNREACH|ECONNREFUSED/i.test(`${err.code} ${err.message}`);
    return fail('smtp', to, `${err.code || ''} ${err.message}`, blocked ? 'outbound SMTP is blocked on Render free services: use EMAIL_PROVIDER=resend or brevo (HTTPS)' : undefined);
  }
}
