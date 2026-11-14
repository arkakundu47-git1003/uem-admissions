import { Router } from 'express';
import { z } from 'zod';
import { Application } from '../models/Application.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler, escapeRegex, pageParams } from '../utils/http.js';
import { DOC_TYPES, STATUSES, TRANSITIONS } from '../constants.js';
import { canViewApplication, courseScope } from '../services/access.js';
import { audit, notify } from '../services/notify.js';

const router = Router();
router.use(protect, authorize('officer', 'coordinator', 'admin'));

router.get(
  '/applications',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = pageParams(req.query);
    const filter = { status: { $ne: 'draft' } };
    if (STATUSES.includes(req.query.status) && req.query.status !== 'draft') filter.status = req.query.status;
    const scope = await courseScope(req.user);
    if (scope) filter.course = scope;
    if (req.query.course && /^[a-f\d]{24}$/i.test(req.query.course)) {
      filter.course = scope ? { $in: scope.$in.filter((id) => String(id) === req.query.course) } : req.query.course;
    }
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 60)), 'i');
      filter.$or = [{ applicationNo: rx }, { 'personal.fullName': rx }];
    }
    const sort = req.query.sort === 'oldest' ? { submittedAt: 1 } : { submittedAt: -1 };

    const [items, total] = await Promise.all([
      Application.find(filter)
        .populate('course', 'code name department level')
        .populate('applicant', 'name email')
        .select('applicationNo status submittedAt personal.fullName academic.percentage documents payment course applicant')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Application.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  }),
);

async function loadForReview(req) {
  const app = await Application.findById(req.params.id).populate('course').populate('applicant', 'name email');
  if (!app || app.status === 'draft' || !(await canViewApplication(req.user, app))) {
    throw new ApiError(404, 'Application not found');
  }
  return app;
}

const docReviewSchema = z
  .object({ status: z.enum(['verified', 'rejected']), remark: z.string().trim().max(300).optional() })
  .refine((v) => v.status !== 'rejected' || (v.remark && v.remark.length >= 3), {
    message: 'Tell the applicant what to fix',
    path: ['remark'],
  });

router.patch(
  '/applications/:id/documents/:docId',
  validate(docReviewSchema),
  asyncHandler(async (req, res) => {
    const app = await loadForReview(req);
    if (!['submitted', 'under_review'].includes(app.status)) {
      throw new ApiError(409, 'Documents can only be reviewed while the application is submitted or under review');
    }
    const doc = app.documents.id(req.params.docId);
    if (!doc) throw new ApiError(404, 'Document not found');
    doc.status = req.body.status;
    doc.remark = req.body.status === 'rejected' ? req.body.remark : undefined;
    doc.reviewedBy = req.user._id;
    doc.reviewedAt = new Date();
    if (app.status === 'submitted') {
      app.status = 'under_review';
      app.history.push({ status: 'under_review', note: 'Review started', by: req.user._id, byName: req.user.name });
    }
    await app.save();

    if (req.body.status === 'rejected') {
      await notify(app.applicant._id, {
        title: 'Document needs attention',
        message: `${DOC_TYPES[doc.type]} was not accepted: ${req.body.remark} Please upload a corrected file.`,
        type: 'warning',
        link: `/applicant/applications/${app.id}`,
      });
    }
    await audit(req.user, `document.${req.body.status}`, 'Application', app.id, { type: doc.type });
    res.json({ application: app });
  }),
);

const statusSchema = z.object({
  status: z.enum(['under_review', 'documents_verified', 'accepted', 'rejected', 'waitlisted']),
  remarks: z.string().trim().max(500).optional(),
});

const MESSAGES = {
  under_review: ['Application under review', 'An admission officer has started reviewing your application.', 'info'],
  documents_verified: ['Documents verified', 'All of your documents have been verified. A final decision will follow.', 'success'],
  accepted: ['Congratulations — you have been accepted!', 'Your admission offer is ready. Check your application for details.', 'success'],
  rejected: ['Application decision', 'We are unable to offer you admission for this course.', 'error'],
  waitlisted: ['You have been waitlisted', 'You are on the waiting list. We will update you if a seat becomes available.', 'warning'],
};

router.patch(
  '/applications/:id/status',
  validate(statusSchema),
  asyncHandler(async (req, res) => {
    const app = await loadForReview(req);
    const { status, remarks } = req.body;
    if (!TRANSITIONS[app.status]?.includes(status)) {
      throw new ApiError(409, `Cannot move an application from "${app.status}" to "${status}"`);
    }
    if (['rejected', 'waitlisted'].includes(status) && !remarks) {
      throw new ApiError(422, 'Add a remark explaining this decision', { remarks: 'A remark is required' });
    }
    const requiredDocs = app.course.requiredDocuments;
    const verified = (t) => app.documents.find((d) => d.type === t)?.status === 'verified';
    if (['documents_verified', 'accepted'].includes(status) && !requiredDocs.every(verified)) {
      throw new ApiError(409, 'Every required document must be verified first');
    }
    if (status === 'accepted') {
      const taken = await Application.countDocuments({ course: app.course._id, status: 'accepted' });
      if (taken >= app.course.seats) {
        throw new ApiError(409, `All ${app.course.seats} seats for ${app.course.code} are filled. Waitlist this applicant instead.`);
      }
    }

    app.status = status;
    app.history.push({ status, note: remarks, by: req.user._id, byName: req.user.name });
    if (['accepted', 'rejected', 'waitlisted'].includes(status)) {
      app.decision = { status, remarks, by: req.user._id, at: new Date() };
    }
    await app.save();

    const [title, base, type] = MESSAGES[status];
    await notify(app.applicant._id, {
      title,
      message: `${base} (${app.applicationNo}, ${app.course.code})${remarks ? ` Remarks: ${remarks}` : ''}`,
      type,
      link: `/applicant/applications/${app.id}`,
    });
    await audit(req.user, `application.${status}`, 'Application', app.id, { applicationNo: app.applicationNo });
    res.json({ application: app });
  }),
);

export default router;
