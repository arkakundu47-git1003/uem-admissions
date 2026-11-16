#!/usr/bin/env node
// Load test for the NFRs: 100 concurrent users, 95% of requests answered in under 3 seconds.
// No dependencies (Node 18+ built-in fetch). Run it against STAGING, never against a live production database:
// it creates real accounts and draft applications (all marked "loadtest-"; remove them with `npm run loadtest:cleanup`).
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
//   LOADTEST_STAFF_EMAIL / LOADTEST_STAFF_PASSWORD  (environment) adds a few officer sessions reading the review list
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

/* ---------- small pure helpers (unit-tested) ---------- */
export function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function summarize(samples) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const failed = samples.filter((s) => !s.ok).length;
  return {
    count: samples.length,
    failed,
    errorRate: samples.length ? failed / samples.length : 0,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    p99: percentile(ms, 99),
    max: ms.at(-1) ?? 0,
    mean: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0,
  };
}

export function evaluate(samples, { limitMs = 3000, users = 100, usersStarted = users, maxErrorRate = 0.01 } = {}) {
  const all = summarize(samples);
  const checks = [
    { name: `95% of requests under ${limitMs} ms (NFR-1)`, ok: all.count > 0 && all.p95 < limitMs, detail: `p95 = ${all.p95} ms` },
    { name: `at least ${users} users active at once (NFR-5)`, ok: usersStarted >= users, detail: `${usersStarted} users reached the portal` },
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
  const host = new URL(base).host;
  if (a.confirm !== host) {
    console.error(`This test creates accounts and applications on ${host}.\nIf that is a STAGING server with its own test database, repeat the command with:  --confirm ${host}`);
    process.exit(2);
  }
  const cfg = { users: Number(a.users || 100), duration: Number(a.duration || 60), ramp: Number(a.ramp || 20), think: Number(a.think || 1000), limit: Number(a.limit || 3000) };
  const api = `${base}/api/v1`;
  const runId = randomBytes(3).toString('hex');
  const password = `Lt${randomBytes(6).toString('hex')}9A`;
  const samples = [];
  const errors = new Map();

  async function call(name, method, path, { token, body, timeout = 30000, record = true } = {}) {
    const t0 = performance.now();
    let status = 0, data = null;
    try {
      const res = await fetch(`${api}${path}`, {
        method,
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout),
      });
      status = res.status;
      data = await res.json().catch(() => null);
    } catch (e) {
      status = 0;
      data = { message: e.name === 'TimeoutError' ? 'timeout' : e.message };
    }
    const ms = Math.round(performance.now() - t0);
    const ok = status >= 200 && status < 400;
    if (record) {
      samples.push({ name, ms, ok, status });
      if (!ok) errors.set(`${name} -> ${status || 'network'} ${data?.message ?? ''}`.trim(), (errors.get(`${name} -> ${status || 'network'} ${data?.message ?? ''}`.trim()) ?? 0) + 1);
    }
    return { ok, status, data, ms };
  }

  console.log(`Target ${base}\nPlan: ${cfg.users} users, ramp ${cfg.ramp}s, then ${cfg.duration}s of activity, think time ~${cfg.think} ms, limit ${cfg.limit} ms\n`);

  // Warm-up (not measured): a sleeping free-tier server can take a minute to wake up.
  process.stdout.write('Waking the server... ');
  const w0 = performance.now();
  let up = false;
  for (let i = 0; i < 12 && !up; i++) {
    const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(30000) }).catch(() => null);
    up = !!r?.ok;
    if (!up) await sleep(5000);
  }
  if (!up) { console.error('\nThe server did not respond to /health. Stopping.'); process.exit(2); }
  console.log(`ready after ${Math.round(performance.now() - w0)} ms`);

  const courses = (await call('warmup', 'GET', '/courses?open=true', { record: false })).data?.courses ?? [];
  if (!courses.length) { console.error('No open programmes found on the target. Seed some first.'); process.exit(2); }

  const deadline = Date.now() + (cfg.ramp + cfg.duration) * 1000;
  let started = 0;
  let registerFailures = 0;

  async function applicant(i) {
    await sleep((cfg.ramp * 1000 * i) / cfg.users);
    const email = `loadtest+${runId}-${i}@example.com`;
    const reg = await call('register', 'POST', '/auth/register', { body: { name: `Load Tester ${i}`, email, phone: '9876543210', dateOfBirth: '2001-02-03', password } });
    if (!reg.ok) { registerFailures++; return; }
    started++;
    const token = reg.data.accessToken;
    const course = courses[i % courses.length];
    let appId;
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
      if (appId) {
        await call('save draft', 'PUT', `/applications/${appId}`, { token, body: { step: 1, personal: { fullName: `Load Tester ${i}`, gender: 'female', city: 'Kolkata', state: 'West Bengal', pincode: '700091' }, academic: { board: 'CBSE', passingYear: 2024, percentage: 80 } } });
        await sleep(jitter(cfg.think));
        await call('application view', 'GET', `/applications/${appId}`, { token }); await sleep(jitter(cfg.think));
      }
      await call('my applications', 'GET', '/applications/mine', { token }); await sleep(jitter(cfg.think));
      await call('notifications', 'GET', '/notifications', { token }); await sleep(jitter(cfg.think));
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
  const tick = setInterval(() => process.stdout.write(`\r${started} users active, ${samples.length} requests so far   `), 2000);
  await Promise.all(jobs);
  clearInterval(tick);
  console.log(`\r${started} users took part, ${samples.length} requests measured.${' '.repeat(20)}\n`);

  const verdict = evaluate(samples, { limitMs: cfg.limit, users: cfg.users, usersStarted: started });
  const names = [...new Set(samples.map((s) => s.name))];
  console.log('Endpoint'.padEnd(24) + 'count'.padStart(7) + 'errors'.padStart(8) + 'p50'.padStart(8) + 'p95'.padStart(8) + 'p99'.padStart(8) + 'max'.padStart(8));
  for (const n of names) {
    const s = summarize(samples.filter((x) => x.name === n));
    console.log(n.padEnd(24) + String(s.count).padStart(7) + String(s.failed).padStart(8) + String(s.p50).padStart(8) + String(s.p95).padStart(8) + String(s.p99).padStart(8) + String(s.max).padStart(8));
  }
  const t = verdict.all;
  console.log('ALL'.padEnd(24) + String(t.count).padStart(7) + String(t.failed).padStart(8) + String(t.p50).padStart(8) + String(t.p95).padStart(8) + String(t.p99).padStart(8) + String(t.max).padStart(8) + '   (ms)\n');
  if (registerFailures) console.log(`${registerFailures} users could not register.`);
  if (errors.size) { console.log('Errors seen:'); for (const [k, v] of errors) console.log(`  ${v} x ${k}`); console.log(); }
  if ([...errors.keys()].some((k) => k.includes('429'))) console.log('429 means the rate limiter answered. On the staging server set RATE_LIMIT_SCALE (for example 5) and run again.\n');
  for (const c of verdict.checks) console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}  [${c.detail}]`);
  console.log(`\nRESULT: ${verdict.pass ? 'PASS' : 'FAIL'}\nTest accounts are named loadtest+${runId}-N@example.com. Remove them with: npm run loadtest:cleanup`);

  if (a.out) writeFileSync(a.out, JSON.stringify({ at: new Date().toISOString(), target: base, config: cfg, runId, summary: verdict.all, perEndpoint: Object.fromEntries(names.map((n) => [n, summarize(samples.filter((x) => x.name === n))])), checks: verdict.checks, pass: verdict.pass }, null, 2));
  process.exit(verdict.pass ? 0 : 1);
}

import { pathToFileURL } from 'node:url';
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
