import { env } from '../config/env.js';
import { Application } from '../models/Application.js';
import { ReminderLog } from '../models/Misc.js';
import { DOC_TYPES } from '../constants.js';
import { notify } from './notify.js';

const DAY = 24 * 3600 * 1000;
const fmt = (d) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(d);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Record that a reminder was sent. Returns false if it was already sent (duplicate key). */
async function claim(key) {
  try {
    await ReminderLog.create({ key });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

/** 7, 3 or 1: the closest "days left" milestone that has been reached; null if more than a week away. */
export function deadlineBucket(deadline, now) {
  const daysLeft = Math.ceil((deadline - now) / DAY);
  if (daysLeft < 1 || daysLeft > 7) return null; // deadline passed (or more than a week away)
  return daysLeft <= 1 ? 1 : daysLeft <= 3 ? 3 : 7;
}

export function problemDocuments(application) {
  const required = application.course.requiredDocuments || [];
  const byType = new Map(application.documents.map((d) => [d.type, d]));
  return {
    missing: required.filter((t) => !byType.has(t)),
    rejected: required.filter((t) => byType.get(t)?.status === 'rejected'),
  };
}

/**
 * Send due reminders. Safe to call as often as you like: each reminder is sent once.
 *  - draft application, course deadline in 7 / 3 / 1 days: "finish and submit"
 *  - submitted/under review with missing or rejected documents: nudge every 3 days (while the course deadline has not
 *    passed, or the application is still under review) for at most 30 days after submission
 * Options: now (testing), dryRun (count only, send and record nothing).
 */
export async function runReminders({ now = new Date(), dryRun = false, max = env.REMINDER_MAX_PER_RUN } = {}) {
  const summary = { deadline: 0, documents: 0, skippedLimit: 0, dryRun };
  const apps = await Application.find({ status: { $in: ['draft', 'submitted', 'under_review'] } })
    .populate('course', 'name code deadline isOpen requiredDocuments')
    .select('applicationNo applicant course status documents submittedAt');

  for (const a of apps) {
    const c = a.course;
    if (!c) continue;
    const todo = [];

    if (a.status === 'draft' && c.isOpen) {
      const bucket = deadlineBucket(c.deadline, now);
      if (bucket) {
        const { missing } = problemDocuments(a);
        const left = bucket === 1 ? 'less than a day' : `${plural(bucket, 'day')}`;
        todo.push({
          kind: 'deadline',
          key: `deadline:${a.id}:${bucket}`,
          payload: {
            title: `Deadline approaching: ${c.code}`,
            message: `Your application ${a.applicationNo} for ${c.name} is still a draft and the deadline (${fmt(c.deadline)}) is ${bucket === 1 ? 'within a day' : `${left} away`}.` +
              (missing.length ? ` ${plural(missing.length, 'required document')} still to upload.` : '') + ' Complete and submit it before the deadline.',
            type: 'warning',
            link: `/applicant/apply/${c.id}`, // continue the draft
          },
        });
      }
    }

    if (['submitted', 'under_review'].includes(a.status) && a.submittedAt && now - a.submittedAt < 30 * DAY) {
      const { missing, rejected } = problemDocuments(a);
      if (missing.length || rejected.length) {
        const bucket = Math.floor(now.getTime() / (3 * DAY));
        const names = (list) => list.map((t) => DOC_TYPES[t] || t).join(', ');
        todo.push({
          kind: 'documents',
          key: `docs:${a.id}:${bucket}`,
          payload: {
            title: `Documents needed: ${c.code}`,
            message: `Your application ${a.applicationNo} for ${c.name} needs attention.` +
              (rejected.length ? ` Rejected, please upload again: ${names(rejected)}.` : '') +
              (missing.length ? ` Missing: ${names(missing)}.` : '') + ' Upload them so the review can continue.',
            type: 'warning',
            link: `/applicant/applications/${a.id}`,
          },
        });
      }
    }

    for (const t of todo) {
      if (summary.deadline + summary.documents >= max) { summary.skippedLimit += 1; continue; }
      if (dryRun) {
        if (!(await ReminderLog.exists({ key: t.key }))) summary[t.kind] += 1;
        continue;
      }
      if (!(await claim(t.key))) continue; // already sent
      await notify(a.applicant, t.payload); // in-app + email (best effort, never throws)
      summary[t.kind] += 1;
    }
  }
  return summary;
}
