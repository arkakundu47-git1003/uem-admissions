const asyncHandler = require('express-async-handler');
const Application = require('../models/Application');

const listFacultyApplications = asyncHandler(async (req, res) => {
  const filter = { status: { $ne: 'Draft' } };
  const applications = await Application.find(filter)
    .populate('studentId', 'name email phone')
    .populate('courseId', 'name department degree')
    .sort({ createdAt: -1 });
  const scoped = req.user.department
    ? applications.filter((a) => a.courseId?.department === req.user.department)
    : applications;
  res.json({ success: true, applications: scoped });
});

module.exports = { listFacultyApplications };
