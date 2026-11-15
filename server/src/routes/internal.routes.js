import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { runReminders } from '../services/reminders.js';
import { audit } from '../services/notify.js';

// Called by an external scheduler (GitHub Actions / cron-job.org), not by browsers.
export const internal = Router();

const safeEqual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

internal.post(
  '/run-reminders',
  asyncHandler(async (req, res) => {
    if (!env.CRON_SECRET || env.CRON_SECRET.length < 24) throw new ApiError(404, 'Not found'); // disabled
    if (!safeEqual(req.get('x-cron-secret') || '', env.CRON_SECRET)) throw new ApiError(401, 'Invalid scheduler secret');
    const summary = await runReminders({ dryRun: req.query.dryRun === 'true' });
    if (!summary.dryRun) await audit(null, 'reminders.run', 'System', '', summary);
    console.log('[reminders]', JSON.stringify(summary));
    res.json(summary);
  }),
);
