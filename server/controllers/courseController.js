const asyncHandler = require('express-async-handler');
const Course = require('../models/Course');

// GET /api/courses?search=&department=
const listCourses = asyncHandler(async (req, res) => {
  const { search, department } = req.query;
  const filter = {};
  if (search) filter.name = { $regex: search, $options: 'i' };
  if (department) filter.department = department;

  const courses = await Course.find(filter).sort({ name: 1 });
  res.json({ success: true, courses });
});

// GET /api/courses/:id
const getCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }
  res.json({ success: true, course });
});

// POST /api/admin/courses  (ADMIN only)
const createCourse = asyncHandler(async (req, res) => {
  const course = await Course.create(req.body);
  res.status(201).json({ success: true, course });
});

// PUT /api/admin/courses/:id  (ADMIN only)
const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }
  res.json({ success: true, course });
});

module.exports = { listCourses, getCourse, createCourse, updateCourse };
