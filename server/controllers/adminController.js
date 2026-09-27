const asyncHandler = require('express-async-handler');
const Application = require('../models/Application');
const { notify } = require('../services/notify');

const VALID_STATUSES = Application.STATUSES;

// GET /api/admin/stats
const getStats = asyncHandler(async (req, res) => {
  const counts = await Application.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const stats = { total: 0 };
  VALID_STATUSES.forEach((s) => (stats[s] = 0));
  counts.forEach((c) => {
    if (c._id) stats[c._id] = c.count;
    stats.total += c.count;
  });
  res.json({ success: true, stats });
});

// GET /api/admin/applications?status=&search=
const listAllApplications = asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (req.user.role === 'FACULTY_COORDINATOR' && req.user.department) {
    const departmentCourses = await require('../models/Course').find({ department: req.user.department }).select('_id');
    filter.courseId = { $in: departmentCourses.map((c) => c._id) };
  }

  let query = Application.find(filter)
    .populate('studentId', 'name email')
    .populate('courseId', 'name department')
    .sort({ createdAt: -1 });

  let applications = await query;

  if (search) {
    const s = search.toLowerCase();
    applications = applications.filter(
      (a) =>
        a.applicationNumber?.toLowerCase().includes(s) ||
        a.studentId?.name?.toLowerCase().includes(s) ||
        a.courseId?.name?.toLowerCase().includes(s)
    );
  }

  res.json({ success: true, applications });
});

// PUT /api/admin/applications/:id/status  { status, reason }
const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;

  if (!VALID_STATUSES.includes(status)) {
    res.status(400);
    throw new Error(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  if (status === 'Rejected' && !reason) {
    res.status(400);
    throw new Error('A reason is required when rejecting an application');
  }

  const application = await Application.findById(req.params.id);
  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }

  application.status = status;
  application.reviewRemarks.push({
    remark: reason || `Status changed to ${status}`,
    reason,
    byUserId: req.user._id,
    status,
  });
  await application.save();

  const messages = {
    'Under Review': 'Your application is now under review.',
    Approved: 'Your application has been approved.',
    Rejected: `Your application was rejected. Reason: ${reason}`,
  };
  if (messages[status]) {
    await notify(application.studentId, `Application ${status}`, messages[status]);
  }

  res.json({ success: true, application });
});

module.exports = { getStats, listAllApplications, updateApplicationStatus };
