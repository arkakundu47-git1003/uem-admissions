// Deployment-safety checks that need no database.
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { assertSafeEnvironment, dbNameFromUri, looksLikeProductionDb } from '../src/config/db.js';
import { createApp } from '../src/app.js';
import { createPerformanceMonitor } from '../src/services/performance.js';

describe('database name helpers', () => {
  it('recognises production-looking names', () => {
    for (const n of ['admission_portal_prod', 'prod', 'portal-production', 'live_db', 'Admission_Portal_PROD']) expect(looksLikeProductionDb(n), n).toBe(true);
    for (const n of ['admission_portal_dev', 'admission_portal_test', 'portal_staging', 'product_catalog', 'productive', 'alive']) expect(looksLikeProductionDb(n), n).toBe(false);
  });
  it('reads the database name from a connection string', () => {
    expect(dbNameFromUri('mongodb+srv://u:p%40ss@cluster0.x.mongodb.net/admission_portal_dev?retryWrites=true')).toBe('admission_portal_dev');
    expect(dbNameFromUri('mongodb://127.0.0.1:27017/')).toBe('test');
    expect(dbNameFromUri('not a uri')).toBe('');
  });
});

describe('staging safety guard', () => {
  it('refuses a staging service that points at a production-looking database', () => {
    expect(() => assertSafeEnvironment({ appEnv: 'staging', uri: 'mongodb+srv://u:p@c.mongodb.net/admission_portal_prod' })).toThrow(/Refusing to start/);
    expect(() => assertSafeEnvironment({ appEnv: 'staging', uri: 'mongodb://h/portal_live' })).toThrow(/Refusing/);
  });
  it('allows staging on the dev database and production on the production database', () => {
    expect(() => assertSafeEnvironment({ appEnv: 'staging', uri: 'mongodb://h/admission_portal_dev' })).not.toThrow();
    expect(() => assertSafeEnvironment({ appEnv: 'production', uri: 'mongodb://h/admission_portal_prod' })).not.toThrow();
    expect(() => assertSafeEnvironment({ appEnv: 'development', uri: 'mongodb://h/admission_portal_prod' })).not.toThrow();
  });
});

describe('APP_ENV validation', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; vi.resetModules(); });
  const load = async (appEnv) => {
    vi.resetModules();
    process.env.NODE_ENV = 'test';
    if (appEnv === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = appEnv;
    return import('../src/config/env.js');
  };
  it('rejects a misspelled value instead of silently disabling the checks', async () => {
    await expect(load('prod')).rejects.toThrow(/APP_ENV must be one of/);
    await expect(load('Staging ')).rejects.toThrow(/APP_ENV/);
  });
  it('accepts the documented values and defaults sensibly', async () => {
    expect((await load('staging')).env.isStaging).toBe(true);
    expect((await load(undefined)).env.APP_ENV).toBe('development');
  });
  it('the performance log can be switched off', async () => {
    process.env.PERFORMANCE_LOG = 'off';
    expect((await load('development')).env.PERFORMANCE_LOG).toBe(false);
  });
});

describe('/health', () => {
  it('stays HTTP 200 but reports a missing database', async () => {
    const r = await request(createApp()).get('/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'degraded', db: 'disconnected' });
    expect(r.body.appEnv).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toMatch(/mongodb|password|secret/i);
  });
});

describe('performance log labels', () => {
  it('groups requests that never reached a route by status, not in one bucket', () => {
    const monitor = createPerformanceMonitor({ logger: () => {} });
    for (const code of [401, 403, 429, 404]) {
      const res = new EventEmitter();
      res.statusCode = code; res.writableFinished = true;
      monitor.middleware({ method: 'POST', baseUrl: '', originalUrl: '/api/v1/auth/login?x=secret' }, res, () => res.emit('finish'));
    }
    const out = monitor.flush();
    monitor.stop();
    expect(out.http.map((h) => h.route).sort()).toEqual(['POST <unmatched 401>', 'POST <unmatched 403>', 'POST <unmatched 404>', 'POST <unmatched 429>']);
    expect(JSON.stringify(out)).not.toContain('secret');
  });
});
