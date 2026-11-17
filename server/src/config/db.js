
import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Detect database names that indicate development or testing.
 */
export function nonProductionDbName(name) {
  return /(^|[_-])(dev|development|test|testing|staging|local)([_-]|$)/i.test(
    String(name)
  );
}

/** Database names that look like production data. */
export function looksLikeProductionDb(name) {
  return /(^|[_-])(prod|production|live)([_-]|$)/i.test(String(name));
}

/** Database name inside a MongoDB connection string ('test' is the driver default when none is given). */
export function dbNameFromUri(uri) {
  try {
    const name = decodeURIComponent(new URL(String(uri)).pathname.replace(/^\//, ''));
    return name || 'test';
  } catch {
    return '';
  }
}

/**
 * Refuse to start a staging service that points at a production-looking database: staging is where load tests
 * create accounts and applications. Runs before any connection is made.
 */
export function assertSafeEnvironment({ appEnv = env.APP_ENV, uri = env.MONGODB_URI } = {}) {
  const name = dbNameFromUri(uri);
  if (appEnv === 'staging' && looksLikeProductionDb(name)) {
    throw new Error(
      `Refusing to start: APP_ENV=staging but the database "${name}" looks like production. Point staging at the dev database.`,
    );
  }
}

export async function connectDB(uri = env.MONGODB_URI, onClient) {
  assertSafeEnvironment({ uri });
  mongoose.set('strictQuery', true);

  const connecting = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 20,
    monitorCommands: true,
  });
  if (onClient && mongoose.connection.client) onClient(mongoose.connection.getClient());
  await connecting;

  console.log(
    `MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`
  );

  // Warn only when the actual production environment uses a
  // development, testing, staging, or local database.
  if (
    env.APP_ENV === 'production' &&
    nonProductionDbName(mongoose.connection.name)
  ) {
    console.warn(
      `[db] WARNING: production is using database "${mongoose.connection.name}", which looks like a dev/test database. Use a dedicated production database (see docs/DEPLOYMENT.md).`
    );
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
