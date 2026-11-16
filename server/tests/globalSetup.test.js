import { describe, expect, it, vi } from 'vitest';
import setup, { dbNameFromUri, isSafeTestDbName } from './globalSetup.js';

describe('test database safety guard', () => {
  it('reads the database name without needing credentials', () => {
    expect(dbNameFromUri('mongodb://127.0.0.1:27017/admission_portal_test')).toBe('admission_portal_test');
    expect(dbNameFromUri('mongodb+srv://user:p%40ss@cluster0.abc.mongodb.net/uem_test?retryWrites=true')).toBe('uem_test');
    expect(dbNameFromUri('mongodb://127.0.0.1:27017')).toBe('');
    expect(dbNameFromUri('not a uri')).toBe('');
  });

  it('accepts only names that say "test" and do not say prod', () => {
    for (const ok of ['admission_portal_test', 'uem_test_2', 'TEST', 'portal-ci-test']) expect(isSafeTestDbName(ok)).toBe(true);
    for (const bad of ['admission_portal_prod', 'admission_portal_dev', 'admission_portal', 'uem_production_test', 'live_test', '']) expect(isSafeTestDbName(bad)).toBe(false);
  });
});

describe('guard behaviour', () => {
  const withEnv = (env, fn) => {
    const saved = { TEST_MONGODB_URI: process.env.TEST_MONGODB_URI, CI: process.env.CI };
    for (const [k, v] of Object.entries(env)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      return fn({ log, warn });
    } finally {
      log.mockRestore(); warn.mockRestore();
      for (const [k, v] of Object.entries(saved)) (v === undefined ? delete process.env[k] : (process.env[k] = v));
    }
  };

  it('locally without a database: warns that DB tests are skipped, does not fail', () => {
    withEnv({ TEST_MONGODB_URI: undefined, CI: undefined }, ({ warn }) => {
      expect(() => setup()).not.toThrow();
      expect(warn.mock.calls.join('')).toMatch(/SKIPPED/);
    });
  });

  it('in CI without a database: fails, so tests are never silently skipped', () => {
    withEnv({ TEST_MONGODB_URI: undefined, CI: 'true' }, () => {
      expect(() => setup()).toThrow(/TEST_MONGODB_URI is missing/);
    });
  });

  it('refuses a production or development database', () => {
    for (const bad of ['mongodb://h/admission_portal_prod', 'mongodb://h/admission_portal_dev', 'mongodb+srv://u:p@c.mongodb.net/admission_portal?x=1']) {
      withEnv({ TEST_MONGODB_URI: bad }, () => expect(() => setup()).toThrow(/Refusing to run/));
    }
  });

  it('refuses a URI with no database name', () => {
    withEnv({ TEST_MONGODB_URI: 'mongodb://127.0.0.1:27017' }, () => expect(() => setup()).toThrow(/must include a database name/));
  });

  it('accepts a proper test database and never prints the credentials', () => {
    withEnv({ TEST_MONGODB_URI: 'mongodb+srv://tester:SuperSecret@c.mongodb.net/admission_portal_test?retryWrites=true' }, ({ log }) => {
      expect(() => setup()).not.toThrow();
      const out = log.mock.calls.join('');
      expect(out).toContain('admission_portal_test');
      expect(out).not.toContain('SuperSecret');
    });
  });

  it('error messages never include the connection string', () => {
    withEnv({ TEST_MONGODB_URI: 'mongodb+srv://tester:SuperSecret@c.mongodb.net/admission_portal_prod' }, () => {
      try { setup(); } catch (e) { expect(e.message).not.toContain('SuperSecret'); expect(e.message).not.toContain('tester'); }
    });
  });
});
