import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter;
function getTransporter() {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

export const emailEnabled = () => Boolean(env.SMTP_HOST);

/** Best-effort email. Returns true only if a mail server accepted the message. Never throws. */
export async function sendEmail(to, subject, text) {
  const t = getTransporter();
  if (!t) {
    if (!env.isProd) console.log(`[email:simulated] to=${to} subject="${subject}"`);
    return false;
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM, to, subject, text });
    return true;
  } catch (err) {
    console.error('Email failed:', err.message);
    return false;
  }
}
