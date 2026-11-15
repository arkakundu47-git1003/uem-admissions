import { sendEmail } from './mailer.js';
import { AuditLog, Notification } from '../models/Misc.js';
import { User } from '../models/User.js';

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
