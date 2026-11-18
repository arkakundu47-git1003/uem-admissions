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
import { env } from '../config/env.js';
import { BOM, csvRow } from '../utils/csv.js';
import { buildReviewFilter } from '../services/applicationFilter.js';
import { STATUSES } from '../constants.js';
import { lastIstDays } from '../utils/dates.js';
import { createResetLink, emailResetLink } from '../services/passwordReset.js';

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
    const current = await User.findById(req.params.id);
    if (!current) throw new ApiError(404, 'User not found');
    // A coordinator without a department would review nothing; refuse that state instead of storing it.
    const role = req.body.role ?? current.role;
    const department = req.body.department ?? current.department;
    if (role === 'coordinator' && !department) {
      throw new ApiError(422, 'Coordinators need a department', { department: 'Coordinators need a department' });
    }
    current.set(req.body);
    const user = await current.save();
    if (req.body.isActive === false) await User.updateOne({ _id: user._id }, { $inc: { tokenVersion: 1 } });
    await audit(req.user, 'user.update', 'User', user.id, req.body);
    res.json({ user });
  }),
);

// Admin sends a reset link to a user (they never see or choose the user's password).
// If no mail server is configured the link is returned so the admin can pass it on securely.
admin.post(
  '/users/:id/reset-password',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new ApiError(404, 'User not found');
    if (!user.isActive) throw new ApiError(409, 'Reactivate this account before resetting its password');
    const url = await createResetLink(user);
    const emailed = await emailResetLink(user, url);
    await audit(req.user, 'user.reset_password', 'User', user.id, { emailed });
    res.json({ emailed, ...(emailed ? {} : { resetUrl: url }) }); // link shown only if the email could not be sent
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
    const { keys: dayKeys, start: since } = lastIstDays(14);

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
    const series = dayKeys.map((key) => ({ date: key, count: dailyMap[key] || 0 }));

    res.json({
      totals: { applications: totals[0], applicants: totals[1], openCourses: totals[2], pending: totals[3], accepted: totals[4] },
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      byCourse,
      daily: series,
    });
  }),
);

/* ---------------- CSV exports (same visibility rules as the review queue) ---------------- */
const ist = (d) => (d ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' }).format(d) : '');
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function csvHeaders(res, name) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${today()}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
}

// One row per submitted application the user is allowed to see. Filters: status, course, q, from, to (YYYY-MM-DD, IST).
reports.get(
  '/applications.csv',
  asyncHandler(async (req, res) => {
    const filter = await buildReviewFilter(req.user, req.query);
    for (const [key, op, edge] of [['from', '$gte', 'T00:00:00+05:30'], ['to', '$lte', 'T23:59:59.999+05:30']]) {
      if (req.query[key] === undefined) continue;
      if (!DAY_RE.test(req.query[key]) || Number.isNaN(Date.parse(`${req.query[key]}${edge}`))) throw new ApiError(422, `"${key}" must be a date like 2026-12-31`);
      filter.submittedAt = { ...filter.submittedAt, [op]: new Date(`${req.query[key]}${edge}`) };
    }
    const total = await Application.countDocuments(filter);
    if (total > env.EXPORT_MAX_ROWS) {
      throw new ApiError(413, `This export has ${total} rows, above the limit of ${env.EXPORT_MAX_ROWS}. Narrow it with a status, programme or date range.`);
    }
    csvHeaders(res, 'uem-applications');
    res.write(BOM);
    res.write(csvRow(['Application No', 'Applicant', 'Email', 'Phone', 'Programme code', 'Programme', 'Department', 'Level', 'Status', 'Submitted (IST)', 'Percentage', 'Documents required', 'Documents verified', 'Documents rejected', 'Payment', 'Decision date (IST)']));
    const cursor = Application.find(filter)
      .populate('course', 'code name department level requiredDocuments')
      .populate('applicant', 'name email')
      .select('applicationNo status submittedAt personal.fullName personal.phone academic.percentage documents payment decision.at course applicant')
      .sort({ submittedAt: -1 })
      .lean()
      .cursor();
    let rows = 0;
    for await (const a of cursor) {
      const docs = a.documents || [];
      res.write(csvRow([
        a.applicationNo, a.personal?.fullName || a.applicant?.name, a.applicant?.email, a.personal?.phone,
        a.course?.code, a.course?.name, a.course?.department, a.course?.level, a.status, ist(a.submittedAt), a.academic?.percentage,
        a.course?.requiredDocuments?.length ?? 0, docs.filter((d) => d.status === 'verified').length, docs.filter((d) => d.status === 'rejected').length,
        a.payment?.status, ist(a.decision?.at),
      ]));
      rows += 1;
    }
    res.end();
    audit(req.user, 'report.export', 'Application', '', { type: 'applications', rows, filters: { status: req.query.status, course: req.query.course, q: !!req.query.q, from: req.query.from, to: req.query.to } });
  }),
);

// One row per programme: seats and how many applications are at each stage.
reports.get(
  '/programmes.csv',
  asyncHandler(async (req, res) => {
    const scope = await courseScope(req.user);
    const courses = await Course.find(scope ? { _id: scope } : {}).sort({ code: 1 }).lean();
    const counts = await Application.aggregate([
      { $match: { status: { $ne: 'draft' }, course: { $in: courses.map((c) => c._id) } } },
      { $group: { _id: { course: '$course', status: '$status' }, n: { $sum: 1 } } },
    ]);
    const byCourse = new Map();
    for (const { _id, n } of counts) byCourse.set(String(_id.course), { ...byCourse.get(String(_id.course)), [_id.status]: n });
    const stages = STATUSES.filter((s) => s !== 'draft');
    csvHeaders(res, 'uem-programmes');
    res.write(BOM);
    res.write(csvRow(['Code', 'Programme', 'Department', 'Level', 'Seats', 'Deadline (IST)', 'Open', 'Applications received', ...stages.map((s) => s.replace('_', ' ')), 'Seats remaining']));
    for (const c of courses) {
      const m = byCourse.get(String(c._id)) || {};
      const received = stages.reduce((sum, s) => sum + (m[s] || 0), 0);
      res.write(csvRow([c.code, c.name, c.department, c.level, c.seats, ist(c.deadline), c.isOpen && c.deadline > new Date() ? 'yes' : 'no', received, ...stages.map((s) => m[s] || 0), Math.max(0, c.seats - (m.accepted || 0))]));
    }
    res.end();
    audit(req.user, 'report.export', 'Course', '', { type: 'programmes', rows: courses.length });
  }),
);
