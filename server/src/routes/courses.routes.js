import { Router } from 'express';
import { z } from 'zod';
import { Course } from '../models/Course.js';
import { Application } from '../models/Application.js';
import { protect, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { ApiError, asyncHandler, escapeRegex } from '../utils/http.js';
import { DOC_TYPES } from '../constants.js';
import { audit } from '../services/notify.js';

const router = Router();

const courseSchema = z.object({
  code: z.string().trim().min(2).max(20),
  name: z.string().trim().min(3).max(120),
  department: z.string().trim().min(2),
  level: z.enum(['UG', 'PG']),
  durationYears: z.coerce.number().min(1).max(6),
  seats: z.coerce.number().int().min(1),
  description: z.string().trim().min(10),
  eligibility: z.string().trim().min(5),
  minPercentage: z.coerce.number().min(0).max(100),
  requiredDocuments: z.array(z.enum(Object.keys(DOC_TYPES))).default([]),
  applicationFee: z.coerce.number().min(0).default(0),
  deadline: z.coerce.date(),
  isOpen: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.q) {
      const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 60)), 'i');
      filter.$or = [{ name: rx }, { code: rx }, { department: rx }, { tags: rx }];
    }
    if (req.query.department) filter.department = String(req.query.department);
    if (req.query.level === 'UG' || req.query.level === 'PG') filter.level = req.query.level;
    if (req.query.open === 'true') {
      filter.isOpen = true;
      filter.deadline = { $gt: new Date() };
    }
    const courses = await Course.find(filter).sort({ deadline: 1, name: 1 });
    const departments = await Course.distinct('department');
    res.json({ courses, departments: departments.sort() });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const course = await Course.findById(req.params.id);
    if (!course) throw new ApiError(404, 'Course not found');
    res.json({ course });
  }),
);

router.post(
  '/',
  protect,
  authorize('admin'),
  validate(courseSchema),
  asyncHandler(async (req, res) => {
    const course = await Course.create(req.body);
    await audit(req.user, 'course.create', 'Course', course.id, { code: course.code });
    res.status(201).json({ course });
  }),
);

router.put(
  '/:id',
  protect,
  authorize('admin'),
  validate(courseSchema),
  asyncHandler(async (req, res) => {
    const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!course) throw new ApiError(404, 'Course not found');
    await audit(req.user, 'course.update', 'Course', course.id, { code: course.code });
    res.json({ course });
  }),
);

router.delete(
  '/:id',
  protect,
  authorize('admin'),
  asyncHandler(async (req, res) => {
    if (await Application.exists({ course: req.params.id })) {
      throw new ApiError(409, 'This course already has applications. Close it instead of deleting it.');
    }
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) throw new ApiError(404, 'Course not found');
    await audit(req.user, 'course.delete', 'Course', course.id, { code: course.code });
    res.json({ message: 'Course deleted' });
  }),
);

export default router;
