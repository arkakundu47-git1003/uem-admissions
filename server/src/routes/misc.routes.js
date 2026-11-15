import { Router } from 'express';
import { z } from 'zod';
import { Announcement, AuditLog, Notification } from '../models/Misc.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { audit } from '../services/notify.js';
import { User } from '../models/User.js';
import { sendEmail } from '../services/mailer.js';
import { env } from '../config/env.js';

/* ---------------- notifications (any signed-in user) ---------------- */
export const notifications = Router();
notifications.use(protect);

notifications.get(
  '/',
  asyncHandler(async (req, res) => {
    const [items, unread] = await Promise.all([
      Notification.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(50),
      Notification.countDocuments({ user: req.user._id, read: false }),
    ]);
    res.json({ items, unread });
  }),
);

notifications.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ message: 'All notifications marked as read' });
  }),
);

notifications.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const n = await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user._id }, { read: true }, { new: true });
    if (!n) throw new ApiError(404, 'Notification not found');
    res.json({ notification: n });
  }),
);

/* ---------------- announcements (public read, admin write) ---------------- */
export const announcements = Router();

announcements.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await Announcement.find().sort({ pinned: -1, createdAt: -1 }).limit(20);
    res.json({ items });
  }),
);

const announcementSchema = z.object({
  title: z.string().trim().min(3, 'Title is too short').max(120),
  body: z.string().trim().min(5, 'Write a short message').max(1000),
  pinned: z.boolean().default(false),
  emailApplicants: z.boolean().default(false), // in-app notification is always sent; email is opt-in
});

announcements.post(
  '/',
  protect,
  authorize('admin'),
  validate(announcementSchema),
  asyncHandler(async (req, res) => {
    const { emailApplicants, ...fields } = req.body;
    const item = await Announcement.create({ ...fields, createdBy: req.user._id });
    const applicants = await User.find({ role: 'applicant', isActive: true }).select('email').lean();
    if (applicants.length) {
      await Notification.insertMany(
        applicants.map((u) => ({ user: u._id, title: `Announcement: ${item.title}`, message: item.body, type: 'info', link: '/applicant' })),
        { ordered: false },
      );
    }
    const emailTargets = emailApplicants ? applicants.slice(0, env.ANNOUNCEMENT_EMAIL_MAX) : [];
    await audit(req.user, 'announcement.create', 'Announcement', item.id, {
      title: item.title,
      notified: applicants.length,
      emailed: emailTargets.length,
      emailSkipped: emailApplicants ? applicants.length - emailTargets.length : 0,
    });
    res.status(201).json({ item, notified: applicants.length, emailed: emailTargets.length, emailSkipped: emailApplicants ? applicants.length - emailTargets.length : 0 });
    // after responding: one email at a time so a provider rate limit is not hit
    (async () => { for (const u of emailTargets) await sendEmail(u.email, `UEM Admissions: ${item.title}`, `${item.body}\n\nSign in to the portal to see details.`); })().catch(() => {});
  }),
);

announcements.delete(
  '/:id',
  protect,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    const item = await Announcement.findByIdAndDelete(req.params.id);
    if (!item) throw new ApiError(404, 'Announcement not found');
    await audit(req.user, 'announcement.delete', 'Announcement', item.id, { title: item.title });
    res.json({ message: 'Announcement removed' });
  }),
);

/* ---------------- audit log (admin) ---------------- */
export const auditRoutes = Router();
auditRoutes.get(
  '/',
  protect,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    res.json({ items: await AuditLog.find().sort({ createdAt: -1 }).limit(100) });
  }),
);
