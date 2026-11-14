import { Router } from 'express';
import { z } from 'zod';
import { Announcement, AuditLog, Notification } from '../models/Misc.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { audit } from '../services/notify.js';

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
});

announcements.post(
  '/',
  protect,
  authorize('admin'),
  validate(announcementSchema),
  asyncHandler(async (req, res) => {
    const item = await Announcement.create({ ...req.body, createdBy: req.user._id });
    await audit(req.user, 'announcement.create', 'Announcement', item.id, { title: item.title });
    res.status(201).json({ item });
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
