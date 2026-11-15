import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { emailEnabled, sendEmail } from './mailer.js';

export const RESET_MINUTES = 30;
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Create a single-use reset token (only its SHA-256 is stored) and the link the user opens. */
export async function createResetLink(user) {
  const token = crypto.randomBytes(32).toString('hex');
  await User.updateOne(
    { _id: user._id },
    { resetTokenHash: hash(token), resetTokenExpires: new Date(Date.now() + RESET_MINUTES * 60 * 1000) },
  );
  const origin = env.CLIENT_ORIGIN.split(',')[0].trim().replace(/\/$/, '');
  return `${origin}/reset-password?token=${token}`;
}

export async function emailResetLink(user, url) {
  return sendEmail(
    user.email,
    'Reset your UEM Admission Portal password',
    `Hello ${user.name},\n\nUse this link to choose a new password (valid for ${RESET_MINUTES} minutes, one use):\n${url}\n\n` +
      'If you did not ask for this, ignore this email: your password has not changed.',
  );
}

/** Find the user for a raw token if it is valid and unexpired. */
export const findByResetToken = (token) =>
  User.findOne({ resetTokenHash: hash(String(token)), resetTokenExpires: { $gt: new Date() } }).select(
    '+password +tokenVersion +resetTokenHash +resetTokenExpires',
  );

export { emailEnabled };
