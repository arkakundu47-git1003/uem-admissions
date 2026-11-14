import { Router } from 'express';
import { z } from 'zod';
import { User } from '../models/User.js';
import { Course } from '../models/Course.js';
import { Application } from '../models/Application.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler, escapeRegex, pageParams } from '../utils/http.js';
import { courseScope } from '../services/access.js';
import { audit } from '../services/notify.js';

export const admin = Router();
admin.use(protect, authorize('admin'));

admin.get(
  '/users',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pageParams(req.query, 12);
    const filter = {};
    if (['applicant', 'officer', 'coordinator', 'admin'].includes(req.query.role)) filter.role = req.query.role;
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 60)), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const [items, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }),
);

const createStaffSchema = z
  .object({
    name: z.string().trim().min(2),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: z.string().min(8, 'Use at least 8 characters').regex(/[A-Z]/, 'Include an uppercase letter').regex(/\d/, 'Include a number'),
    role: z.enum(['officer', 'coordinator', 'admin']),
    department: z.string().trim().optional(),
  })
  .refine((v) => v.role !== 'coordinator' || v.department, { message: 'Coordinators need a department', path: ['department'] });

admin.post(
  '/users',
  validate(createStaffSchema),
  asyncHandler(async (req, res) => {
    if (await User.exists({ email: req.body.email })) throw new ApiError(409, 'Email already registered', { email: 'Email already registered' });
    const user = await User.create(req.body);
    await audit(req.user, 'user.create', 'User', user.id, { role: user.role });
    res.status(201).json({ user });
  }),
);

const updateUserSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['applicant', 'officer', 'coordinator', 'admin']).optional(),
  department: z.string().trim().optional(),
});

admin.patch(
  '/users/:id',
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    if (String(req.params.id) === String(req.user._id)) throw new ApiError(409, 'You cannot change your own role or status');
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!user) throw new ApiError(404, 'User not found');
    if (req.body.isActive === false) await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    await audit(req.user, 'user.update', 'User', user.id, req.body);
    res.json({ user });
  }),
);

/* ---------------- reports (all staff; coordinators are department-scoped) ---------------- */
export const reports = Router();
reports.use(protect, authorize('officer', 'coordinator', 'admin'));

reports.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const scope = await courseScope(req.user);
    const match = { status: { $ne: 'draft' }, ...(scope ? { course: scope } : {}) };
    const since = new Date(Date.now() - 13 * 24 * 3600 * 1000);
    since.setHours(0, 0, 0, 0);

    const [byStatus, byCourse, daily, totals] = await Promise.all([
      Application.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Application.aggregate([
        { $match: match },
        { $group: { _id: '$course', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 6 },
        { $lookup: { from: 'courses', localField: '_id', foreignField: '_id', as: 'course' } },
        { $unwind: '$course' },
        { $project: { _id: 0, code: '$course.code', name: '$course.name', count: 1, seats: '$course.seats' } },
      ]),
      Application.aggregate([
        { $match: { ...match, submittedAt: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt', timezone: 'Asia/Kolkata' } }, count: { $sum: 1 } } },
      ]),
      Promise.all([
        Application.countDocuments(match),
        req.user.role === 'admin' ? User.countDocuments({ role: 'applicant' }) : null,
        Course.countDocuments({ isOpen: true, deadline: { $gt: new Date() } }),
        Application.countDocuments({ ...match, status: { $in: ['submitted', 'under_review'] } }),
        Application.countDocuments({ ...match, status: 'accepted' }),
      ]),
    ]);

    // fill missing days so the chart has a continuous x-axis
    const dailyMap = Object.fromEntries(daily.map((d) => [d._id, d.count]));
    const series = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(since.getTime() + i * 24 * 3600 * 1000);
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
      return { date: key, count: dailyMap[key] || 0 };
    });

    res.json({
      totals: { applications: totals[0], applicants: totals[1], openCourses: totals[2], pending: totals[3], accepted: totals[4] },
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      byCourse,
      daily: series,
    });
  }),
);
