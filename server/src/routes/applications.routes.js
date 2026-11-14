import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { Application } from '../models/Application.js';
import { Course } from '../models/Course.js';
import { User } from '../models/User.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { upload, uploadRoot, hasValidSignature, removeFile } from '../middleware/upload.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { DOC_TYPES } from '../constants.js';
import { canViewApplication } from '../services/access.js';
import { notify, notifyMany } from '../services/notify.js';

const router = Router();
router.use(protect);

/* ---------- validation ---------- */
const blankToUndef = (v) => (v === '' || v === null ? undefined : v);
const optNum = (min, max) => z.preprocess(blankToUndef, z.coerce.number().min(min).max(max).optional());
const optDate = z.preprocess(blankToUndef, z.coerce.date().optional());
const optStr = (max = 200) => z.string().trim().max(max).optional();
const thisYear = new Date().getFullYear();

const draftSchema = z.object({
  step: z.number().int().min(0).max(4).optional(),
  statement: z.string().max(2000, 'Keep your statement under 2000 characters').optional(),
  personal: z
    .object({
      fullName: optStr(80),
      dateOfBirth: optDate,
      gender: z.enum(['male', 'female', 'other', '']).optional(),
      phone: optStr(15),
      address: optStr(300),
      city: optStr(60),
      state: optStr(60),
      pincode: z.string().trim().regex(/^(\d{6})?$/, 'Enter a 6-digit PIN code').optional(),
      guardianName: optStr(80),
      guardianPhone: optStr(15),
    })
    .optional(),
  academic: z
    .object({
      board: optStr(60),
      schoolName: optStr(120),
      passingYear: optNum(1990, thisYear + 1),
      percentage: optNum(0, 100),
      entranceExam: optStr(60),
      entranceScore: optNum(0, 1000),
    })
    .optional(),
});

const req_ = (label) => z.string({ required_error: `${label} is required` }).trim().min(1, `${label} is required`);
const completeSchema = z.object({
  personal: z.object({
    fullName: req_('Full name'),
    dateOfBirth: z.coerce.date({ required_error: 'Date of birth is required', invalid_type_error: 'Date of birth is required' }),
    gender: z.enum(['male', 'female', 'other'], { errorMap: () => ({ message: 'Select a gender' }) }),
    phone: req_('Phone'),
    address: req_('Address'),
    city: req_('City'),
    state: req_('State'),
    pincode: z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN code'),
    guardianName: req_('Guardian name'),
    guardianPhone: req_('Guardian phone'),
  }),
  academic: z.object({
    board: req_('Board'),
    schoolName: req_('School / college'),
    passingYear: z.coerce.number({ invalid_type_error: 'Passing year is required' }).int(),
    percentage: z.coerce.number({ invalid_type_error: 'Percentage is required' }).min(0).max(100),
  }),
});

/* ---------- helpers ---------- */
const genNumber = () => `IEM-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const populate = (q) => q.populate('course').populate('applicant', 'name email phone');
const stamp = (app, status, note, user) =>
  app.history.push({ status, note, by: user._id, byName: user.name, at: new Date() });

async function loadOwn(req, res, next) {
  try {
    const app = await Application.findById(req.params.id).populate('course');
    if (!app || String(app.applicant) !== String(req.user._id)) throw new ApiError(404, 'Application not found');
    req.application = app;
    next();
  } catch (err) {
    next(err);
  }
}

function requireDraft(app) {
  if (app.status !== 'draft') throw new ApiError(409, 'This application has already been submitted and can no longer be edited');
}

/* ---------- routes ---------- */
router.post(
  '/',
  authorize('applicant'),
  validate(z.object({ courseId: z.string().length(24) })),
  asyncHandler(async (req, res) => {
    const course = await Course.findById(req.body.courseId);
    if (!course) throw new ApiError(404, 'Course not found');
    const existing = await populate(Application.findOne({ applicant: req.user._id, course: course._id }));
    if (existing) return res.json({ application: existing, existing: true });
    if (!course.isOpenNow) throw new ApiError(409, 'Applications for this course are closed');

    const application = await Application.create({
      applicationNo: genNumber(),
      applicant: req.user._id,
      course: course._id,
      personal: { fullName: req.user.name, dateOfBirth: req.user.dateOfBirth, phone: req.user.phone },
      payment: { status: course.applicationFee > 0 ? 'unpaid' : 'not_required', amount: course.applicationFee },
      history: [{ status: 'draft', note: 'Application started', by: req.user._id, byName: req.user.name }],
    });
    res.status(201).json({ application: await populate(Application.findById(application._id)) });
  }),
);

router.get(
  '/mine',
  authorize('applicant'),
  asyncHandler(async (req, res) => {
    const applications = await Application.find({ applicant: req.user._id })
      .populate('course', 'code name department level deadline applicationFee requiredDocuments minPercentage')
      .sort({ updatedAt: -1 });
    res.json({ applications });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const app = await populate(Application.findById(req.params.id));
    if (!app || !(await canViewApplication(req.user, app))) throw new ApiError(404, 'Application not found');
    res.json({ application: app });
  }),
);

router.put(
  '/:id',
  authorize('applicant'),
  loadOwn,
  validate(draftSchema),
  asyncHandler(async (req, res) => {
    const app = req.application;
    requireDraft(app);
    const { personal, academic, statement, step } = req.body;
    if (personal) Object.assign(app.personal, personal);
    if (academic) Object.assign(app.academic, academic);
    if (statement !== undefined) app.statement = statement;
    if (step !== undefined) app.step = Math.max(app.step, step);
    await app.save();
    res.json({ application: app, savedAt: new Date() });
  }),
);

router.post(
  '/:id/documents',
  authorize('applicant'),
  loadOwn,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const app = req.application;
    const file = req.file;
    try {
      if (!file) throw new ApiError(400, 'Choose a file to upload');
      const type = req.body.type;
      if (!DOC_TYPES[type] || !app.course.requiredDocuments.includes(type)) {
        throw new ApiError(422, 'This document type is not required for the selected course');
      }
      if (!hasValidSignature(file.path, file.mimetype)) {
        throw new ApiError(415, 'The file content does not match its type. Upload a genuine PDF, JPG or PNG.');
      }
      const existing = app.documents.find((d) => d.type === type);
      const reuploadAfterReview =
        ['submitted', 'under_review'].includes(app.status) && (!existing || existing.status === 'rejected');
      if (app.status !== 'draft' && !reuploadAfterReview) {
        throw new ApiError(409, 'Documents can no longer be changed for this application');
      }
      if (existing) {
        removeFile(existing.filename);
        app.documents.pull(existing._id);
      }
      app.documents.push({
        type,
        originalName: file.originalname.slice(0, 120),
        filename: file.filename,
        mimeType: file.mimetype,
        size: file.size,
      });
      if (app.status !== 'draft') stamp(app, app.status, `Re-uploaded ${DOC_TYPES[type]}`, req.user);
      await app.save();
      res.status(201).json({ application: app });
    } catch (err) {
      if (file) removeFile(file.filename);
      throw err;
    }
  }),
);

router.delete(
  '/:id/documents/:docId',
  authorize('applicant'),
  loadOwn,
  asyncHandler(async (req, res) => {
    const app = req.application;
    requireDraft(app);
    const doc = app.documents.id(req.params.docId);
    if (!doc) throw new ApiError(404, 'Document not found');
    removeFile(doc.filename);
    app.documents.pull(doc._id);
    await app.save();
    res.json({ application: app });
  }),
);

// Authenticated file access (files are never served from a public static folder).
router.get(
  '/:id/documents/:docId/file',
  asyncHandler(async (req, res) => {
    const app = await Application.findById(req.params.id).populate('course', 'department');
    if (!app || !(await canViewApplication(req.user, app))) throw new ApiError(404, 'Document not found');
    const doc = app.documents.id(req.params.docId);
    if (!doc) throw new ApiError(404, 'Document not found');
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName || 'document')}"`);
    res.sendFile(path.join(uploadRoot, path.basename(doc.filename)));
  }),
);

// Simulated application-fee payment (swap with Razorpay/Stripe verification in production).
router.post(
  '/:id/pay',
  authorize('applicant'),
  loadOwn,
  validate(z.object({ method: z.enum(['upi', 'card', 'netbanking']) })),
  asyncHandler(async (req, res) => {
    const app = req.application;
    requireDraft(app);
    if (app.payment.status === 'not_required') throw new ApiError(409, 'No application fee is required for this course');
    if (app.payment.status === 'paid') throw new ApiError(409, 'The fee has already been paid');
    app.payment.status = 'paid';
    app.payment.method = req.body.method;
    app.payment.transactionId = `TEST-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
    app.payment.paidAt = new Date();
    await app.save();
    res.json({ application: app });
  }),
);

router.post(
  '/:id/submit',
  authorize('applicant'),
  loadOwn,
  asyncHandler(async (req, res) => {
    const app = req.application;
    requireDraft(app);
    const { course } = app;
    if (!course.isOpenNow) throw new ApiError(409, 'The deadline for this course has passed');

    const parsed = completeSchema.safeParse({ personal: app.personal.toObject(), academic: app.academic.toObject() });
    if (!parsed.success) {
      const fields = {};
      for (const i of parsed.error.issues) fields[i.path.join('.')] = i.message;
      throw new ApiError(422, 'Complete all required fields before submitting', fields);
    }
    if (app.academic.percentage < course.minPercentage) {
      throw new ApiError(
        422,
        `You do not meet the eligibility criteria: this course requires at least ${course.minPercentage}% (you entered ${app.academic.percentage}%).`,
        { 'academic.percentage': `Minimum ${course.minPercentage}% required` },
      );
    }
    const uploaded = new Set(app.documents.map((d) => d.type));
    const missing = course.requiredDocuments.filter((t) => !uploaded.has(t));
    if (missing.length) {
      throw new ApiError(422, `Upload the missing documents: ${missing.map((t) => DOC_TYPES[t]).join(', ')}`);
    }
    if (app.payment.status === 'unpaid') throw new ApiError(422, 'Pay the application fee before submitting');

    app.status = 'submitted';
    app.submittedAt = new Date();
    stamp(app, 'submitted', 'Application submitted', req.user);
    await app.save();

    await notify(req.user._id, {
      title: 'Application submitted',
      message: `Your application ${app.applicationNo} for ${course.name} was received. We'll notify you of every update.`,
      type: 'success',
      link: `/applicant/applications/${app.id}`,
    });
    const reviewers = await User.find({
      isActive: true,
      $or: [{ role: 'officer' }, { role: 'coordinator', department: course.department }],
    }).distinct('_id');
    await notifyMany(reviewers, {
      title: 'New application to review',
      message: `${app.personal.fullName} applied for ${course.code}.`,
      link: `/staff/applications/${app.id}`,
    });
    res.json({ application: app });
  }),
);

export default router;
