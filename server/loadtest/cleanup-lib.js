// Finds (and optionally removes) the data created by the load test. Only users named loadtest+<6 hex>-<n>@example.com
// (applicants) are considered, plus their applications, their notifications, the staff notifications that link to those
// applications, and the stored documents.
import { Application } from '../src/models/Application.js';
import { User } from '../src/models/User.js';
import { Notification } from '../src/models/Misc.js';
import { removeStored } from '../src/services/storage.js';

export const TEST_EMAIL = /^loadtest\+[0-9a-f]{6}-\d+@example\.com$/;

export async function cleanupLoadTestData({ apply = false } = {}) {
  const users = await User.find({ email: TEST_EMAIL, role: 'applicant' }).select('_id');
  const ids = users.map((u) => u._id);
  const apps = ids.length ? await Application.find({ applicant: { $in: ids } }) : [];
  const links = apps.flatMap((a) => [`/staff/applications/${a.id}`, `/applicant/applications/${a.id}`]);
  const notifFilter = { $or: [{ user: { $in: ids } }, { link: { $in: links } }] };
  const notifications = ids.length ? await Notification.countDocuments(notifFilter) : 0;
  const documents = apps.reduce((n, a) => n + a.documents.length, 0);
  const counts = { users: ids.length, applications: apps.length, documents, notifications };
  if (apply && ids.length) {
    for (const app of apps) for (const d of app.documents) await removeStored(d).catch(() => {});
    await Notification.deleteMany(notifFilter);
    await Application.deleteMany({ applicant: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
  }
  return { ...counts, applied: apply && ids.length > 0 };
}
