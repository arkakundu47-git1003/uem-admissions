#!/usr/bin/env node
// Load test for the NFRs: 100 concurrent users, 95% of requests answered in under 3 seconds.
// No dependencies (Node 18+ built-in fetch). Run it against STAGING, never against a live production database:
// it creates real accounts, applications and notifications (all marked "loadtest-"; review before cleanup).
//
//   node loadtest/loadtest.js --url https://your-staging.onrender.com --confirm your-staging.onrender.com
//
// Options (all optional):
//   --users 100        concurrent virtual users (NFR-5)
//   --duration 60      seconds each user keeps going after ramp-up
//   --ramp 20          seconds over which users are started
//   --think 1000       average pause between a user's actions, in ms (people do not click every millisecond)
//   --limit 3000       latency limit in ms for the p95 check (NFR-1)
//   --out results.json write the full numbers to a file
//   --submit           also fill and submit each user's application once
//   LOADTEST_STAFF_EMAIL / LOADTEST_STAFF_PASSWORD  (environment) adds a few officer sessions reading the review list
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const STAGING_HOST = 'uem-admissions-staging.onrender.com';

/* ---------- small pure helpers (unit-tested) ---------- */
export function isAuthorizedStagingTarget(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.host === STAGING_HOST
      && url.pathname === '/'
      && !url.search
      && !url.hash
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function summarize(samples) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const failed = samples.filter((s) => !s.ok).length;
  const statuses = {};
  for (const { status } of samples) statuses[status] = (statuses[status] ?? 0) + 1;
  return {
    count: samples.length,
    failed,
    errorRate: samples.length ? failed / samples.length : 0,
    statuses,
    timeouts: samples.filter((s) => s.timeout).length,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    p99: percentile(ms, 99),
    max: ms.at(-1) ?? 0,
    mean: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0,
  };
}

export function evaluate(samples, { limitMs = 3000, users = 100, peakActiveUsers = 0, maxErrorRate = 0.01 } = {}) {
  const all = summarize(samples);
  const checks = [
    { name: `95% of requests under ${limitMs} ms (NFR-1)`, ok: all.count > 0 && all.p95 < limitMs, detail: `p95 = ${all.p95} ms` },
    { name: `at least ${users} users active at once (NFR-5)`, ok: peakActiveUsers >= users, detail: `peak = ${peakActiveUsers} active users` },
    { name: `error rate under ${maxErrorRate * 100}%`, ok: all.errorRate < maxErrorRate, detail: `${(all.errorRate * 100).toFixed(2)}% of ${all.count} requests failed` },
  ];
  return { all, checks, pass: checks.every((c) => c.ok) };
}

export function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) o[key] = true;
    else { o[key] = next; i++; }
  }
  return o;
}

/* ---------- main ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (avg) => Math.round(avg * (0.5 + Math.random())); // 50%..150% of the average

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const base = String(a.url || '').replace(/\/+$/, '');
  if (!base) {
    console.error('Missing --url. Example: node loadtest/loadtest.js --url https://staging.example.com --confirm staging.example.com');
    process.exit(2);
  }
  if (!isAuthorizedStagingTarget(base)) {
    console.error(`Load tests are restricted to https://${STAGING_HOST}.`);
    process.exit(2);
  }
  const host = new URL(base).host;
  if (a.confirm !== host) {
    console.error(`This test creates accounts and applications on ${host}.\nIf that is a STAGING server with its own test database, repeat the command with:  --confirm ${host}`);
    process.exit(2);
  }
  const cfg = {
    users: Number(a.users || 100),
    duration: Number(a.duration || 60),
    ramp: Number(a.ramp || 20),
    think: Number(a.think || 1000),
    limit: Number(a.limit || 3000),
    submit: Boolean(a.submit),
  };
  if (![cfg.users, cfg.duration, cfg.ramp, cfg.think, cfg.limit].every(Number.isFinite)
    || cfg.users < 1 || cfg.duration < 1 || cfg.ramp < 0 || cfg.think < 0 || cfg.limit < 1) {
    console.error('Users, duration, and limit must be positive; ramp and think time cannot be negative.');
    process.exit(2);
  }
  const api = `${base}/api/v1`;
  const runId = randomBytes(3).toString('hex');
  const password = `Lt${randomBytes(6).toString('hex')}9A`;
  const samples = [];
  const errors = new Map();
  let activeUsers = 0;
  let peakActiveUsers = 0;

  async function call(name, method, path, { token, body, timeout = 30000, record = true } = {}) {
    const t0 = performance.now();
    let status = 0, data = null;
    let timedOut = false;
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    try {
      const res = await fetch(`${api}${path}`, {
        method,
        headers: {
          ...(!isFormData ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
        signal: AbortSignal.timeout(timeout),
      });
      status = res.status;
      data = await res.json().catch(() => null);
    } catch (e) {
      status = 0;
      timedOut = e.name === 'TimeoutError';
      data = { message: e.name === 'TimeoutError' ? 'timeout' : e.message };
    }
    const ms = Math.round(performance.now() - t0);
    const ok = status >= 200 && status < 400;
    if (record) {
      samples.push({ name, ms, ok, status, timeout: timedOut });
      if (!ok) errors.set(`${name} -> ${status || 'network'} ${data?.message ?? ''}`.trim(), (errors.get(`${name} -> ${status || 'network'} ${data?.message ?? ''}`.trim()) ?? 0) + 1);
    }
    return { ok, status, data, ms };
  }

  console.log(`Target ${base}\nPlan: ${cfg.users} users, ramp ${cfg.ramp}s, then ${cfg.duration}s of activity, think time ~${cfg.think} ms, limit ${cfg.limit} ms${cfg.submit ? ', including actual application submission' : ''}\n`);

  // Warm-up (not measured): a sleeping free-tier server can take a minute to wake up.
  process.stdout.write('Waking the server... ');
  const w0 = performance.now();
  let up = false;
  let health = null;
  for (let i = 0; i < 12 && !up; i++) {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    up = !!r?.ok;
    if (up) health = await r.json().catch(() => null);
    else await sleep(5000);
  }
  if (!up) { console.error('\nThe server did not respond to /health. Stopping.'); process.exit(2); }
  console.log(`ready after ${Math.round(performance.now() - w0)} ms`);
  // Second safety layer: the server itself says which deployment it is (older builds do not say, then only the host check applies).
  if (health?.appEnv === 'production') { console.error('The server reports APP_ENV=production. Refusing to load-test a production deployment.'); process.exit(2); }

  const courses = (await call('warmup', 'GET', '/courses?open=true', { record: false })).data?.courses ?? [];
  if (!courses.length) { console.error('No open programmes found on the target. Seed some first.'); process.exit(2); }

  const deadline = Date.now() + (cfg.ramp + cfg.duration) * 1000;
  let started = 0;
  let registerFailures = 0;

  async function submitApplication(token, appId, course, i) {
    const details = {
      personal: {
        fullName: `Load Tester ${i}`,
        dateOfBirth: '2001-02-03',
        gender: 'female',
        phone: '9876543210',
        address: '1 Load Test Road',
        city: 'Kolkata',
        state: 'West Bengal',
        pincode: '700091',
        guardianName: 'Load Test Guardian',
        guardianPhone: '9876543211',
      },
      academic: {
        board: 'CBSE',
        schoolName: 'Load Test School',
        passingYear: new Date().getFullYear() - 1,
        percentage: Math.min(100, Math.max(80, course.minPercentage || 0)),
      },
      statement: 'Staging performance test application.',
      step: 4,
    };

    const draft = await call('save draft', 'PUT', `/applications/${appId}`, { token, body: details });
    if (!draft.ok) return false;
    for (const type of course.requiredDocuments || []) {
      const form = new FormData();
      form.append('type', type);
      form.append('file', new Blob(['%PDF-1.4\n% staging performance test\n'], { type: 'application/pdf' }), `loadtest-${type}.pdf`);
      const upload = await call('document upload', 'POST', `/applications/${appId}/documents`, { token, body: form });
      if (!upload.ok) return false;
    }
    if (course.applicationFee > 0) {
      const payment = await call('application fee payment', 'POST', `/applications/${appId}/pay`, { token, body: { method: 'upi' } });
      if (!payment.ok) return false;
    }
    return (await call('application submission', 'POST', `/applications/${appId}/submit`, { token })).ok;
  }

  async function applicant(i) {
    await sleep((cfg.ramp * 1000 * i) / cfg.users);
    const email = `loadtest+${runId}-${i}@example.com`;
    const reg = await call('register', 'POST', '/auth/register', { body: { name: `Load Tester ${i}`, email, phone: '9876543210', dateOfBirth: '2001-02-03', password } });
    if (!reg.ok || !reg.data?.accessToken) { registerFailures++; return; }
    started++;
    activeUsers++;
    peakActiveUsers = Math.max(peakActiveUsers, activeUsers);
    const token = reg.data.accessToken;
    const course = courses[i % courses.length];
    let appId;
    try {
      let submissionAttempted = false;
      while (Date.now() < deadline) {
        // One realistic visit: look around, start an application, fill it in, check messages.
        await call('courses list', 'GET', '/courses?open=true', { token }); await sleep(jitter(cfg.think));
        await call('course detail', 'GET', `/courses/${course._id}`, { token }); await sleep(jitter(cfg.think));
        await call('session check', 'GET', '/auth/me', { token }); await sleep(jitter(cfg.think));
        if (!appId) {
          const r = await call('start application', 'POST', '/applications', { token, body: { courseId: course._id } });
          appId = r.data?.application?._id;
          await sleep(jitter(cfg.think));
        }
        if (appId && cfg.submit && !submissionAttempted) {
          submissionAttempted = true;
          await submitApplication(token, appId, course, i);
          await sleep(jitter(cfg.think));
        } else if (appId && !cfg.submit) {
          await call('save draft', 'PUT', `/applications/${appId}`, { token, body: { step: 1, personal: { fullName: `Load Tester ${i}`, gender: 'female', city: 'Kolkata', state: 'West Bengal', pincode: '700091' }, academic: { board: 'CBSE', passingYear: 2024, percentage: 80 } } });
          await sleep(jitter(cfg.think));
        }
        if (appId) {
          await call('application view', 'GET', `/applications/${appId}`, { token }); await sleep(jitter(cfg.think));
        }
        await call('my applications', 'GET', '/applications/mine', { token }); await sleep(jitter(cfg.think));
        await call('notifications', 'GET', '/notifications', { token }); await sleep(jitter(cfg.think));
      }
    } finally {
      activeUsers -= 1;
    }
  }

  async function staff(i) {
    const login = await call('staff login', 'POST', '/auth/login', { body: { email: process.env.LOADTEST_STAFF_EMAIL, password: process.env.LOADTEST_STAFF_PASSWORD } });
    if (!login.ok) return;
    const token = login.data.accessToken;
    while (Date.now() < deadline) {
      await call('staff: review list', 'GET', '/review/applications?limit=20', { token }); await sleep(jitter(cfg.think * 2));
      await call('staff: overview', 'GET', '/reports/overview', { token }); await sleep(jitter(cfg.think * 2));
    }
  }

  const jobs = Array.from({ length: cfg.users }, (_, i) => applicant(i));
  if (process.env.LOADTEST_STAFF_EMAIL && process.env.LOADTEST_STAFF_PASSWORD) jobs.push(...Array.from({ length: 3 }, (_, i) => staff(i)));
  const tick = setInterval(() => process.stdout.write(`\r${activeUsers} active (${started} registered), ${samples.length} requests so far   `), 2000);
  await Promise.all(jobs);
  clearInterval(tick);
  console.log(`\r${started} users registered; peak active users: ${peakActiveUsers}; ${samples.length} requests measured.${' '.repeat(20)}\n`);

  const verdict = evaluate(samples, { limitMs: cfg.limit, users: cfg.users, peakActiveUsers });
  const names = [...new Set(samples.map((s) => s.name))];
  console.log('Endpoint'.padEnd(29) + 'count'.padStart(7) + 'errors'.padStart(8) + 'timeouts'.padStart(10) + 'p50'.padStart(8) + 'p95'.padStart(8) + 'p99'.padStart(8) + 'max'.padStart(8) + '  statuses');
  for (const n of names) {
    const s = summarize(samples.filter((x) => x.name === n));
    const statuses = Object.entries(s.statuses).map(([status, count]) => `${status}:${count}`).join(',');
    console.log(n.padEnd(29) + String(s.count).padStart(7) + String(s.failed).padStart(8) + String(s.timeouts).padStart(10) + String(s.p50).padStart(8) + String(s.p95).padStart(8) + String(s.p99).padStart(8) + String(s.max).padStart(8) + `  ${statuses}`);
  }
  const t = verdict.all;
  const statuses = Object.entries(t.statuses).map(([status, count]) => `${status}:${count}`).join(',');
  console.log('ALL'.padEnd(29) + String(t.count).padStart(7) + String(t.failed).padStart(8) + String(t.timeouts).padStart(10) + String(t.p50).padStart(8) + String(t.p95).padStart(8) + String(t.p99).padStart(8) + String(t.max).padStart(8) + `  ${statuses}  (ms)\n`);
  if (registerFailures) console.log(`${registerFailures} users could not register.`);
  if (errors.size) { console.log('Errors seen:'); for (const [k, v] of errors) console.log(`  ${v} x ${k}`); console.log(); }
  if ([...errors.keys()].some((k) => k.includes('429'))) console.log('429 means a rate limiter answered. Check the intended policy and the cause; do not increase limits just to pass the benchmark.\n');
  for (const c of verdict.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  [${c.detail}]`);
  console.log(`\nRESULT: ${verdict.pass ? 'PASS' : 'FAIL'}\nTest accounts are named loadtest+${runId}-N@example.com. Review cleanup candidates before removing any test data.`);

  if (a.out) writeFileSync(a.out, JSON.stringify({ at: new Date().toISOString(), target: base, config: cfg, runId, usersRegistered: started, peakActiveUsers, summary: verdict.all, perEndpoint: Object.fromEntries(names.map((n) => [n, summarize(samples.filter((x) => x.name === n))])), checks: verdict.checks, pass: verdict.pass, errors: Object.fromEntries(errors) }, null, 2));
  process.exit(verdict.pass ? 0 : 1);
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
