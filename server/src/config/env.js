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
  RATE_LIMIT_SCALE: Number(process.env.RATE_LIMIT_SCALE || 1),
  STORAGE_DRIVER: process.env.STORAGE_DRIVER || 'local', // 'local' | 'gridfs'
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  // Email provider: 'resend' | 'brevo' | 'smtp' | 'none'. Empty = auto (Resend key, else Brevo key, else SMTP, else none).
  // Render free blocks outbound SMTP (ports 25/465/587), so use an HTTPS provider there.
  EMAIL_PROVIDER: (process.env.EMAIL_PROVIDER || '').toLowerCase(),
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  BREVO_API_KEY: process.env.BREVO_API_KEY || '',
  RESEND_API_URL: process.env.RESEND_API_URL || 'https://api.resend.com/emails', // override only for tests
  BREVO_API_URL: process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email', // override only for tests
  // Reminders: an external scheduler calls POST /api/v1/internal/run-reminders with header x-cron-secret.
  // Leave CRON_SECRET empty to disable the endpoint. Use 24+ random characters.
  CRON_SECRET: process.env.CRON_SECRET || '',
  REMINDER_MAX_PER_RUN: Number(process.env.REMINDER_MAX_PER_RUN || 150),
  ANNOUNCEMENT_EMAIL_MAX: Number(process.env.ANNOUNCEMENT_EMAIL_MAX || 150), // free email plans cap daily sends (Brevo: 300/day)
  EXPORT_MAX_ROWS: Number(process.env.EXPORT_MAX_ROWS || 10000),
  MAIL_FROM: process.env.MAIL_FROM || 'UEM Admissions <admissions@example.edu>',
  // No default on purpose: a default password in public source code is a published credential.
  SEED_PASSWORD: process.env.SEED_PASSWORD || '',
};
