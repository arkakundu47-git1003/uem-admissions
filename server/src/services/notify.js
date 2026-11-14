import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { AuditLog, Notification } from '../models/Misc.js';
import { User } from '../models/User.js';

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

async function sendEmail(to, subject, text) {
  const t = getTransporter();
  if (!t) {
    if (!env.isProd) console.log(`[email:simulated] to=${to} subject="${subject}"`);
    return;
  }
  try {
    await t.sendMail({ from: env.MAIL_FROM, to, subject, text });
  } catch (err) {
    console.error('Email failed:', err.message);
  }
}

/** Create an in-app notification and (best effort) an email. Never throws. */
export async function notify(userId, { title, message, type = 'info', link, email = true }) {
  try {
    await Notification.create({ user: userId, title, message, type, link });
    if (email) {
      const user = await User.findById(userId).select('email');
      if (user) sendEmail(user.email, title, message);
    }
  } catch (err) {
    console.error('Notification failed:', err.message);
  }
}

export async function notifyMany(userIds, payload) {
  await Promise.all(userIds.map((id) => notify(id, { ...payload, email: false })));
}

export async function audit(actor, action, entity, entityId, meta) {
  try {
    await AuditLog.create({ actor: actor?._id, actorName: actor?.name, action, entity, entityId: String(entityId ?? ''), meta });
  } catch (err) {
    console.error('Audit failed:', err.message);
  }
}
