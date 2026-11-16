
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

export async function connectDB(uri = env.MONGODB_URI) {
  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
    maxPoolSize: 20,
  });

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
