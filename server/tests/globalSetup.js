// Runs once before the whole test run.
//  1. SAFETY: many tests call dropDatabase() on TEST_MONGODB_URI. Refuse to run if that name could be real data.
//  2. VISIBILITY: database tests skip themselves without TEST_MONGODB_URI, which can make "npm test" look greener than it is.
//     Say so out loud, and in CI (CI=true) treat it as a failure so nothing is silently skipped.
/** Database name from a MongoDB connection string, without ever printing the string itself. */
export function dbNameFromUri(value) {
  try {
    const path = new URL(value).pathname.replace(/^\//, '');
    return decodeURIComponent(path.split('/')[0] || '');
  } catch {
    return '';
  }
}

/** Test databases must be named like `..._test...` and must not look like production. */
export function isSafeTestDbName(name) {
  return /test/i.test(name) && !/(prod|production|live)/i.test(name);
}

export default function setup() {
  const uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    if (process.env.CI) {
      throw new Error('CI is set but TEST_MONGODB_URI is missing: the database tests would be skipped silently. Provide a MongoDB test database.');
    }
    console.warn('\n[tests] TEST_MONGODB_URI is not set: the database test files (about 70 tests) are SKIPPED. See docs/TESTING.md to run them.\n');
    return;
  }
  const name = dbNameFromUri(uri);
  if (!name) throw new Error('TEST_MONGODB_URI must include a database name, for example mongodb://127.0.0.1:27017/admission_portal_test');
  if (!isSafeTestDbName(name)) {
    throw new Error(`Refusing to run: TEST_MONGODB_URI points at database "${name}". Tests DELETE the whole database, so its name must contain "test" and must not contain "prod".`);
  }
  console.log(`\n[tests] Database tests will run against "${name}" (it will be wiped by the tests).\n`);
}
