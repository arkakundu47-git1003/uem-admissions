const asyncHandler = require('express-async-handler');
const Application = require('../models/Application');
const Course = require('../models/Course');
const Document = require('../models/Document');
const { generateApplicationNumber } = require('../services/appNumber');
const { notify } = require('../services/notify');

const REQUIRED_DOC_COUNT_FALLBACK = ['Photograph', 'Class X Marksheet', 'Class XII Marksheet', 'Identity Document'];

// POST /api/applications  { courseId }
const createApplication = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  if (!courseId) {
    res.status(400);
    throw new Error('courseId is required');
  }

  const course = await Course.findById(courseId);
  if (!course) {
    res.status(404);
    throw new Error('Course not found');
  }

  // Reuse an existing draft for this course instead of creating duplicates
  let application = await Application.findOne({
    studentId: req.user._id,
    courseId,
    status: 'Draft',
  });

  if (!application) {
    application = await Application.create({
      studentId: req.user._id,
      courseId,
      currentStep: 1,
    });
  }

  res.status(201).json({ success: true, application });
});

// GET /api/applications/my
const getMyApplications = asyncHandler(async (req, res) => {
  const applications = await Application.find({ studentId: req.user._id })
    .populate('courseId', 'name department degree deadline')
    .sort({ createdAt: -1 });
  res.json({ success: true, applications });
});

// GET /api/applications/:id
const getApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id)
    .populate('courseId')
    .populate('studentId', 'name email phone');

  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }

  const isOwner = application.studentId._id.toString() === req.user._id.toString();
  const isStaff = ['ADMISSION_OFFICER', 'ADMIN'].includes(req.user.role);
  if (!isOwner && !isStaff) {
    res.status(403);
    throw new Error('Forbidden');
  }

  const documents = await Document.find({ applicationId: application._id });

  res.json({ success: true, application, documents });
});

// PUT /api/applications/:id  — updates step data; owner only; Draft only
const updateApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);
  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }
  if (application.studentId.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Forbidden');
  }
  if (application.status !== 'Draft') {
    res.status(400);
    throw new Error('Only draft applications can be edited');
  }

  const { personalInformation, academicInformation, courseId, currentStep } = req.body;

  if (personalInformation) application.personalInformation = personalInformation;
  if (courseId) application.courseId = courseId;
  if (currentStep) application.currentStep = currentStep;

  if (academicInformation) {
    application.academicInformation = academicInformation;

    // Backend performs the eligibility check — never trust the frontend (spec section 13)
    const course = await Course.findById(application.courseId);
    if (course && typeof academicInformation.classXIIPercentage === 'number') {
      const isEligible = academicInformation.classXIIPercentage >= course.minPercentage;
      application.eligibility = {
        isEligible,
        rule: `Class XII percentage >= ${course.minPercentage}%`,
        evaluatedAt: new Date(),
      };
    }
  }

  await application.save();
  res.json({ success: true, application });
});

// POST /api/applications/:id/submit
const submitApplication = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id).populate('courseId');
  if (!application) {
    res.status(404);
    throw new Error('Application not found');
  }
  if (application.studentId.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Forbidden');
  }
  if (application.status !== 'Draft') {
    res.status(400);
    throw new Error('Application has already been submitted');
  }
  if (!application.personalInformation?.fullName || !application.academicInformation?.classXIIPercentage) {
    res.status(400);
    throw new Error('Please complete personal and academic information before submitting');
  }
  if (application.eligibility?.isEligible === false) {
    res.status(400);
    throw new Error('This application does not meet the prototype eligibility criteria');
  }

  const requiredDocuments = application.courseId?.requiredDocuments?.length
    ? application.courseId.requiredDocuments
    : REQUIRED_DOC_COUNT_FALLBACK;
  const uploadedDocuments = await Document.find({ applicationId: application._id }, 'documentType');
  const uploadedTypes = new Set(uploadedDocuments.map((d) => d.documentType));
  const missing = requiredDocuments.filter((type) => !uploadedTypes.has(type));
  if (missing.length) {
    res.status(400);
    throw new Error(`Please upload all required documents. Missing: ${missing.join(', ')}`);
  }

  application.applicationNumber = await generateApplicationNumber();
  application.status = 'Submitted';
  application.currentStep = 5;
  application.submittedAt = new Date();
  await application.save();

  await notify(
    application.studentId,
    'Application submitted',
    `Your application ${application.applicationNumber} has been successfully submitted.`
  );

  res.json({ success: true, application });
});

module.exports = {
  createApplication,
  getMyApplications,
  getApplication,
  updateApplication,
  submitApplication,
};
