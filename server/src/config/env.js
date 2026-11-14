import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';

function secret(name, devDefault) {
  const value = process.env[name];
  if (isProd) {
    if (!value || value.length < 32 || value.startsWith('change-me')) {
      throw new Error(`${name} must be set to a random string of at least 32 characters in production`);
    }
    return value;
  }
  return value || devDefault;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  isProd,
  PORT: Number(process.env.PORT || 5000),
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/admission_portal',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET', 'dev-access-secret-do-not-use-in-production'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET', 'dev-refresh-secret-do-not-use-in-production'),
  JWT_ACCESS_EXPIRES: process.env.JWT_ACCESS_EXPIRES || '15m',
  JWT_REFRESH_DAYS: Number(process.env.JWT_REFRESH_DAYS || 7),
  // Cookie flags: defaults suit a separately hosted HTTPS frontend in production.
  // Behind a same-origin proxy over plain HTTP (e.g. local Docker) set COOKIE_SECURE=false COOKIE_SAMESITE=lax.
  COOKIE_SECURE: (process.env.COOKIE_SECURE ?? String(isProd)) === 'true',
  COOKIE_SAMESITE: process.env.COOKIE_SAMESITE || (isProd ? 'none' : 'lax'),
  UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
  MAX_UPLOAD_MB: Number(process.env.MAX_UPLOAD_MB || 5),
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  MAIL_FROM: process.env.MAIL_FROM || 'IEM Admissions <admissions@example.edu>',
  SEED_PASSWORD: isProd
  ? (process.env.SEED_PASSWORD || '')
  : (process.env.SEED_PASSWORD || 'Portal@12345'),
};
